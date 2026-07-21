import { generateKeyPairSync } from "node:crypto";

import { runForwardQuoteCapture } from "../runForwardQuoteCapture";
import { createRunOutputPaths } from "../jsonlForwardCaptureWriter";
import { parseCaptureRunStatus } from "../captureRunStatus";
import type {
  ForwardQuoteCaptureConfig,
  ForwardQuoteCaptureIo,
} from "../forwardQuoteCaptureTypes";

import { AcceptanceScriptedTransport } from "./acceptanceScriptedTransport";
import { evaluateRecoveryAcceptance } from "./evaluateRecoveryAcceptance";
import type {
  RecoveryAcceptanceObserved,
  RecoveryAcceptanceReport,
  RecoveryAcceptanceScenario,
} from "./captureRecoveryAcceptanceTypes";

export const ACCEPTANCE_PRIMARY_MARKET_TICKER = "KXBTC15M-ACCEPT";
export const ACCEPTANCE_ROLLOVER_MARKET_TICKER = "KXBTC15M-ACCEPTNEXT";
const ACCEPTANCE_API_KEY_ID = "capture-recovery-acceptance-key-id";
const ACCEPTANCE_PRIVATE_KEY_PATH = "in-memory/acceptance-ephemeral-key.pem";
const ACCEPTANCE_OUTPUT_DIR = "in-memory/acceptance/forward-quotes";
const ACCEPTANCE_HTML_PATH = "in-memory/acceptance/reports/forward-quote-capture.html";
const ACCEPTANCE_EPOCH_MS = Date.UTC(2026, 6, 20);

/**
 * The harness signs the WebSocket handshake with a real (but ephemeral,
 * never-registered) RSA key so the full production auth path runs without
 * touching operator credentials. Cached so repeated runs stay fast.
 */
let cachedEphemeralPem: string | null = null;

function ephemeralPrivateKeyPem(): string {
  if (cachedEphemeralPem === null) {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    cachedEphemeralPem = privateKey.export({ type: "pkcs8", format: "pem" }) as string;
  }
  return cachedEphemeralPem;
}

type ParsedJsonlRecord = Record<string, unknown>;

function parseJsonlLines(chunks: readonly string[]): ParsedJsonlRecord[] {
  return chunks
    .join("")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as ParsedJsonlRecord);
}

/**
 * Runs the full production capture orchestrator against the scripted
 * recovery scenario with in-memory IO and ephemeral credentials, then
 * evaluates the acceptance policy against the artifacts the run produced.
 */
export async function runCaptureRecoveryAcceptance(options?: {
  scenario?: RecoveryAcceptanceScenario;
}): Promise<RecoveryAcceptanceReport> {
  const scenario = options?.scenario ?? "happy";
  const transcript: string[] = [];
  const transport = new AcceptanceScriptedTransport({
    scenario,
    primaryMarketTicker: ACCEPTANCE_PRIMARY_MARKET_TICKER,
    transcript,
  });

  const privateKeyPem = ephemeralPrivateKeyPem();

  const appended = new Map<string, string[]>();
  const written = new Map<string, string>();
  const directHealthWrites: string[] = [];
  const healthRenames: string[] = [];
  const intervals: Array<{ fn: () => void; ms: number }> = [];

  let nowMs = ACCEPTANCE_EPOCH_MS;
  let monotonicMs = 0;

  const durationMinutes = 5;
  const durationMs = durationMinutes * 60_000;

  const config: ForwardQuoteCaptureConfig = {
    series: "KXBTC15M",
    durationMinutes,
    maxMarkets: 1,
    outputDir: ACCEPTANCE_OUTPUT_DIR,
    dryRun: false,
    marketTicker: ACCEPTANCE_PRIMARY_MARKET_TICKER,
    privateKeyPath: ACCEPTANCE_PRIVATE_KEY_PATH,
    captureBtcSpot: false,
    rolloverCheckSeconds: 30,
    healthFlushSeconds: 60,
    topOfBookThrottleMs: 0,
    wsWatchdogEnabled: false,
    wsSoftSilenceThresholdMs: 30_000,
    wsHardStallThresholdMs: 60_000,
    wsProbeGraceMs: 10_000,
    wsRecoveryMaxAttempts: 1,
  };

  const rolloverMarketsResponse = {
    markets: [
      {
        ticker: ACCEPTANCE_ROLLOVER_MARKET_TICKER,
        title: "BTC next acceptance window",
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

  const io: ForwardQuoteCaptureIo = {
    readFile: (path: string) => {
      if (path === ACCEPTANCE_PRIVATE_KEY_PATH) {
        return privateKeyPem;
      }
      const contents = written.get(path);
      if (contents === undefined) {
        throw new Error(`ENOENT (in-memory acceptance io): ${path}`);
      }
      return contents;
    },
    writeFile: (path: string, data: string) => {
      written.set(path, data);
      if (path.endsWith("capture-health.json")) {
        directHealthWrites.push(path);
      }
    },
    appendFile: (path: string, data: string) => {
      appended.set(path, [...(appended.get(path) ?? []), data]);
    },
    renameFile: (from: string, to: string) => {
      const contents = written.get(from);
      if (contents === undefined) {
        throw new Error(`ENOENT rename source (in-memory acceptance io): ${from}`);
      }
      written.delete(from);
      written.set(to, contents);
      if (to.endsWith("capture-health.json")) {
        healthRenames.push(to);
      }
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

  // The scripted scenario is driven from shouldStop, which the capture loop
  // polls every iteration: the first poll fires the rollover interval (which
  // unsubscribes the primary market after recovery completed), the second
  // jumps the clock past the configured duration so the run ends with a
  // truthful duration-complete reason (never user-cancelled).
  let stopCalls = 0;
  const shouldStop = (): boolean => {
    stopCalls += 1;
    if (stopCalls === 1) {
      transcript.push("fired rollover check (closes the acceptance market)");
      for (const interval of intervals) {
        interval.fn();
      }
    } else if (stopCalls === 2) {
      nowMs += durationMs + 60_000;
    }
    return false;
  };

  const result = await runForwardQuoteCapture({
    config,
    io,
    htmlOutputPath: ACCEPTANCE_HTML_PATH,
    shouldStop,
    transport,
    credentialEnv: {
      NODE_ENV: "test",
      KALSHI_API_KEY_ID: ACCEPTANCE_API_KEY_ID,
      KALSHI_WS_URL: "wss://capture-recovery-acceptance.invalid/ws",
    },
  });
  transcript.push("capture finalized; writer drained; terminal status published");

  const healthReport = result.healthReport;
  const paths = createRunOutputPaths(config.outputDir, result.runId);

  const lifecycleEvents = parseJsonlLines(appended.get(paths.captureLifecyclePath) ?? []);
  const topOfBookRecords = parseJsonlLines(appended.get(paths.topOfBookPath) ?? []);

  const primaryRecords = topOfBookRecords.filter(
    (record) => record.marketTicker === ACCEPTANCE_PRIMARY_MARKET_TICKER,
  );
  const validPrimaryBySequence = (sequence: number): boolean =>
    primaryRecords.some(
      (record) => record.sequence === sequence && record.bookState === "valid",
    );

  const subscriptionAck = lifecycleEvents.find(
    (event) =>
      event.type === "subscriptionAcknowledged"
      && Array.isArray(event.marketTickers)
      && event.marketTickers.includes(ACCEPTANCE_PRIMARY_MARKET_TICKER),
  );
  const hasLifecycleEvent = (type: string): boolean =>
    lifecycleEvents.some(
      (event) =>
        event.type === type
        && Array.isArray(event.marketTickers)
        && event.marketTickers.includes(ACCEPTANCE_PRIMARY_MARKET_TICKER),
    );

  const recoveryRequestSids = transport.sentCommands
    .filter((command) => {
      const params = (command.params ?? {}) as Record<string, unknown>;
      return command.cmd === "update_subscription" && params.action === "get_snapshot";
    })
    .map((command) => {
      const params = (command.params ?? {}) as Record<string, unknown>;
      return (params.sids as number[])[0];
    });

  const statusText = written.get(paths.captureRunStatusPath);
  const runStatus = statusText !== undefined ? parseCaptureRunStatus(statusText) : null;

  // Credential-hygiene scan: none of the secret material used for the run may
  // appear in any final artifact. Short header values (timestamps) are
  // excluded to avoid false positives on ordinary numbers.
  const secretNeedles = [
    privateKeyPem.trim(),
    "PRIVATE KEY",
    "KALSHI-ACCESS",
    ACCEPTANCE_API_KEY_ID,
    ...transport.connectHeaderValues.filter((value) => value.length > 20),
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
    if (secretNeedles.some((needle) => text.includes(needle))) {
      credentialLeakArtifacts.push(path);
    }
  }

  const observed: RecoveryAcceptanceObserved = {
    runId: result.runId,
    runDir: paths.runDir,
    connected: healthReport.connection.everConnected,
    subscribeAcknowledged: subscriptionAck !== undefined,
    assignedSid:
      typeof subscriptionAck?.sid === "number" ? subscriptionAck.sid : null,
    recoveryRequestSids,
    gapEpisodeCount: healthReport.orderbook.sequenceGapEpisodeCount,
    sequenceGapCount: healthReport.orderbook.sequenceGapCount,
    recoveryRequestCount: healthReport.orderbook.snapshotRecoveryRequestCount,
    recoverySuccessCount: healthReport.orderbook.snapshotRecoverySuccessCount,
    recoveryFailureCount: healthReport.orderbook.snapshotRecoveryFailureCount,
    suppressedWhileResyncingCount: healthReport.orderbook.deltasQuarantinedDuringResync,
    quarantinedSequencesApplied: [10, 11, 12].filter(validPrimaryBySequence),
    freshSnapshotRestoredValidBook: validPrimaryBySequence(100),
    postRecoveryAcceptedDeltaCount: [101, 102].filter(validPrimaryBySequence).length,
    unsubscribeRequested: hasLifecycleEvent("marketUnsubscribeRequested"),
    unsubscribeAcknowledged: hasLifecycleEvent("marketUnsubscribeAcknowledged"),
    pendingCommandCountAtCaptureEnd:
      healthReport.orderbook.pendingCommandCountAtCaptureEnd,
    marketsWithOutstandingRecoveryAtEnd:
      healthReport.orderbook.marketsWithOutstandingRecoveryAtEnd,
    commandErrorsReceived: healthReport.orderbook.commandErrorsReceived,
    allStreamsDrained: healthReport.writer?.allStreamsDrained ?? null,
    writerFailure: healthReport.writer?.failure?.reason ?? null,
    runStatusState: runStatus?.state ?? null,
    captureEndReason: runStatus?.captureEndReason ?? null,
    healthVerdict: healthReport.verdict,
    healthPublishedAtomically:
      directHealthWrites.length === 0 && healthRenames.length > 0,
    credentialLeakArtifacts,
  };

  const evaluation = evaluateRecoveryAcceptance(observed);

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
}
