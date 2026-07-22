import { describe, expect, it, vi } from "vitest";

import type { KalshiWsProbeTransport } from "@/features/market-data/orderbook/types";
import {
  KalshiWsHandshakeError,
  type KalshiCaptureCredentials,
} from "@/lib/data/live/kalshiWsCaptureSpike";

import { parseCaptureRunStatus } from "./captureRunStatus";
import { resolveCaptureLockPath } from "./captureLock";
import {
  createJsonlForwardCaptureWriter,
  createRunOutputPaths,
} from "./jsonlForwardCaptureWriter";
import { runForwardQuoteCapture } from "./runForwardQuoteCapture";
import { runLiveForwardQuoteCapture } from "./runLiveForwardQuoteCapture";
import type {
  ForwardQuoteCaptureConfig,
  ForwardQuoteCaptureIo,
} from "./forwardQuoteCaptureTypes";

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
      selectedMarketTickers: ["KXBTC15M-TEST"],
      marketStatuses: { "KXBTC15M-TEST": "active" },
      eventTickers: { "KXBTC15M-TEST": null },
      closeTimes: { "KXBTC15M-TEST": null },
      error: null,
    })),
  };
});

const OUTPUT_DIR = "in-memory/auth-failure/forward-quotes";

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

const LIVE_CONFIG: ForwardQuoteCaptureConfig = {
  series: "KXBTC15M",
  durationMinutes: 20,
  maxMarkets: 5,
  outputDir: OUTPUT_DIR,
  dryRun: false,
  captureBtcSpot: true,
  rolloverCheckSeconds: 30,
  healthFlushSeconds: 60,
  topOfBookThrottleMs: 1_000,
  wsWatchdogEnabled: true,
  wsSoftSilenceThresholdMs: 30_000,
  wsHardStallThresholdMs: 60_000,
  wsProbeGraceMs: 10_000,
  wsRecoveryMaxAttempts: 1,
};

/**
 * Deterministic transport that rejects the initial connect with a sanitized
 * handshake error — the same shape NodeKalshiAuthenticatedWsClient produces
 * for an HTTP 401 upgrade rejection.
 */
class Handshake401Transport implements KalshiWsProbeTransport {
  connectCount = 0;
  closeCount = 0;
  intervalStarted = false;
  private onErrorHandler: ((error: Error) => void) | null = null;

  async connect(): Promise<void> {
    this.connectCount += 1;
    const error = new KalshiWsHandshakeError({
      message: "Unexpected server response: 401",
      statusCode: 401,
      statusMessage: "Unauthorized",
    });
    this.onErrorHandler?.(error);
    throw error;
  }

  send(): void {
    throw new Error("send must not be called after a rejected handshake");
  }

  close(): void {
    this.closeCount += 1;
  }

  onOpen(): void {}

  onMessage(): void {}

  onClose(): void {}

  onError(handler: (error: Error) => void): void {
    this.onErrorHandler = handler;
  }

  ping(): void {}

  onPong(): void {}
}

function createMemoryIo() {
  const files = new Map<string, string>();
  const statusHistory: string[] = [];
  const intervals: Array<{ fn: () => void; ms: number }> = [];
  let nowMs = Date.UTC(2026, 6, 21, 23, 37, 23);
  let monotonicMs = 0;
  const lockPath = resolveCaptureLockPath(OUTPUT_DIR);
  const ops: Array<{ type: string; path?: string; from?: string; to?: string }> = [];

  const io: ForwardQuoteCaptureIo = {
    readFile: (path) => {
      const contents = files.get(path);
      if (contents === undefined) {
        throw new Error(`ENOENT: ${path}`);
      }
      return contents;
    },
    writeFile: (path, data) => {
      ops.push({ type: "write", path });
      files.set(path, data);
    },
    appendFile: (path, data) => {
      files.set(path, `${files.get(path) ?? ""}${data}`);
    },
    renameFile: (from, to) => {
      ops.push({ type: "rename", from, to });
      const contents = files.get(from);
      if (contents === undefined) {
        throw new Error(`ENOENT rename: ${from}`);
      }
      files.delete(from);
      files.set(to, contents);
      if (to.endsWith("capture-run-status.json")) {
        const parsed = parseCaptureRunStatus(contents);
        if (parsed) {
          statusHistory.push(parsed.state);
        }
      }
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
      monotonicMs += 1_000;
      return monotonicMs;
    },
    setInterval: (fn, ms) => {
      intervals.push({ fn, ms });
      return intervals.length;
    },
    clearInterval: () => {},
    fetchImpl: (async () =>
      new Response(JSON.stringify({ markets: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch,
  };

  return { io, files, statusHistory, intervals, ops, lockPath };
}

describe("live capture layer: initial WebSocket 401", () => {
  it("returns authentication-failure without starting producer intervals", async () => {
    const transport = new Handshake401Transport();
    const { io, intervals } = createMemoryIo();
    const paths = createRunOutputPaths(OUTPUT_DIR, "run-401");
    const writer = createJsonlForwardCaptureWriter(io, paths);
    let btcFetchCount = 0;

    const result = await runLiveForwardQuoteCapture({
      runId: "run-401",
      startedAt: "2026-07-21T23:37:23.813Z",
      config: LIVE_CONFIG,
      discovery: {
        attempted: true,
        succeeded: true,
        seriesTicker: "KXBTC15M",
        discoveredMarketCount: 1,
        selectedMarketTickers: ["KXBTC15M-TEST"],
        marketStatuses: { "KXBTC15M-TEST": "active" },
        eventTickers: { "KXBTC15M-TEST": null },
        closeTimes: { "KXBTC15M-TEST": null },
        error: null,
      },
      credentials: CREDENTIALS,
      io,
      writer,
      transport,
      fetchBtcSpot: async () => {
        btcFetchCount += 1;
        return { price: 100_000, updatedAt: "2026-07-21T23:37:23.813Z" };
      },
    });

    expect(result.captureEndReason).toBe("authentication-failure");
    expect(result.connection.completedNormally).toBe(false);
    expect(result.connection.liveConnectionSucceeded).toBe(false);
    expect(result.connection.captureEndReason).toBe("authentication-failure");
    expect(result.connected).toBe(false);
    expect(result.errors.some((error) => error.includes("401"))).toBe(true);
    expect(result.recordCounts.btcSpot).toBe(0);
    expect(btcFetchCount).toBe(0);
    expect(intervals).toHaveLength(0);
    expect(transport.closeCount).toBeGreaterThanOrEqual(1);
    expect(transport.connectCount).toBe(1);
  });
});

describe("orchestrator: initial WebSocket 401 finalization", () => {
  it("publishes failed terminal status, health, and releases the lock after status", async () => {
    const transport = new Handshake401Transport();
    const { io, files, statusHistory, ops, lockPath } = createMemoryIo();

    const result = await runForwardQuoteCapture({
      config: LIVE_CONFIG,
      io,
      htmlOutputPath: "out/auth-failure-report.html",
      transport,
      credentialEnv: {
        KALSHI_API_KEY_ID: "key-id",
        KALSHI_PRIVATE_KEY: "mock-private-key",
      },
    });

    expect(statusHistory).toEqual(["active", "finalizing", "failed"]);
    expect(result.healthReport.connection.captureEndReason).toBe("authentication-failure");
    expect(result.healthReport.connection.completedNormally).toBe(false);
    expect(result.healthReport.connection.liveConnectionSucceeded).toBe(false);
    expect(result.healthReport.verdict).not.toBe("capture-mvp-success");
    expect(result.healthReport.errors.join("\n")).toContain("401");
    expect(result.healthReport.capture.btcSpotRecordCount).toBe(0);

    const statusPath = `${OUTPUT_DIR}/${result.runId}/capture-run-status.json`;
    const healthPath = `${OUTPUT_DIR}/${result.runId}/capture-health.json`;
    const terminal = parseCaptureRunStatus(files.get(statusPath)!);
    expect(terminal).toMatchObject({
      state: "failed",
      captureEndReason: "authentication-failure",
      endedAt: expect.any(String),
    });
    expect(terminal?.failureReason).toContain("401");
    expect(files.has(healthPath)).toBe(true);

    // Lock released only after the function returns (finally after terminal publish).
    expect(files.has(lockPath)).toBe(false);

    // Terminal status rename happens after health rename (active status was
    // published earlier via its own atomic rename).
    const renames = ops.filter((op) => op.type === "rename");
    const healthRenameIndex = renames.findIndex((op) => op.to === healthPath);
    const terminalStatusRenameIndex = renames.findLastIndex((op) => op.to === statusPath);
    expect(healthRenameIndex).toBeGreaterThan(-1);
    expect(terminalStatusRenameIndex).toBeGreaterThan(healthRenameIndex);

    const allArtifacts = [...files.values()].join("\n");
    expect(allArtifacts).not.toContain("mock-private-key");
    expect(allArtifacts).not.toContain("mock-signature");
    expect(allArtifacts).not.toContain("KALSHI-ACCESS-SIGNATURE");
  });
});
