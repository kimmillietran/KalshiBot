import { describe, expect, it, vi } from "vitest";

import { resolveKalshiCaptureCredentials } from "@/lib/data/live/kalshiWsCaptureSpike";

import { parseCaptureRunStatus } from "./captureRunStatus";
import { createEmptyConnectionDiagnostics } from "./connectionDiagnostics";
import { createEmptyOrderbookDiagnostics } from "./createEmptyOrderbookDiagnostics";
import { runForwardQuoteCapture } from "./runForwardQuoteCapture";
import { runLiveForwardQuoteCapture } from "./runLiveForwardQuoteCapture";
import type {
  ForwardQuoteCaptureConfig,
  ForwardQuoteCaptureIo,
} from "./forwardQuoteCaptureTypes";

vi.mock("./runLiveForwardQuoteCapture", () => ({
  runLiveForwardQuoteCapture: vi.fn(),
}));

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

vi.mock("@/lib/data/live/kalshiWsCaptureSpike", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/data/live/kalshiWsCaptureSpike")>();
  return {
    ...actual,
    resolveKalshiCaptureCredentials: vi.fn(actual.resolveKalshiCaptureCredentials),
  };
});

const AVAILABLE_CREDENTIALS = {
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
} as unknown as ReturnType<typeof resolveKalshiCaptureCredentials>;

const DRY_RUN_CONFIG: ForwardQuoteCaptureConfig = {
  series: "KXBTC15M",
  durationMinutes: 1,
  maxMarkets: 1,
  outputDir: "out/capture",
  dryRun: true,
  captureBtcSpot: false,
  rolloverCheckSeconds: 30,
  healthFlushSeconds: 60,
  topOfBookThrottleMs: 0,
  wsWatchdogEnabled: true,
  wsSoftSilenceThresholdMs: 30_000,
  wsHardStallThresholdMs: 60_000,
  wsProbeGraceMs: 10_000,
  wsRecoveryMaxAttempts: 5,
};

const LIVE_CONFIG: ForwardQuoteCaptureConfig = { ...DRY_RUN_CONFIG, dryRun: false };

type IoOp =
  | { type: "write"; path: string }
  | { type: "rename"; from: string; to: string };

function createLifecycleIo() {
  const ops: IoOp[] = [];
  const files: Record<string, string> = {};
  const statusHistory: string[] = [];

  const io: ForwardQuoteCaptureIo = {
    readFile: () => "",
    writeFile: (path, data) => {
      ops.push({ type: "write", path });
      files[path] = data;
    },
    appendFile: (path, data) => {
      files[path] = (files[path] ?? "") + data;
    },
    renameFile: (from, to) => {
      ops.push({ type: "rename", from, to });
      files[to] = files[from];
      delete files[from];
      if (to.endsWith("capture-run-status.json")) {
        const parsed = parseCaptureRunStatus(files[to]);
        if (parsed) {
          statusHistory.push(parsed.state);
        }
      }
    },
    mkdirSync: () => {},
    now: () => new Date("2026-07-21T00:00:00.000Z"),
    monotonicNowMs: () => 0,
  };

  return { io, ops, files, statusHistory };
}

describe("capture run lifecycle (runForwardQuoteCapture)", () => {
  it("progresses active -> finalizing -> completed for a dry run", async () => {
    const { io, ops, files, statusHistory } = createLifecycleIo();

    const result = await runForwardQuoteCapture({
      config: DRY_RUN_CONFIG,
      io,
      htmlOutputPath: "out/report.html",
    });

    expect(statusHistory).toEqual(["active", "finalizing", "completed"]);

    const statusPath = `out/capture/${result.runId}/capture-run-status.json`;
    const terminalStatus = parseCaptureRunStatus(files[statusPath]);
    expect(terminalStatus).toMatchObject({
      state: "completed",
      runId: result.runId,
      failureReason: null,
    });

    // Health must be renamed into place before the terminal status rename.
    const healthPath = `out/capture/${result.runId}/capture-health.json`;
    const renames = ops.filter((op): op is Extract<IoOp, { type: "rename" }> => op.type === "rename");
    const healthRenameIndex = renames.findIndex((op) => op.to === healthPath);
    const terminalStatusRenameIndex = renames.length - 1;
    expect(healthRenameIndex).toBeGreaterThan(-1);
    expect(renames[terminalStatusRenameIndex].to.endsWith("capture-run-status.json")).toBe(true);
    expect(healthRenameIndex).toBeLessThan(terminalStatusRenameIndex);

    // The health artifact itself must never be written at its final path.
    expect(
      ops.some((op) => op.type === "write" && op.path === healthPath),
    ).toBe(false);

    // Writer diagnostics are published in the health report after drain.
    expect(result.healthReport.writer).toBeDefined();
    expect(result.healthReport.writer?.allStreamsDrained).toBe(true);
    expect(result.healthReport.writer?.flushDurationMs).not.toBeNull();
    expect(result.healthReport.writer?.perArtifact.raw.recordsWritten).toBeGreaterThan(0);
  });

  it("progresses active -> finalizing -> failed when blocked before capture", async () => {
    const { io, statusHistory, files } = createLifecycleIo();
    vi.mocked(resolveKalshiCaptureCredentials).mockReturnValueOnce({
      ...AVAILABLE_CREDENTIALS,
      status: "missing",
    } as never);

    const result = await runForwardQuoteCapture({
      config: LIVE_CONFIG,
      io,
      htmlOutputPath: "out/report.html",
    });

    expect(statusHistory).toEqual(["active", "finalizing", "failed"]);
    const statusPath = `out/capture/${result.runId}/capture-run-status.json`;
    expect(parseCaptureRunStatus(files[statusPath])).toMatchObject({
      state: "failed",
      failureReason: "Missing or invalid Kalshi credentials.",
    });
  });

  it("publishes user-cancelled after drain when the live capture is stopped", async () => {
    const { io, statusHistory, files } = createLifecycleIo();
    vi.mocked(resolveKalshiCaptureCredentials).mockReturnValueOnce(AVAILABLE_CREDENTIALS);
    vi.mocked(runLiveForwardQuoteCapture).mockImplementationOnce(async (input) => {
      const writer = input.writer!;
      writer.appendRawKalshiWs({ seq: 1 });
      writer.appendTopOfBook({ seq: 1 });
      return {
        runId: input.runId,
        startedAt: input.startedAt,
        endedAt: input.io.now().toISOString(),
        paths: writer.paths,
        discovery: input.discovery,
        processor: {
          diagnostics: createEmptyOrderbookDiagnostics(),
          finalize: () => {},
        } as never,
        connection: createEmptyConnectionDiagnostics({
          wsConnectCount: 1,
          captureEndReason: "user-cancelled",
        }),
        rollover: {
          marketsDiscovered: 1,
          marketsSubscribed: 1,
          marketsClosed: 0,
          rolloverChecks: 0,
          rolloverSubscriptionsAdded: 0,
        },
        btcSpotStatus: "disabled",
        connected: true,
        wsUrl: "wss://example.test/ws",
        authHeadersGenerated: true,
        errors: [],
        recordCounts: writer.counts,
        watchdog: null,
        captureEndReason: "user-cancelled",
      };
    });

    const result = await runForwardQuoteCapture({
      config: LIVE_CONFIG,
      io,
      htmlOutputPath: "out/report.html",
    });

    expect(statusHistory).toEqual(["active", "finalizing", "user-cancelled"]);
    const statusPath = `out/capture/${result.runId}/capture-run-status.json`;
    expect(parseCaptureRunStatus(files[statusPath])).toMatchObject({
      state: "user-cancelled",
      captureEndReason: "user-cancelled",
      failureReason: null,
    });
    expect(result.healthReport.writer?.allStreamsDrained).toBe(true);
  });

  it("publishes failed with the writer failure reason on writer-failure", async () => {
    const { io, statusHistory, files } = createLifecycleIo();
    // A raw sink that fails on the second write simulates a persistent disk error.
    let rawWrites = 0;
    io.createAppendStream = (path) => ({
      write: (chunk) => {
        if (path.endsWith("raw-kalshi-ws.jsonl")) {
          rawWrites += 1;
          if (rawWrites > 1) {
            throw new Error("ENOSPC: no space left on device");
          }
        }
        void chunk;
        return true;
      },
      onceDrain: () => {},
      onError: () => {},
      end: () => Promise.resolve(),
    });

    vi.mocked(resolveKalshiCaptureCredentials).mockReturnValueOnce(AVAILABLE_CREDENTIALS);
    vi.mocked(runLiveForwardQuoteCapture).mockImplementationOnce(async (input) => {
      const writer = input.writer!;
      writer.appendRawKalshiWs({ seq: 1 });
      writer.appendRawKalshiWs({ seq: 2 });
      const failure = writer.getFailure();
      return {
        runId: input.runId,
        startedAt: input.startedAt,
        endedAt: input.io.now().toISOString(),
        paths: writer.paths,
        discovery: input.discovery,
        processor: {
          diagnostics: createEmptyOrderbookDiagnostics(),
          finalize: () => {},
        } as never,
        connection: createEmptyConnectionDiagnostics({
          wsConnectCount: 1,
          captureEndReason: "writer-failure",
          terminalFailureReason: "capture-writer-failure",
        }),
        rollover: {
          marketsDiscovered: 1,
          marketsSubscribed: 1,
          marketsClosed: 0,
          rolloverChecks: 0,
          rolloverSubscriptionsAdded: 0,
        },
        btcSpotStatus: "disabled",
        connected: true,
        wsUrl: "wss://example.test/ws",
        authHeadersGenerated: true,
        errors: [failure ? `Capture writer failed for ${failure.artifact}: ${failure.reason}` : ""],
        recordCounts: writer.counts,
        watchdog: null,
        captureEndReason: "writer-failure",
      };
    });

    const result = await runForwardQuoteCapture({
      config: LIVE_CONFIG,
      io,
      htmlOutputPath: "out/report.html",
    });

    expect(statusHistory).toEqual(["active", "finalizing", "failed"]);
    const statusPath = `out/capture/${result.runId}/capture-run-status.json`;
    expect(parseCaptureRunStatus(files[statusPath])).toMatchObject({
      state: "failed",
      captureEndReason: "writer-failure",
      failureReason: "ENOSPC: no space left on device",
    });
    expect(result.healthReport.writer?.failure).toMatchObject({
      artifact: "raw",
      reason: "ENOSPC: no space left on device",
    });
    // The first record was already written and preserved.
    expect(result.healthReport.writer?.perArtifact.raw.recordsWritten).toBe(1);
  });
});
