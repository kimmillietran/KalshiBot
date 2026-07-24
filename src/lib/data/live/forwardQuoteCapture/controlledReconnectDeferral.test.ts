/**
 * Production-path controlled reconnect deferral regressions (M12.1G).
 *
 * Proves nested busy cannot strand phase=deferred, and that the single-flight
 * scheduler eventually starts a distinct controlled-reconnect-validation cycle.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { KalshiWsProbeTransport } from "@/features/market-data/orderbook/types";

import { parseCaptureRunStatus } from "./captureRunStatus";
import { resolveCaptureLockPath } from "./captureLock";
import { KalshiWsLivenessWatchdog } from "./kalshiWsLivenessWatchdog";
import { CONTROLLED_RECONNECT_VALIDATION_REASON } from "./kalshiWsLivenessWatchdog";
import { runForwardQuoteCapture } from "./runForwardQuoteCapture";
import type {
  ForwardQuoteCaptureConfig,
  ForwardQuoteCaptureIo,
} from "./forwardQuoteCaptureTypes";
import { ReconnectScriptedTransport } from "./wsReconnectAcceptance/reconnectScriptedTransport";

const authHeaderMock = vi.hoisted(() => {
  let generation = 0;
  return {
    reset() {
      generation = 0;
    },
    create: vi.fn((input: { apiKeyId: string; timestampMs?: string }) => {
      generation += 1;
      const timestamp = input.timestampMs ?? String(generation * 1_000);
      return {
        "KALSHI-ACCESS-KEY": input.apiKeyId,
        "KALSHI-ACCESS-TIMESTAMP": timestamp,
        "KALSHI-ACCESS-SIGNATURE": `mock-signature-gen-${generation}-${timestamp}`,
      };
    }),
  };
});

vi.mock("@/lib/data/live/kalshiWsCaptureSpike", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/data/live/kalshiWsCaptureSpike")>();

  return {
    ...actual,
    createKalshiWebSocketAuthHeaders: authHeaderMock.create,
    resolveKalshiCaptureCredentials: vi.fn(() => ({
      status: "available",
      apiKeyId: "key-id",
      apiBaseUrl: null,
      wsUrl: "wss://example.test/ws",
      privateKeyMaterial: {
        status: "loaded",
        source: "raw-env",
        privateKeyPem: "mock-private-key",
        privateKeyLoaded: true,
        privateKeyFingerprint: "abc",
        warnings: [],
        error: null,
      },
      privateKeySource: "raw-env",
      privateKeyLoaded: true,
      privateKeyFingerprint: "abc",
      keyIdPresent: true,
      warnings: [],
      error: null,
    })),
  };
});

vi.mock("./discoverCaptureMarkets", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./discoverCaptureMarkets")>();
  return {
    ...actual,
    discoverCaptureMarkets: vi.fn(async () => ({
      attempted: true,
      succeeded: true,
      seriesTicker: "KXBTC15M",
      discoveredMarketCount: 1,
      selectedMarketTickers: ["KXBTC15M-DEFERRAL"],
      marketStatuses: { "KXBTC15M-DEFERRAL": "active" },
      eventTickers: { "KXBTC15M-DEFERRAL": null },
      closeTimes: { "KXBTC15M-DEFERRAL": null },
      error: null,
    })),
    discoverRolloverMarkets: vi.fn(async () => ({
      discovery: {
        attempted: true,
        succeeded: true,
        seriesTicker: "KXBTC15M",
        discoveredMarketCount: 1,
        selectedMarketTickers: ["KXBTC15M-DEFERRAL"],
        marketStatuses: { "KXBTC15M-DEFERRAL": "active" },
        eventTickers: { "KXBTC15M-DEFERRAL": null },
        closeTimes: { "KXBTC15M-DEFERRAL": null },
        error: null,
      },
      newTickers: [],
      closedTickers: [],
    })),
  };
});

const OUTPUT_DIR = "in-memory/controlled-reconnect-deferral/forward-quotes";
const PRIMARY = "KXBTC15M-DEFERRAL";
const DURATION_MINUTES = 180;
const DURATION_MS = DURATION_MINUTES * 60_000;

const LIVE_CONFIG: ForwardQuoteCaptureConfig = {
  series: "KXBTC15M",
  durationMinutes: DURATION_MINUTES,
  maxMarkets: 1,
  outputDir: OUTPUT_DIR,
  dryRun: false,
  marketTicker: PRIMARY,
  captureBtcSpot: false,
  rolloverCheckSeconds: 30,
  healthFlushSeconds: 60,
  topOfBookThrottleMs: 0,
  wsWatchdogEnabled: true,
  wsSoftSilenceThresholdMs: 30_000,
  wsHardStallThresholdMs: 60_000,
  wsProbeGraceMs: 10_000,
  wsRecoveryMaxAttempts: 1,
  priceRepresentation: "legacy-no-leg",
};

function createMemoryIo() {
  const files = new Map<string, string>();
  const appended = new Map<string, string[]>();
  let nowMs = Date.UTC(2026, 6, 23);
  let monotonicMs = 0;
  const lockPath = resolveCaptureLockPath(OUTPUT_DIR);

  const io: ForwardQuoteCaptureIo = {
    readFile: (path) => {
      const contents = files.get(path);
      if (contents === undefined) {
        throw new Error(`ENOENT: ${path}`);
      }
      return contents;
    },
    writeFile: (path, data) => {
      files.set(path, data);
    },
    appendFile: (path, data) => {
      appended.set(path, [...(appended.get(path) ?? []), data]);
      files.set(path, `${files.get(path) ?? ""}${data}`);
    },
    createAppendStream: (path) => ({
      write(chunk) {
        appended.set(path, [...(appended.get(path) ?? []), chunk]);
        files.set(path, `${files.get(path) ?? ""}${chunk}`);
        return true;
      },
      onceDrain() {},
      onError() {},
      end() {
        return Promise.resolve();
      },
    }),
    renameFile: (from, to) => {
      const contents = files.get(from);
      if (contents === undefined) {
        throw new Error(`ENOENT rename: ${from}`);
      }
      files.delete(from);
      files.set(to, contents);
    },
    createExclusiveFile: (path, data) => {
      if (files.has(path)) {
        throw new Error(`EEXIST: ${path}`);
      }
      files.set(path, data);
    },
    deleteFile: (path) => {
      files.delete(path);
    },
    mkdirSync: () => {},
    now: () => {
      nowMs += 1;
      return new Date(nowMs);
    },
    monotonicNowMs: () => {
      // Advance in larger steps so a missed post-reconnect snapshot fails the
      // confirmation wait quickly instead of appearing hung for tens of seconds.
      monotonicMs += 100;
      return monotonicMs;
    },
    setInterval: (fn, ms) => {
      void fn;
      void ms;
      return 1;
    },
    clearInterval: () => {},
    fetchImpl: (async () =>
      new Response(JSON.stringify({ markets: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch,
  };

  return {
    io,
    files,
    lockPath,
    advanceNowMs: (delta: number) => {
      nowMs += delta;
    },
    lifecycleText: () => {
      for (const [path, chunks] of appended) {
        if (path.endsWith("capture-lifecycle.jsonl")) {
          return chunks.join("");
        }
      }
      return "";
    },
    lifecycleEvents: (): Array<Record<string, unknown>> => {
      const text = (() => {
        for (const [path, chunks] of appended) {
          if (path.endsWith("capture-lifecycle.jsonl")) {
            return chunks.join("");
          }
        }
        return "";
      })();
      return text
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Record<string, unknown>);
    },
  };
}

async function runWithProcessSafety<T>(
  fn: () => Promise<T>,
): Promise<{
  result: T;
  uncaughtExceptionCount: number;
  unhandledRejectionCount: number;
}> {
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
    const result = await fn();
    await new Promise((resolve) => setTimeout(resolve, 0));
    return { result, uncaughtExceptionCount, unhandledRejectionCount };
  } finally {
    process.off("uncaughtException", onUncaught);
    process.off("unhandledRejection", onUnhandled);
  }
}

function createDurationJumpShouldStop(input: {
  advanceNowMs: (delta: number) => void;
  lifecycleText: () => string;
  successMarker?: string;
  failureMarker?: string;
  deferredMarker?: string;
  /** Jump only after deferred AND a natural recovery success are both present. */
  jumpAfterNaturalWhileDeferred?: boolean;
  cancelAfterDeferred?: boolean;
}) {
  let pollCount = 0;
  let clockJumped = false;
  let cancelRequested = false;
  let pollsAfterNaturalDeferred = 0;
  return () => {
    pollCount += 1;
    if (cancelRequested) {
      return true;
    }
    if (clockJumped) {
      return false;
    }
    const lifecycle = input.lifecycleText();
    const success =
      input.successMarker !== undefined && lifecycle.includes(input.successMarker);
    const failure =
      input.failureMarker !== undefined && lifecycle.includes(input.failureMarker);
    const deferred =
      input.deferredMarker !== undefined && lifecycle.includes(input.deferredMarker);
    const naturalSucceeded =
      lifecycle.includes('"type":"wsRecoverySucceeded"')
      && lifecycle.includes('"recoveryReason":"application-stream-stall"');

    if (deferred && input.cancelAfterDeferred) {
      cancelRequested = true;
      return true;
    }

    if (success) {
      clockJumped = true;
      input.advanceNowMs(DURATION_MS + 60_000);
    } else if (failure) {
      clockJumped = true;
    } else if (
      input.jumpAfterNaturalWhileDeferred
      && deferred
      && naturalSucceeded
    ) {
      pollsAfterNaturalDeferred += 1;
      if (pollsAfterNaturalDeferred >= 8) {
        clockJumped = true;
        input.advanceNowMs(DURATION_MS + 60_000);
      }
    } else if (pollCount >= 180) {
      clockJumped = true;
      input.advanceNowMs(DURATION_MS + 60_000);
    }
    return false;
  };
}

/**
 * Force the first N controlled escalation requests to observe busy by
 * starting a real natural recovery cycle first. waitForRecovery therefore
 * blocks — proving nested busy without a zero-delay spin.
 */
function installNestedBusySpy(busyCount: number): {
  controlledBusyResponses: number;
  naturalCyclesStarted: number;
  restore: () => void;
} {
  const original = KalshiWsLivenessWatchdog.prototype.requestEscalatedRecovery;
  let remaining = busyCount;
  let controlledBusyResponses = 0;
  let naturalCyclesStarted = 0;

  const spy = vi
    .spyOn(KalshiWsLivenessWatchdog.prototype, "requestEscalatedRecovery")
    .mockImplementation(function (
      this: KalshiWsLivenessWatchdog,
      reason: string,
    ) {
      if (reason === CONTROLLED_RECONNECT_VALIDATION_REASON && remaining > 0) {
        remaining -= 1;
        controlledBusyResponses += 1;
        const natural = original.call(this, "application-stream-stall");
        if (natural.status === "started") {
          naturalCyclesStarted += 1;
          return {
            status: "busy" as const,
            activeRecoveryCycleId: natural.recoveryCycleId,
            activeRecoveryReason: natural.recoveryReason,
          };
        }
        if (natural.status === "busy") {
          return natural;
        }
        return {
          status: "busy" as const,
          activeRecoveryCycleId: null,
          activeRecoveryReason: "application-stream-stall",
        };
      }
      return original.call(this, reason);
    });

  return {
    get controlledBusyResponses() {
      return controlledBusyResponses;
    },
    get naturalCyclesStarted() {
      return naturalCyclesStarted;
    },
    restore: () => {
      spy.mockRestore();
    },
  };
}

function manyDeltaTransport(): KalshiWsProbeTransport {
  let onMessageHandler: ((payload: string) => void) | null = null;
  let nextSid = 1;
  let connectCount = 0;

  const emit = (payload: Record<string, unknown>) => {
    queueMicrotask(() => {
      onMessageHandler?.(JSON.stringify(payload));
    });
  };

  return {
    async connect() {
      connectCount += 1;
    },
    send(payload: string) {
      const command = JSON.parse(payload) as Record<string, unknown>;
      const params = (command.params ?? {}) as Record<string, unknown>;
      if (command.cmd !== "subscribe") {
        return;
      }
      const ticker = (params.market_tickers as string[])[0]!;
      const sid = nextSid++;
      emit({
        id: command.id,
        type: "subscribed",
        msg: { channel: "orderbook_delta", sid },
      });
      const baseSeq = connectCount === 1 ? 1 : 200;
      emit({
        type: "orderbook_snapshot",
        sid,
        seq: baseSeq,
        msg: {
          market_ticker: ticker,
          market_id: "id",
          yes_dollars_fp: [["0.4500", "100.00"]],
          no_dollars_fp: [["0.5000", "80.00"]],
        },
      });
      // Many TOB-producing deltas while deferred/accepted/recovering/succeeded.
      for (let i = 1; i <= 12; i += 1) {
        emit({
          type: "orderbook_delta",
          sid,
          seq: baseSeq + i,
          msg: {
            market_ticker: ticker,
            market_id: "id",
            price_dollars: `0.${4600 + i}`,
            delta_fp: "1.00",
            side: "yes",
          },
        });
      }
    },
    close() {},
    onOpen() {},
    onMessage(handler: (payload: string) => void) {
      onMessageHandler = handler;
    },
    onClose() {},
    onError() {},
    ping() {},
    onPong() {},
  };
}

describe("controlled reconnect deferral (live layer)", () => {
  let busySpy: ReturnType<typeof installNestedBusySpy> | null = null;

  beforeEach(() => {
    authHeaderMock.reset();
    busySpy = null;
  });

  afterEach(() => {
    busySpy?.restore();
    busySpy = null;
  });

  it("defers while natural recovery is busy, then starts a distinct controlled cycle", async () => {
    busySpy = installNestedBusySpy(1);
    const transcript: string[] = [];
    const { io, files, lockPath, advanceNowMs, lifecycleText, lifecycleEvents } =
      createMemoryIo();
    const transport = new ReconnectScriptedTransport({
      scenario: "reconnect-success",
      primaryMarketTicker: PRIMARY,
      transcript,
      onBeforeReconnectConnect: () => {
        advanceNowMs(56 * 60 * 1000);
      },
    });

    const { result, unhandledRejectionCount } = await runWithProcessSafety(() =>
      runForwardQuoteCapture({
        config: LIVE_CONFIG,
        io,
        htmlOutputPath: "in-memory/controlled-reconnect-deferral/report.html",
        transport,
        forceReconnectAfterFirstValidTopOfBook: true,
        shouldStop: createDurationJumpShouldStop({
          advanceNowMs,
          lifecycleText,
          successMarker: `"type":"controlledReconnectRequested"`,
        }),
        credentialEnv: {
          KALSHI_API_KEY_ID: "key-id",
          KALSHI_PRIVATE_KEY: "mock-private-key",
        },
      }),
    );

    expect(unhandledRejectionCount).toBe(0);
    expect(busySpy.controlledBusyResponses).toBe(1);
    expect(busySpy.naturalCyclesStarted).toBeGreaterThanOrEqual(1);
    expect(result.controlledReconnectValidation?.succeeded).toBe(true);
    expect(result.controlledReconnectValidation?.acceptedRequestCount).toBe(1);
    expect(result.controlledReconnectValidation?.recoveryReason).toBe(
      CONTROLLED_RECONNECT_VALIDATION_REASON,
    );
    expect(result.healthReport.connection.captureEndReason).toBe("duration-complete");
    expect(files.has(lockPath)).toBe(false);

    const events = lifecycleEvents();
    const deferred = events.filter((e) => e.type === "controlledReconnectDeferred");
    const requested = events.filter((e) => e.type === "controlledReconnectRequested");
    const controlledAttempts = events.filter(
      (e) =>
        e.type === "wsRecoveryAttempted"
        && e.recoveryReason === CONTROLLED_RECONNECT_VALIDATION_REASON,
    );
    const controlledSuccess = events.filter(
      (e) =>
        e.type === "wsRecoverySucceeded"
        && e.recoveryReason === CONTROLLED_RECONNECT_VALIDATION_REASON,
    );
    const naturalSuccess = events.filter(
      (e) =>
        e.type === "wsRecoverySucceeded"
        && e.recoveryReason === "application-stream-stall",
    );

    expect(deferred).toHaveLength(1);
    expect(requested).toHaveLength(1);
    expect(controlledAttempts.length).toBeGreaterThanOrEqual(1);
    expect(controlledSuccess).toHaveLength(1);
    expect(naturalSuccess.length).toBeGreaterThanOrEqual(1);
    expect(requested[0]?.recoveryCycleId).toBe(controlledSuccess[0]?.recoveryCycleId);
    expect(requested[0]?.recoveryCycleId).not.toBe(naturalSuccess[0]?.recoveryCycleId);
  }, 45_000);

  it("survives nested busy (two consecutive busy responses) without stranding deferred", async () => {
    busySpy = installNestedBusySpy(2);
    const transcript: string[] = [];
    const { io, files, lockPath, advanceNowMs, lifecycleText, lifecycleEvents } =
      createMemoryIo();
    const transport = new ReconnectScriptedTransport({
      scenario: "reconnect-success",
      primaryMarketTicker: PRIMARY,
      transcript,
      onBeforeReconnectConnect: () => {
        advanceNowMs(56 * 60 * 1000);
      },
    });

    const { result, unhandledRejectionCount } = await runWithProcessSafety(() =>
      runForwardQuoteCapture({
        config: LIVE_CONFIG,
        io,
        htmlOutputPath: "in-memory/controlled-reconnect-deferral/report.html",
        transport,
        forceReconnectAfterFirstValidTopOfBook: true,
        shouldStop: createDurationJumpShouldStop({
          advanceNowMs,
          lifecycleText,
          successMarker: `"type":"controlledReconnectRequested"`,
        }),
        credentialEnv: {
          KALSHI_API_KEY_ID: "key-id",
          KALSHI_PRIVATE_KEY: "mock-private-key",
        },
      }),
    );

    expect(unhandledRejectionCount).toBe(0);
    expect(busySpy.controlledBusyResponses).toBe(2);
    expect(busySpy.naturalCyclesStarted).toBeGreaterThanOrEqual(2);
    expect(result.controlledReconnectValidation?.succeeded).toBe(true);
    expect(result.controlledReconnectValidation?.acceptedRequestCount).toBe(1);
    expect(result.healthReport.connection.captureEndReason).toBe("duration-complete");
    expect(files.has(lockPath)).toBe(false);

    const events = lifecycleEvents();
    expect(events.filter((e) => e.type === "controlledReconnectDeferred")).toHaveLength(1);
    expect(events.filter((e) => e.type === "controlledReconnectRequested")).toHaveLength(1);
    expect(
      events.filter(
        (e) =>
          e.type === "wsRecoverySucceeded"
          && e.recoveryReason === CONTROLLED_RECONNECT_VALIDATION_REASON,
      ),
    ).toHaveLength(1);
  }, 45_000);

  it("many top-of-book emissions create exactly one controlled request and success", async () => {
    const { io, files, lockPath, advanceNowMs, lifecycleText, lifecycleEvents } =
      createMemoryIo();
    const transport = manyDeltaTransport();

    const { result, unhandledRejectionCount } = await runWithProcessSafety(() =>
      runForwardQuoteCapture({
        config: LIVE_CONFIG,
        io,
        htmlOutputPath: "in-memory/controlled-reconnect-deferral/report.html",
        transport,
        forceReconnectAfterFirstValidTopOfBook: true,
        shouldStop: createDurationJumpShouldStop({
          advanceNowMs,
          lifecycleText,
          successMarker: `"type":"wsRecoverySucceeded"`,
        }),
        credentialEnv: {
          KALSHI_API_KEY_ID: "key-id",
          KALSHI_PRIVATE_KEY: "mock-private-key",
        },
      }),
    );

    expect(unhandledRejectionCount).toBe(0);
    expect(result.controlledReconnectValidation?.succeeded).toBe(true);
    expect(result.controlledReconnectValidation?.acceptedRequestCount).toBe(1);
    expect(result.controlledReconnectValidation?.requestCount).toBe(1);
    expect(files.has(lockPath)).toBe(false);

    const events = lifecycleEvents();
    expect(events.filter((e) => e.type === "controlledReconnectRequested")).toHaveLength(1);
    expect(
      events.filter(
        (e) =>
          e.type === "wsRecoverySucceeded"
          && e.recoveryReason === CONTROLLED_RECONNECT_VALIDATION_REASON,
      ),
    ).toHaveLength(1);
  }, 45_000);

  it("natural recovery alone cannot mark controlled validation succeeded", async () => {
    // First controlled attempt sees busy behind a real natural cycle; later
    // controlled attempts are rejected so no controlled cycle is ever accepted.
    const original = KalshiWsLivenessWatchdog.prototype.requestEscalatedRecovery;
    let controlledCalls = 0;
    const spy = vi
      .spyOn(KalshiWsLivenessWatchdog.prototype, "requestEscalatedRecovery")
      .mockImplementation(function (
        this: KalshiWsLivenessWatchdog,
        reason: string,
      ) {
        if (reason === CONTROLLED_RECONNECT_VALIDATION_REASON) {
          controlledCalls += 1;
          if (controlledCalls === 1) {
            const natural = original.call(this, "application-stream-stall");
            if (natural.status === "started") {
              return {
                status: "busy" as const,
                activeRecoveryCycleId: natural.recoveryCycleId,
                activeRecoveryReason: natural.recoveryReason,
              };
            }
            if (natural.status === "busy") {
              return natural;
            }
          }
          return { status: "rejected" as const, reason: "stopping" as const };
        }
        return original.call(this, reason);
      });

    try {
      const transcript: string[] = [];
      const { io, files, lockPath, advanceNowMs, lifecycleText, lifecycleEvents } =
        createMemoryIo();
      const transport = new ReconnectScriptedTransport({
        scenario: "reconnect-success",
        primaryMarketTicker: PRIMARY,
        transcript,
        onBeforeReconnectConnect: () => {
          advanceNowMs(56 * 60 * 1000);
        },
      });

      const { result, unhandledRejectionCount } = await runWithProcessSafety(() =>
        runForwardQuoteCapture({
          config: LIVE_CONFIG,
          io,
          htmlOutputPath: "in-memory/controlled-reconnect-deferral/report.html",
          transport,
          forceReconnectAfterFirstValidTopOfBook: true,
          shouldStop: createDurationJumpShouldStop({
            advanceNowMs,
            lifecycleText,
            deferredMarker: "controlledReconnectDeferred",
            jumpAfterNaturalWhileDeferred: true,
          }),
          credentialEnv: {
            KALSHI_API_KEY_ID: "key-id",
            KALSHI_PRIVATE_KEY: "mock-private-key",
          },
        }),
      );

      expect(unhandledRejectionCount).toBe(0);
      expect(result.controlledReconnectValidation?.succeeded).toBe(false);
      expect(result.controlledReconnectValidation?.acceptedRequestCount).toBe(0);
      expect(
        lifecycleEvents().some(
          (e) =>
            e.type === "wsRecoverySucceeded"
            && e.recoveryReason === "application-stream-stall",
        ),
      ).toBe(true);
      expect(
        lifecycleEvents().filter((e) => e.type === "controlledReconnectRequested"),
      ).toHaveLength(0);
      expect(files.has(lockPath)).toBe(false);
    } finally {
      spy.mockRestore();
    }
  }, 45_000);

  it("cancels deferred controlled request on shutdown without later escalation", async () => {
    busySpy = installNestedBusySpy(3);
    const transcript: string[] = [];
    const { io, files, lockPath, advanceNowMs, lifecycleText, lifecycleEvents } =
      createMemoryIo();
    const transport = new ReconnectScriptedTransport({
      scenario: "reconnect-success",
      primaryMarketTicker: PRIMARY,
      transcript,
      onBeforeReconnectConnect: () => {
        advanceNowMs(56 * 60 * 1000);
      },
    });

    const { result, unhandledRejectionCount } = await runWithProcessSafety(() =>
      runForwardQuoteCapture({
        config: LIVE_CONFIG,
        io,
        htmlOutputPath: "in-memory/controlled-reconnect-deferral/report.html",
        transport,
        forceReconnectAfterFirstValidTopOfBook: true,
        shouldStop: createDurationJumpShouldStop({
          advanceNowMs,
          lifecycleText,
          deferredMarker: "controlledReconnectDeferred",
          cancelAfterDeferred: true,
        }),
        credentialEnv: {
          KALSHI_API_KEY_ID: "key-id",
          KALSHI_PRIVATE_KEY: "mock-private-key",
        },
      }),
    );

    expect(unhandledRejectionCount).toBe(0);
    expect(result.controlledReconnectValidation?.succeeded).toBe(false);
    expect(result.controlledReconnectValidation?.failed).toBe(true);
    expect(result.controlledReconnectValidation?.failureReason).toMatch(
      /controlled-reconnect-cancelled|controlled-reconnect-not-completed|controlled-reconnect-request-rejected/,
    );
    expect(
      lifecycleEvents().filter((e) => e.type === "controlledReconnectRequested"),
    ).toHaveLength(0);
    expect(files.has(lockPath)).toBe(false);

    const status = parseCaptureRunStatus(
      files.get(`${OUTPUT_DIR}/${result.runId}/capture-run-status.json`)!,
    );
    expect(status?.state).toMatch(/completed|failed|cancelled/);
    expect(result.healthReport.connection.captureEndReason).toMatch(
      /user-cancelled|unexpected-error/,
    );
  }, 45_000);

  it("terminal natural recovery cancels deferred controlled validation", async () => {
    const original = KalshiWsLivenessWatchdog.prototype.requestEscalatedRecovery;
    const spy = vi
      .spyOn(KalshiWsLivenessWatchdog.prototype, "requestEscalatedRecovery")
      .mockImplementation(function (
        this: KalshiWsLivenessWatchdog,
        reason: string,
      ) {
        if (reason === CONTROLLED_RECONNECT_VALIDATION_REASON) {
          // Force controlled into deferred behind a natural cycle; the transport
          // scenario then fails reconnect with 401 → terminal.
          const natural = original.call(this, "application-stream-stall");
          if (natural.status === "started") {
            return {
              status: "busy" as const,
              activeRecoveryCycleId: natural.recoveryCycleId,
              activeRecoveryReason: natural.recoveryReason,
            };
          }
          if (natural.status === "busy") {
            return natural;
          }
          return {
            status: "busy" as const,
            activeRecoveryCycleId: null,
            activeRecoveryReason: "application-stream-stall",
          };
        }
        return original.call(this, reason);
      });

    try {
      const transcript: string[] = [];
      const { io, files, lockPath, advanceNowMs, lifecycleText, lifecycleEvents } =
        createMemoryIo();
      const transport = new ReconnectScriptedTransport({
        scenario: "reconnect-401-terminal",
        primaryMarketTicker: PRIMARY,
        transcript,
        onBeforeReconnectConnect: () => {
          advanceNowMs(56 * 60 * 1000);
        },
      });

      const { result, unhandledRejectionCount } = await runWithProcessSafety(() =>
        runForwardQuoteCapture({
          config: LIVE_CONFIG,
          io,
          htmlOutputPath: "in-memory/controlled-reconnect-deferral/report.html",
          transport,
          forceReconnectAfterFirstValidTopOfBook: true,
          shouldStop: createDurationJumpShouldStop({
            advanceNowMs,
            lifecycleText,
            failureMarker: "wsRecoveryFailed",
          }),
          credentialEnv: {
            KALSHI_API_KEY_ID: "key-id",
            KALSHI_PRIVATE_KEY: "mock-private-key",
          },
        }),
      );

      expect(unhandledRejectionCount).toBe(0);
      expect(result.healthReport.connection.captureEndReason).toBe(
        "terminal-websocket-failure",
      );
      expect(result.controlledReconnectValidation?.succeeded).toBe(false);
      expect(
        lifecycleEvents().filter((e) => e.type === "controlledReconnectRequested"),
      ).toHaveLength(0);
      expect(files.has(lockPath)).toBe(false);
    } finally {
      spy.mockRestore();
    }
  }, 45_000);
});
