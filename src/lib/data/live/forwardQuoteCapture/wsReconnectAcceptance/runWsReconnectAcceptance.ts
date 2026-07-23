import { createHash, generateKeyPairSync } from "node:crypto";

import { runForwardQuoteCapture } from "../runForwardQuoteCapture";
import {
  createRunOutputPaths,
  type ForwardCaptureAppendStream,
} from "../jsonlForwardCaptureWriter";
import { parseCaptureRunStatus, TERMINAL_CAPTURE_RUN_STATES } from "../captureRunStatus";
import { resolveCaptureLockPath } from "../captureLock";
import type {
  ForwardQuoteCaptureConfig,
  ForwardQuoteCaptureIo,
} from "../forwardQuoteCaptureTypes";

import { evaluateWsReconnectAcceptance } from "./evaluateWsReconnectAcceptance";
import { ReconnectScriptedTransport } from "./reconnectScriptedTransport";
import type {
  ReconnectAuthAttemptIdentity,
  WsReconnectAcceptanceObserved,
  WsReconnectAcceptanceReport,
  WsReconnectAcceptanceScenario,
} from "./wsReconnectAcceptanceTypes";

export const RECONNECT_ACCEPTANCE_PRIMARY_MARKET_TICKER = "KXBTC15M-RECONNECT";
export const RECONNECT_ACCEPTANCE_ROLLOVER_MARKET_TICKER = "KXBTC15M-RECONNECTNEXT";
const ACCEPTANCE_API_KEY_ID = "ws-reconnect-acceptance-key-id";
const ACCEPTANCE_PRIVATE_KEY_PATH = "in-memory/reconnect-acceptance-ephemeral-key.pem";
const ACCEPTANCE_OUTPUT_DIR = "in-memory/reconnect-acceptance/forward-quotes";
const ACCEPTANCE_HTML_PATH =
  "in-memory/reconnect-acceptance/reports/forward-quote-capture.html";
const ACCEPTANCE_EPOCH_MS = Date.UTC(2026, 6, 22);
/** Advance wall clock by this much before a reconnect so RSA timestamps differ meaningfully. */
const RECONNECT_CLOCK_ADVANCE_MS = 56 * 60 * 1000;

let cachedEphemeralPem: string | null = null;

function ephemeralPrivateKeyPem(): string {
  if (cachedEphemeralPem === null) {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    cachedEphemeralPem = privateKey.export({ type: "pkcs8", format: "pem" }) as string;
  }
  return cachedEphemeralPem;
}

function toAuthIdentity(input: {
  timestamp: string;
  signature: string;
}): ReconnectAuthAttemptIdentity {
  return {
    timestamp: input.timestamp,
    signatureHashPrefix: createHash("sha256")
      .update(input.signature)
      .digest("hex")
      .slice(0, 16),
    signatureLast4: input.signature.slice(-4),
  };
}

function authAttemptsDistinct(
  identities: readonly ReconnectAuthAttemptIdentity[],
): boolean {
  if (identities.length < 2) {
    return false;
  }
  for (let i = 0; i < identities.length; i += 1) {
    for (let j = i + 1; j < identities.length; j += 1) {
      const a = identities[i]!;
      const b = identities[j]!;
      if (
        a.timestamp === b.timestamp
        || a.signatureHashPrefix === b.signatureHashPrefix
        || a.signatureLast4 === b.signatureLast4
      ) {
        return false;
      }
    }
  }
  return true;
}

function createAcceptanceAppendStream(input: {
  path: string;
  sink: (path: string, chunk: string) => void;
  events: string[];
}): ForwardCaptureAppendStream {
  return {
    write(chunk) {
      input.sink(input.path, chunk);
      return true;
    },
    onceDrain() {},
    onError() {},
    end() {
      input.events.push(`stream-drained:${input.path}`);
      return Promise.resolve();
    },
  };
}

/**
 * Runs the production capture orchestrator against a scripted reconnect
 * scenario with in-memory IO, ephemeral RSA credentials, and a controllable
 * wall clock. Installs process listeners for uncaughtException /
 * unhandledRejection for the duration of the run.
 */
export async function runWsReconnectAcceptance(options?: {
  scenario?: WsReconnectAcceptanceScenario;
}): Promise<WsReconnectAcceptanceReport> {
  const scenario = options?.scenario ?? "reconnect-success";
  const transcript: string[] = [];

  let uncaughtExceptionCount = 0;
  let unhandledRejectionCount = 0;
  const onUncaught = (): void => {
    uncaughtExceptionCount += 1;
  };
  const onUnhandled = (): void => {
    unhandledRejectionCount += 1;
  };
  process.on("uncaughtException", onUncaught);
  process.on("unhandledRejection", onUnhandled);

  try {
    const privateKeyPem = ephemeralPrivateKeyPem();

    const appended = new Map<string, string[]>();
    const written = new Map<string, string>();
    const intervals: Array<{ fn: () => void; ms: number }> = [];
    const orderedEvents: string[] = [];

    let nowMs = ACCEPTANCE_EPOCH_MS;
    let monotonicMs = 0;
    let reconnectClockAdvanced = false;

    const durationMinutes = 180;
    const durationMs = durationMinutes * 60_000;

    const wsRecoveryMaxAttempts =
      scenario === "second-attempt-success" ? 2 : 1;

    const transport = new ReconnectScriptedTransport({
      scenario,
      primaryMarketTicker: RECONNECT_ACCEPTANCE_PRIMARY_MARKET_TICKER,
      transcript,
      onBeforeReconnectConnect: () => {
        if (!reconnectClockAdvanced) {
          nowMs += RECONNECT_CLOCK_ADVANCE_MS;
          reconnectClockAdvanced = true;
          transcript.push(
            `advanced wall clock by ${RECONNECT_CLOCK_ADVANCE_MS}ms before reconnect auth`,
          );
        } else if (scenario === "second-attempt-success") {
          // Keep advancing between reconnect attempts so signatures/timestamps differ.
          nowMs += RECONNECT_CLOCK_ADVANCE_MS;
          transcript.push(
            `advanced wall clock by ${RECONNECT_CLOCK_ADVANCE_MS}ms before next reconnect attempt`,
          );
        }
      },
    });

    const config: ForwardQuoteCaptureConfig = {
      series: "KXBTC15M",
      durationMinutes,
      maxMarkets: 1,
      outputDir: ACCEPTANCE_OUTPUT_DIR,
      dryRun: false,
      marketTicker: RECONNECT_ACCEPTANCE_PRIMARY_MARKET_TICKER,
      privateKeyPath: ACCEPTANCE_PRIVATE_KEY_PATH,
      captureBtcSpot: false,
      rolloverCheckSeconds: 30,
      healthFlushSeconds: 60,
      topOfBookThrottleMs: 0,
      wsWatchdogEnabled: true,
      wsSoftSilenceThresholdMs: 30_000,
      wsHardStallThresholdMs: 60_000,
      wsProbeGraceMs: 10_000,
      wsRecoveryMaxAttempts,
      priceRepresentation: "legacy-no-leg",
    };

    const rolloverMarketsResponse = {
      markets: [
        {
          ticker: RECONNECT_ACCEPTANCE_ROLLOVER_MARKET_TICKER,
          title: "BTC next reconnect acceptance window",
          status: "active",
          open_time: "2026-07-19T00:00:00Z",
          close_time: "2027-01-01T00:00:00Z",
        },
      ],
    };
    const fetchImpl = (async (url: RequestInfo | URL) => {
      const isUnopened = String(url).includes("status=unopened");
      return new Response(
        JSON.stringify(isUnopened ? { markets: [] } : rolloverMarketsResponse),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const sink = (path: string, chunk: string): void => {
      appended.set(path, [...(appended.get(path) ?? []), chunk]);
    };

    const lockPath = resolveCaptureLockPath(ACCEPTANCE_OUTPUT_DIR);

    const io: ForwardQuoteCaptureIo = {
      readFile: (path: string) => {
        if (path === ACCEPTANCE_PRIVATE_KEY_PATH) {
          return privateKeyPem;
        }
        const contents = written.get(path);
        if (contents === undefined) {
          throw new Error(`ENOENT (in-memory reconnect acceptance io): ${path}`);
        }
        return contents;
      },
      writeFile: (path: string, data: string) => {
        written.set(path, data);
      },
      appendFile: (path: string, data: string) => {
        sink(path, data);
      },
      createAppendStream: (path: string) =>
        createAcceptanceAppendStream({
          path,
          sink,
          events: orderedEvents,
        }),
      renameFile: (from: string, to: string) => {
        const contents = written.get(from);
        if (contents === undefined) {
          throw new Error(
            `ENOENT rename source (in-memory reconnect acceptance io): ${from}`,
          );
        }
        written.delete(from);
        written.set(to, contents);
        if (to.endsWith("capture-run-status.json")) {
          const status = parseCaptureRunStatus(contents);
          if (status !== null && TERMINAL_CAPTURE_RUN_STATES.includes(status.state)) {
            orderedEvents.push(`terminal-status-published:${status.state}`);
          }
        }
      },
      createExclusiveFile: (path: string, data: string) => {
        if (written.has(path)) {
          throw new Error(`EEXIST (in-memory reconnect acceptance io): ${path}`);
        }
        written.set(path, data);
      },
      deleteFile: (path: string) => {
        written.delete(path);
      },
      mkdirSync: () => {},
      now: () => {
        nowMs += 1;
        return new Date(nowMs);
      },
      monotonicNowMs: () => {
        monotonicMs += 1;
        return monotonicMs;
      },
      fetchImpl,
      setInterval: (fn: () => void, ms: number) => {
        intervals.push({ fn, ms });
        return intervals.length;
      },
      clearInterval: () => {},
    };

    let pollCount = 0;
    let clockJumped = false;
    const lifecycleTextNow = (): string => {
      for (const [path, chunks] of appended) {
        if (path.endsWith("capture-lifecycle.jsonl")) {
          return chunks.join("");
        }
      }
      return "";
    };

    const shouldStop = (): boolean => {
      pollCount += 1;
      const lifecycle = lifecycleTextNow();

      if (!clockJumped) {
        const successSettled =
          (scenario === "reconnect-success" || scenario === "second-attempt-success")
          && lifecycle.includes("wsRecoverySucceeded");
        const failureSettled =
          (scenario === "reconnect-401-terminal" || scenario === "auth-generation-throw")
          && lifecycle.includes("wsRecoveryFailed");

        if (successSettled) {
          clockJumped = true;
          nowMs += durationMs + 60_000;
          transcript.push(
            "jumped clock past duration after successful reconnect recovery",
          );
        } else if (failureSettled) {
          // Do not jump past endAt — let watchdog.isTerminal end the run with
          // terminal-websocket-failure on the next loop body iteration.
          clockJumped = true;
          transcript.push(
            "reconnect failure settled; leaving duration clock alone so isTerminal can end the run",
          );
        } else if (pollCount >= 120) {
          clockJumped = true;
          nowMs += durationMs + 60_000;
          transcript.push("jumped clock past duration after reconnect poll fallback");
        }
      }
      return false;
    };

    const result = await runForwardQuoteCapture({
      config,
      io,
      htmlOutputPath: ACCEPTANCE_HTML_PATH,
      shouldStop,
      transport,
      forceReconnectAfterFirstValidTopOfBook: true,
      credentialEnv: {
        NODE_ENV: "test",
        KALSHI_API_KEY_ID: ACCEPTANCE_API_KEY_ID,
        KALSHI_WS_URL: "wss://ws-reconnect-acceptance.invalid/ws",
      },
    });
    transcript.push("capture finalized; writer streams ended; terminal status published");

    const healthReport = result.healthReport;
    const runPaths = createRunOutputPaths(config.outputDir, result.runId);

    const statusText = written.get(runPaths.captureRunStatusPath);
    const runStatus = statusText !== undefined ? parseCaptureRunStatus(statusText) : null;

    const authAttemptIdentities = transport.connectAttempts.map((attempt) =>
      toAuthIdentity({
        timestamp: attempt.timestamp,
        signature: attempt.signature,
      }),
    );

    const secretNeedles = [
      privateKeyPem.trim(),
      "PRIVATE KEY",
      "KALSHI-ACCESS",
      ACCEPTANCE_API_KEY_ID,
      ...transport.connectHeaderValues.filter((value) => value.length > 20),
      ...transport.connectAttempts.map((attempt) => attempt.signature).filter(Boolean),
    ];
    const credentialLeakArtifacts: string[] = [];
    const artifactTexts = new Map<string, string>();
    for (const [path, contents] of written) {
      artifactTexts.set(path, contents);
    }
    for (const [path, chunks] of appended) {
      artifactTexts.set(path, chunks.join(""));
    }
    for (const [path, text] of artifactTexts) {
      if (secretNeedles.some((needle) => needle.length > 0 && text.includes(needle))) {
        credentialLeakArtifacts.push(path);
      }
    }

    const connectionAttemptCount = Math.max(
      healthReport.connection.connectionAttemptCount,
      transport.connectCount,
    );
    const authHeaderGenerationCount = Math.max(
      healthReport.connection.authHeaderGenerationCount,
      transport.connectAttempts.length,
    );

    const observed: WsReconnectAcceptanceObserved = {
      runId: result.runId,
      runDir: runPaths.runDir,
      scenario,
      connectionAttemptCount,
      authHeaderGenerationCount,
      authAttemptIdentities,
      authAttemptsDistinct: authAttemptsDistinct(authAttemptIdentities),
      reconnectCount: healthReport.connection.reconnectCount,
      wsRecoverySuccessCount: healthReport.watchdog?.wsRecoverySuccessCount ?? 0,
      wsRecoveryFailureCount: healthReport.watchdog?.wsRecoveryFailureCount ?? 0,
      terminalWebSocketFailure:
        healthReport.watchdog?.terminalWebSocketFailure ?? false,
      captureEndReason:
        runStatus?.captureEndReason
        ?? healthReport.connection.captureEndReason
        ?? null,
      runStatusState: runStatus?.state ?? null,
      healthVerdict: healthReport.verdict,
      healthErrors: healthReport.errors,
      lockReleased: !written.has(lockPath),
      streamsDrained: healthReport.writer?.allStreamsDrained ?? null,
      noCredentialLeakArtifacts: credentialLeakArtifacts.length === 0,
      credentialLeakArtifacts,
      processSafety: {
        uncaughtExceptionCount,
        unhandledRejectionCount,
      },
    };

    const evaluation = evaluateWsReconnectAcceptance(observed);

    return {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      scenario,
      passed: evaluation.passed,
      observed,
      checks: evaluation.checks,
      failures: evaluation.failures,
      transcript,
    };
  } finally {
    process.off("uncaughtException", onUncaught);
    process.off("unhandledRejection", onUnhandled);
  }
}
