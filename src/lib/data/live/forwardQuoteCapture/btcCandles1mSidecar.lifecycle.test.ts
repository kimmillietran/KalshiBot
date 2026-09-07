import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/data/live/kalshiWsCaptureSpike", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/data/live/kalshiWsCaptureSpike")>();
  return {
    ...actual,
    createKalshiWebSocketAuthHeaders: vi.fn(() => ({
      "KALSHI-ACCESS-KEY": "key-id",
      "KALSHI-ACCESS-TIMESTAMP": "0",
      "KALSHI-ACCESS-SIGNATURE": "mock-signature",
    })),
  };
});

import type { KalshiWsProbeTransport } from "@/features/market-data/orderbook/types";
import type { KalshiCaptureCredentials } from "@/lib/data/live/kalshiWsCaptureSpike";
import { createMemoryCalibrationFadeForwardValidationIo } from "@/lib/data/research/calibrationFadeForwardValidation";
import {
  buildHistoricalReplicaVolatilityWindow,
  parseClosedMinuteObservation,
  preloadCompletedBtcCandleObservations,
  selectCausalClosedMinuteAsOfT,
} from "@/lib/data/research/calibrationFadeV2ForwardValidation";

import { acquireCaptureLock, resolveCaptureLockPath } from "./captureLock";
import {
  LIVE_CANDLE_GRANULARITY_MS,
  LIVE_CANDLE_PRODUCT_ID,
  type FetchCompletedCandles,
} from "./btcCandles1mSidecarTypes";
import {
  createJsonlForwardCaptureWriter,
  createRunOutputPaths,
} from "./jsonlForwardCaptureWriter";
import { runForwardQuoteCapture } from "./runForwardQuoteCapture";
import { runLiveForwardQuoteCapture } from "./runLiveForwardQuoteCapture";
import type { ForwardQuoteCaptureConfig, ForwardQuoteCaptureIo } from "./forwardQuoteCaptureTypes";

const DAY = "2026-07-20";
const PROCESS_START = `${DAY}T14:00:10.000Z`;
const M0_OPEN_MS = Date.parse(`${DAY}T13:49:00.000Z`);
const LAST_OPEN_MS = M0_OPEN_MS + 10 * LIVE_CANDLE_GRANULARITY_MS;

const LIVE_CONFIG: ForwardQuoteCaptureConfig = {
  series: "KXBTC15M",
  durationMinutes: 0.0001,
  maxMarkets: 1,
  outputDir: "out/capture",
  dryRun: false,
  captureBtcSpot: false,
  captureBtcCandles1m: true,
  btcCandles1mPollIntervalMs: 15_000,
  rolloverCheckSeconds: 30,
  healthFlushSeconds: 60,
  topOfBookThrottleMs: 0,
  wsWatchdogEnabled: false,
  wsSoftSilenceThresholdMs: 30_000,
  wsHardStallThresholdMs: 60_000,
  wsProbeGraceMs: 10_000,
  wsRecoveryMaxAttempts: 1,
};

const CREDENTIALS: KalshiCaptureCredentials = {
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
};

class QuietKalshiTransport implements KalshiWsProbeTransport {
  connectCount = 0;
  private onMessageHandler: ((payload: string) => void) | null = null;

  async connect(): Promise<void> {
    this.connectCount += 1;
  }

  send(payload: string): void {
    const command = JSON.parse(payload) as {
      cmd?: string;
      id?: number;
      params?: { market_tickers?: string[] };
    };
    if (command.cmd === "subscribe") {
      const ticker = command.params?.market_tickers?.[0] ?? "KXBTC15M-TEST";
      this.onMessageHandler?.(
        JSON.stringify({
          id: command.id,
          type: "subscribed",
          msg: { channel: "orderbook_delta", sid: 1 },
        }),
      );
      this.onMessageHandler?.(
        JSON.stringify({
          type: "orderbook_snapshot",
          sid: 1,
          seq: 1,
          msg: {
            market_ticker: ticker,
            market_id: "market-id",
            yes_dollars_fp: [["0.4500", "100.00"]],
            no_dollars_fp: [["0.5000", "80.00"]],
          },
        }),
      );
    }
  }

  close(): void {}
  onOpen(): void {}
  onMessage(handler: (payload: string) => void): void {
    this.onMessageHandler = handler;
  }
  onClose(): void {}
  onError(): void {}
  ping(): void {}
  onPong(): void {}
}

function tuple(openMs: number, close: number, volume = 1) {
  return [openMs / 1000, close - 10, close + 10, close, close, volume];
}

function elevenClosedMinutes(skipIndex: number | null = null): unknown[] {
  return Array.from({ length: 11 }, (_, index) => {
    if (index === skipIndex) {
      return null;
    }
    return tuple(M0_OPEN_MS + index * LIVE_CANDLE_GRANULARITY_MS, 100_000 + index);
  }).filter((row) => row !== null);
}

function createDiscovery() {
  return {
    attempted: true,
    succeeded: true,
    seriesTicker: "KXBTC15M",
    discoveredMarketCount: 1,
    selectedMarketTickers: ["KXBTC15M-TEST"],
    marketStatuses: { "KXBTC15M-TEST": "open" },
    eventTickers: { "KXBTC15M-TEST": null },
    closeTimes: { "KXBTC15M-TEST": null },
    error: null,
  };
}

function createMemoryIo() {
  const files = new Map<string, string>();
  let nowMs = Date.parse(PROCESS_START);
  let monotonicMs = 0;
  return {
    files,
    io: {
      writeFile: (path: string, data: string) => {
        files.set(path, data);
      },
      appendFile: (path: string, data: string) => {
        files.set(path, `${files.get(path) ?? ""}${data}`);
      },
      mkdirSync: () => {},
      now: () => {
        nowMs += 250;
        return new Date(nowMs);
      },
      monotonicNowMs: () => {
        monotonicMs += 1_000;
        return monotonicMs;
      },
    } satisfies ForwardQuoteCaptureIo,
    setNow: (ms: number) => {
      nowMs = ms;
    },
  };
}

const okFetch: FetchCompletedCandles = async (request) => ({
  ok: true,
  status: 200,
  body: elevenClosedMinutes(),
  requestStartedAtLocal: request.requestStartedAtLocal,
});

describe("candle sidecar parent lifecycle", () => {
  it("ends the whole capture as writer-failure when the candle stream throws", async () => {
    const { io } = createMemoryIo();
    const lifecycleChunks: string[] = [];
    const ioWithFailingCandles = {
      ...io,
      createAppendStream: (path: string) => ({
        write: (chunk: string) => {
          if (path.endsWith("btc-candles-1m.jsonl")) {
            throw new Error("EIO: candle disk full");
          }
          if (path.endsWith("capture-lifecycle.jsonl")) {
            lifecycleChunks.push(chunk);
          }
          return true;
        },
        onceDrain: () => {},
        onError: () => {},
        end: () => Promise.resolve(),
      }),
    };
    const writer = createJsonlForwardCaptureWriter(
      ioWithFailingCandles,
      createRunOutputPaths("out/capture", "run-candle-writer"),
    );

    const result = await runLiveForwardQuoteCapture({
      runId: "run-candle-writer",
      startedAt: PROCESS_START,
      config: LIVE_CONFIG,
      discovery: createDiscovery(),
      credentials: CREDENTIALS,
      io: ioWithFailingCandles,
      writer,
      transport: new QuietKalshiTransport(),
      fetchCompletedCandles: okFetch,
      createProcessEpochId: () => "epoch-1",
    });

    expect(result.captureEndReason).toBe("writer-failure");
    expect(result.errors.join(" ")).toContain("candle disk full");
    expect(lifecycleChunks.join("")).toContain("writerFailureDetected");
  });

  it("keeps Kalshi and btc-spot running while candle REST is degraded", async () => {
    const { io } = createMemoryIo();
    let spotCalls = 0;
    const failingFetch: FetchCompletedCandles = async (request) => ({
      ok: false,
      kind: "http-5xx",
      status: 500,
      requestStartedAtLocal: request.requestStartedAtLocal,
    });

    const result = await runLiveForwardQuoteCapture({
      runId: "run-spot-continues",
      startedAt: PROCESS_START,
      config: { ...LIVE_CONFIG, captureBtcSpot: true },
      discovery: createDiscovery(),
      credentials: CREDENTIALS,
      io,
      transport: new QuietKalshiTransport(),
      fetchBtcSpot: async () => {
        spotCalls += 1;
        return { price: 50_000, updatedAt: PROCESS_START };
      },
      fetchCompletedCandles: failingFetch,
      createProcessEpochId: () => "epoch-1",
    });

    expect(result.captureEndReason).toBe("duration-complete");
    expect(spotCalls).toBeGreaterThan(0);
    expect(result.recordCounts.btcSpot).toBeGreaterThan(0);
    expect(result.recordCounts.btcCandles).toBe(0);
    expect(result.recordCounts.topOfBook).toBeGreaterThan(0);
    expect(result.btcCandles1m?.http5xxCount).toBeGreaterThan(0);
  });

  it("does not start candle HTTP when the parent capture lock is already held", async () => {
    const files = new Map<string, string>();
    let nowMs = Date.parse(PROCESS_START);
    let candleHttp = 0;
    const io: ForwardQuoteCaptureIo = {
      writeFile: (path, data) => {
        files.set(path, data);
      },
      appendFile: (path, data) => {
        files.set(path, `${files.get(path) ?? ""}${data}`);
      },
      mkdirSync: () => {},
      createExclusiveFile: (path, data) => {
        if (files.has(path)) {
          throw new Error(`EEXIST: ${path}`);
        }
        files.set(path, data);
      },
      deleteFile: (path) => {
        files.delete(path);
      },
      now: () => new Date(nowMs++),
      monotonicNowMs: () => nowMs,
    };

    acquireCaptureLock({ io, outputDir: "out/locked", runId: "other" });
    const lockPath = resolveCaptureLockPath("out/locked");
    const lockBefore = files.get(lockPath);

    await expect(
      runForwardQuoteCapture({
        config: { ...LIVE_CONFIG, outputDir: "out/locked", dryRun: true },
        io,
        fetchCompletedCandles: async (request) => {
          candleHttp += 1;
          return {
            ok: true,
            status: 200,
            body: [],
            requestStartedAtLocal: request.requestStartedAtLocal,
          };
        },
      }),
    ).rejects.toThrow(/capture lock/);

    expect(candleHttp).toBe(0);
    expect(files.get(lockPath)).toBe(lockBefore);
  });

  it("rejects post-finalize candle writes and keeps previously written complete lines", async () => {
    const { io, files } = createMemoryIo();
    const writer = createJsonlForwardCaptureWriter(
      io,
      createRunOutputPaths("out/capture", "run-finalize"),
    );
    const result = await runLiveForwardQuoteCapture({
      runId: "run-finalize",
      startedAt: PROCESS_START,
      config: LIVE_CONFIG,
      discovery: createDiscovery(),
      credentials: CREDENTIALS,
      io,
      writer,
      transport: new QuietKalshiTransport(),
      fetchCompletedCandles: okFetch,
      createProcessEpochId: () => "epoch-1",
    });
    expect(result.recordCounts.btcCandles).toBe(11);
    await writer.finalize();
    const before = files.get(result.paths.btcCandles1mPath) ?? "";
    writer.appendBtcCandles1m({
      runId: "run-finalize",
      processEpochId: "epoch-1",
      provider: "coinbase-spot",
      productId: LIVE_CANDLE_PRODUCT_ID,
      sourceRecordType: "exchange-completed-1m-ohlc",
      source: "coinbase-exchange-rest-candles",
      granularityMs: 60_000,
      candleOpenTime: "2026-07-20T13:48:00.000Z",
      candleCloseTime: "2026-07-20T13:48:59.999Z",
      open: 1,
      high: 2,
      low: 1,
      close: 1,
      volume: 1,
      observedAtLocal: PROCESS_START,
      firstObservedAtLocal: PROCESS_START,
      retrievalMethod: "rest-poll",
      observationIndex: 99,
      revisionClass: "first-observation",
      requestStartedAtLocal: PROCESS_START,
    });
    expect(files.get(result.paths.btcCandles1mPath)).toBe(before);
    expect(writer.diagnostics().writesRejectedAfterFinalization).toBe(1);
    expect(before.trim().split("\n")).toHaveLength(11);
  });
});

describe("candle sidecar evaluator compatibility", () => {
  it("loads writer JSONL in diagnostic mode and preserves as-of-T revision plus omitted minutes", async () => {
    const { io, files } = createMemoryIo();
    let nowMs = Date.parse(PROCESS_START);
    const paths = createRunOutputPaths("out/capture", "run-eval");
    const writer = createJsonlForwardCaptureWriter(
      { ...io, now: () => new Date(nowMs) },
      paths,
    );
    const bodies: unknown[][] = [
      elevenClosedMinutes(),
      [tuple(LAST_OPEN_MS, 199_000, 1)],
    ];
    const { createBtcCandles1mSidecar } = await import("./btcCandles1mSidecar");
    const sidecar = createBtcCandles1mSidecar({
      runId: "run-eval",
      processEpochId: "epoch-eval",
      now: () => new Date(nowMs),
      writer,
      fetchCompletedCandles: async (request) => ({
        ok: true,
        status: 200,
        body: bodies.shift() ?? [],
        requestStartedAtLocal: request.requestStartedAtLocal,
      }),
    });

    await sidecar.runStartupBackfill();
    nowMs = Date.parse(PROCESS_START) + 30_000;
    await sidecar.poll();
    await writer.finalize();

    const jsonl = files.get(paths.btcCandles1mPath) ?? "";
    expect(jsonl.length).toBeGreaterThan(0);
    for (const line of jsonl.trim().split("\n")) {
      const parsed = parseClosedMinuteObservation(JSON.parse(line), {
        requireObservationTimestamp: true,
      });
      expect(parsed.runId).toBe("run-eval");
      expect(parsed.provider).toBe("coinbase-spot");
    }

    const index = await preloadCompletedBtcCandleObservations({
      io: createMemoryCalibrationFadeForwardValidationIo({
        [paths.btcCandles1mPath]: jsonl,
      }),
      captureRunDir: paths.runDir,
      candlesPath: paths.btcCandles1mPath,
      evidenceMode: "diagnostic",
      expectedRunId: "run-eval",
      requireExplicitRunId: true,
    });
    expect(index.observations.length).toBeGreaterThanOrEqual(12);

    const history = index.byOpenTimeMs.get(LAST_OPEN_MS);
    expect(history?.observations.length).toBe(2);
    const first = selectCausalClosedMinuteAsOfT(history!, Date.parse(PROCESS_START) + 100);
    const latest = selectCausalClosedMinuteAsOfT(history!, Date.parse(PROCESS_START) + 60_000);
    expect(first?.close).toBe(100_010);
    expect(latest?.close).toBe(199_000);

    const missingOpen = M0_OPEN_MS + 4 * LIVE_CANDLE_GRANULARITY_MS;
    const missingJsonl = jsonl
      .trim()
      .split("\n")
      .filter((line) => !line.includes(new Date(missingOpen).toISOString()))
      .join("\n");
    const missingIndex = await preloadCompletedBtcCandleObservations({
      io: createMemoryCalibrationFadeForwardValidationIo({
        [paths.btcCandles1mPath]: `${missingJsonl}\n`,
      }),
      captureRunDir: paths.runDir,
      candlesPath: paths.btcCandles1mPath,
      evidenceMode: "diagnostic",
      expectedRunId: "run-eval",
      requireExplicitRunId: true,
    });
    const window = buildHistoricalReplicaVolatilityWindow({
      index: missingIndex,
      timestampMs: Date.parse(PROCESS_START) + 1_000,
    });
    expect(missingIndex.byOpenTimeMs.has(missingOpen)).toBe(false);
    expect(window.selectedOpenTimeMs.includes(missingOpen)).toBe(false);
  });
});
