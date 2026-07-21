import { generateKeyPairSync } from "node:crypto";

import { runForwardQuoteCapture } from "../runForwardQuoteCapture";
import {
  createRunOutputPaths,
  type ForwardCaptureAppendStream,
} from "../jsonlForwardCaptureWriter";
import { parseCaptureRunStatus, TERMINAL_CAPTURE_RUN_STATES } from "../captureRunStatus";
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
/** Short drain-timeout so the writer-no-drain scenario fails fast. */
const ACCEPTANCE_NO_DRAIN_TIMEOUT_MS = 300;

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
 * Deterministic buffered append stream. It exercises the writer's REAL
 * buffered orchestration path — write acceptance, one scripted backpressure
 * event with an asynchronous drain, and asynchronous end() completion — so
 * `allStreamsDrained` is proven against the production code path, not a
 * synchronous appendFile shim.
 */
function createAcceptanceAppendStream(input: {
  path: string;
  scenario: RecoveryAcceptanceScenario;
  /** True for the one stream that receives the scripted backpressure. */
  isBackpressureTarget: boolean;
  /** True for the one stream whose end() completion is deliberately delayed. */
  hasDelayedEnd: boolean;
  sink: (path: string, chunk: string) => void;
  /** Ordered lifecycle event log used to prove publication ordering. */
  events: string[];
  transcript: string[];
}): ForwardCaptureAppendStream {
  let writesSeen = 0;
  let backpressureTriggered = false;
  const neverDrain = input.scenario === "writer-no-drain" && input.isBackpressureTarget;

  return {
    write(chunk) {
      // Node semantics: a false return means "accepted but buffer is above
      // the high-water mark", so the chunk is still persisted.
      input.sink(input.path, chunk);
      writesSeen += 1;
      if (input.isBackpressureTarget && !backpressureTriggered && writesSeen === 2) {
        backpressureTriggered = true;
        input.transcript.push(
          neverDrain
            ? `writer backpressure on ${input.path} (scripted to NEVER drain)`
            : `writer backpressure on ${input.path} (drain scheduled asynchronously)`,
        );
        return false;
      }
      return true;
    },
    onceDrain(callback) {
      if (neverDrain) {
        // The no-drain scenario: the callback is intentionally never invoked,
        // so the writer's bounded finalization drain must time out and fail
        // the run closed.
        return;
      }
      setTimeout(() => {
        input.transcript.push(`writer drain completed on ${input.path}`);
        callback();
      }, 0);
    },
    onError() {},
    end() {
      const finish = (): void => {
        input.events.push(`stream-drained:${input.path}`);
      };
      if (input.hasDelayedEnd) {
        // Asynchronous stream completion: terminal status must not be
        // published until this promise settles.
        return new Promise((resolve) => {
          setTimeout(() => {
            finish();
            resolve();
          }, 20);
        });
      }
      finish();
      return Promise.resolve();
    },
  };
}

/**
 * Runs the full production capture orchestrator against the scripted
 * recovery scenario with in-memory IO (including real buffered append
 * streams) and ephemeral credentials, then evaluates the acceptance policy
 * against the artifacts the run actually produced.
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
  /** Ordered publication/drain events proving finalization ordering. */
  const orderedEvents: string[] = [];
  let artifactAppendFileCalls = 0;
  let appendStreamsCreated = 0;

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
    priceRepresentation: "legacy-no-leg",
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

  const artifactSuffixes = [
    "raw-kalshi-ws.jsonl",
    "top-of-book.jsonl",
    "btc-spot.jsonl",
    "market-metadata.jsonl",
    "capture-lifecycle.jsonl",
  ];

  const sink = (path: string, chunk: string): void => {
    appended.set(path, [...(appended.get(path) ?? []), chunk]);
  };

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
      // The buffered writer must never fall back to this legacy shim for
      // JSONL artifacts; the acceptance policy checks this stayed at zero.
      if (artifactSuffixes.some((suffix) => path.endsWith(suffix))) {
        artifactAppendFileCalls += 1;
      }
      sink(path, data);
    },
    createAppendStream: (path: string) => {
      appendStreamsCreated += 1;
      return createAcceptanceAppendStream({
        path,
        scenario,
        isBackpressureTarget: path.endsWith("top-of-book.jsonl"),
        hasDelayedEnd: path.endsWith("top-of-book.jsonl"),
        sink,
        events: orderedEvents,
        transcript,
      });
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
      if (to.endsWith("capture-run-status.json")) {
        const status = parseCaptureRunStatus(contents);
        if (status !== null && TERMINAL_CAPTURE_RUN_STATES.includes(status.state)) {
          orderedEvents.push(`terminal-status-published:${status.state}`);
        }
      }
    },
    createExclusiveFile: (path: string, data: string) => {
      if (written.has(path)) {
        throw new Error(`EEXIST (in-memory acceptance io): ${path}`);
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

  // The scripted scenario is driven from shouldStop, which the capture loop
  // polls between asynchronous message deliveries. Because acknowledgements
  // arrive on the microtask queue (never re-entrantly inside send), the
  // harness waits for observable lifecycle evidence before advancing:
  //
  //   1. fire the rollover check only after the scripted recovery reached
  //      its scenario-specific terminal point (so the unsubscribe cannot
  //      race the recovery lifecycle);
  //   2. jump the clock past the configured duration only after the
  //      unsubscribe was acknowledged (or failed, for sid-less scenarios),
  //      so the run ends with a truthful duration-complete reason.
  //
  // Bounded poll-count fallbacks keep every scenario terminating.
  let pollCount = 0;
  let rolloverFiredAtPoll: number | null = null;
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

    if (rolloverFiredAtPoll === null) {
      const recoveryReachedTerminalPoint =
        scenario === "missing-sid"
          ? pollCount >= 4
          : scenario === "no-fresh-snapshot"
            ? lifecycle.includes("snapshotRecoveryAcknowledged") || pollCount >= 12
            : lifecycle.includes("snapshotRecoverySucceeded") || pollCount >= 12;
      if (recoveryReachedTerminalPoint) {
        rolloverFiredAtPoll = pollCount;
        transcript.push("fired rollover check (closes the acceptance market)");
        for (const interval of intervals) {
          interval.fn();
        }
      }
      return false;
    }

    if (!clockJumped) {
      const unsubscribeSettled =
        lifecycle.includes("marketUnsubscribeAcknowledged")
        || lifecycle.includes("marketUnsubscribeFailed");
      if (unsubscribeSettled || pollCount >= rolloverFiredAtPoll + 12) {
        clockJumped = true;
        nowMs += durationMs + 60_000;
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
    credentialEnv: {
      NODE_ENV: "test",
      KALSHI_API_KEY_ID: ACCEPTANCE_API_KEY_ID,
      KALSHI_WS_URL: "wss://capture-recovery-acceptance.invalid/ws",
    },
    ...(scenario === "writer-no-drain"
      ? { writerLimits: { maxDrainDelayMs: ACCEPTANCE_NO_DRAIN_TIMEOUT_MS } }
      : {}),
  });
  transcript.push("capture finalized; writer streams ended; terminal status published");

  const healthReport = result.healthReport;
  const runPaths = createRunOutputPaths(config.outputDir, result.runId);

  const lifecycleEvents = parseJsonlLines(appended.get(runPaths.captureLifecyclePath) ?? []);
  const topOfBookRecords = parseJsonlLines(appended.get(runPaths.topOfBookPath) ?? []);

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
  const firstLifecycleIndex = (type: string): number =>
    lifecycleEvents.findIndex(
      (event) =>
        event.type === type
        && Array.isArray(event.marketTickers)
        && event.marketTickers.includes(ACCEPTANCE_PRIMARY_MARKET_TICKER),
    );

  // Recovery lifecycle order: requested -> acknowledged -> succeeded.
  const requestedIndex = firstLifecycleIndex("snapshotRecoveryRequested");
  const acknowledgedIndex = firstLifecycleIndex("snapshotRecoveryAcknowledged");
  const succeededIndex = firstLifecycleIndex("snapshotRecoverySucceeded");
  const recoveryLifecycleOrdered =
    requestedIndex !== -1
    && acknowledgedIndex !== -1
    && succeededIndex !== -1
    && requestedIndex < acknowledgedIndex
    && acknowledgedIndex < succeededIndex;

  const recoveryRequestSids = transport.sentCommands
    .filter((command) => {
      const params = (command.params ?? {}) as Record<string, unknown>;
      return command.cmd === "update_subscription" && params.action === "get_snapshot";
    })
    .map((command) => {
      const params = (command.params ?? {}) as Record<string, unknown>;
      return (params.sids as number[])[0];
    });

  const statusText = written.get(runPaths.captureRunStatusPath);
  const runStatus = statusText !== undefined ? parseCaptureRunStatus(statusText) : null;

  // Ordering proof: the terminal run status must appear only after every
  // append stream's end() promise settled.
  const terminalStatusEventIndex = orderedEvents.findIndex((event) =>
    event.startsWith("terminal-status-published:"),
  );
  const streamDrainIndexes = orderedEvents
    .map((event, index) => (event.startsWith("stream-drained:") ? index : -1))
    .filter((index) => index !== -1);
  const terminalStatusPublishedAfterStreamsDrained =
    terminalStatusEventIndex !== -1
    && streamDrainIndexes.length === 5
    && streamDrainIndexes.every((index) => index < terminalStatusEventIndex);

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
    runDir: runPaths.runDir,
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
    recoveryLifecycleOrdered,
    pendingCommandCountAtCaptureEnd:
      healthReport.orderbook.pendingCommandCountAtCaptureEnd,
    marketsWithOutstandingRecoveryAtEnd:
      healthReport.orderbook.marketsWithOutstandingRecoveryAtEnd,
    commandErrorsReceived: healthReport.orderbook.commandErrorsReceived,
    bufferedStreamsUsed: appendStreamsCreated === 5 && artifactAppendFileCalls === 0,
    writerBackpressureCount: healthReport.writer?.backpressureEventCount ?? 0,
    allStreamsDrained: healthReport.writer?.allStreamsDrained ?? null,
    writerFailure: healthReport.writer?.failure?.reason ?? null,
    terminalStatusPublishedAfterStreamsDrained,
    runStatusState: runStatus?.state ?? null,
    captureEndReason: runStatus?.captureEndReason ?? null,
    healthVerdict: healthReport.verdict,
    healthCompletedNormally: healthReport.connection.completedNormally,
    healthLiveConnectionSucceeded: healthReport.connection.liveConnectionSucceeded,
    healthErrors: healthReport.errors,
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
