import { describe, expect, it } from "vitest";

import { runKalshiWsCaptureSpike } from "./runKalshiWsCaptureSpike";
import type { KalshiWsCaptureSpikeIo } from "./kalshiWsCaptureSpikeTypes";

function createMemoryIo(now = new Date("2026-07-08T12:00:00.000Z")): {
  io: KalshiWsCaptureSpikeIo;
  files: Map<string, string>;
} {
  const files = new Map<string, string>();

  return {
    files,
    io: {
      writeFile: (path, data) => {
        files.set(path, data);
      },
      appendFile: (path, data) => {
        files.set(path, `${files.get(path) ?? ""}${data}`);
      },
      mkdirSync: () => {},
      now: () => now,
      monotonicNowMs: () => 123,
    },
  };
}

describe("runKalshiWsCaptureSpike", () => {
  it("writes dry-run raw and top-of-book JSONL artifacts", async () => {
    const { io, files } = createMemoryIo();
    const result = await runKalshiWsCaptureSpike({
      config: {
        series: "KXBTC15M",
        durationSeconds: 5,
        maxMarkets: 1,
        outputDir: "data/live-capture/kalshi-ws-spike",
        dryRun: true,
        captureBtcSpot: true,
        restSnapshotIntervalSeconds: null,
        mockInput: true,
      },
      io,
      htmlOutputPath: "data/reports/kalshi-ws-capture-spike.html",
    });

    expect(result.healthReport.verdict).toBe("dry-run-ok");
    expect(result.healthReport.capture.messagesReceived).toBeGreaterThan(0);
    expect(result.healthReport.orderbook.validTopOfBookRecords).toBeGreaterThan(0);
    expect(result.healthReport.orderbook.sequenceGapCount).toBe(1);
    expect(result.healthReport.btcSpot.status).toBe("enabled");

    const rawPath = result.healthReport.capture.rawMessagesPath.replaceAll("\\", "/");
    const topPath = result.healthReport.capture.topOfBookPath.replaceAll("\\", "/");
    expect(files.get(rawPath)?.split("\n").filter(Boolean).length).toBeGreaterThan(0);
    expect(files.get(topPath)?.split("\n").filter(Boolean).length).toBeGreaterThan(0);
    expect(files.get("data/reports/kalshi-ws-capture-spike.html")).toContain("dry-run-ok");
  });

  it("returns blocked-missing-credentials when live run has no credentials", async () => {
    const { io } = createMemoryIo();
    const result = await runKalshiWsCaptureSpike({
      config: {
        series: "KXBTC15M",
        durationSeconds: 5,
        maxMarkets: 1,
        outputDir: "data/live-capture/kalshi-ws-spike",
        dryRun: false,
        captureBtcSpot: false,
        restSnapshotIntervalSeconds: null,
        mockInput: false,
      },
      io,
      deps: {
        resolveCredentials: () => ({
          status: "missing",
          apiKeyId: null,
          apiPrivateKey: null,
          apiBaseUrl: null,
          wsUrl: null,
        }),
        discoverMarkets: async () => ({
          attempted: true,
          succeeded: true,
          seriesTicker: "KXBTC15M",
          discoveredMarketCount: 1,
          selectedMarketTickers: ["KXBTC15M-TEST"],
          marketStatuses: { "KXBTC15M-TEST": "open" },
          eventTickers: { "KXBTC15M-TEST": null },
          closeTimes: { "KXBTC15M-TEST": null },
          error: null,
        }),
      },
    });

    expect(result.healthReport.verdict).toBe("blocked-missing-credentials");
    expect(result.healthReport.connection.credentialStatus).toBe("missing");
    expect(result.healthReport.recommendedNextAction).toBe("configure-credentials");
  });

  it("supports market discovery fallback via market ticker override", async () => {
    const { io } = createMemoryIo();
    const result = await runKalshiWsCaptureSpike({
      config: {
        series: "KXBTC15M",
        durationSeconds: 5,
        maxMarkets: 1,
        outputDir: "data/live-capture/kalshi-ws-spike",
        dryRun: true,
        marketTicker: "KXBTC15M-OVERRIDE",
        captureBtcSpot: false,
        restSnapshotIntervalSeconds: null,
        mockInput: true,
      },
      io,
    });

    expect(result.healthReport.marketDiscovery.selectedMarketTickers).toEqual([
      "KXBTC15M-OVERRIDE",
    ]);
  });

  it("does not fail when BTC spot capture is disabled", async () => {
    const { io } = createMemoryIo();
    const result = await runKalshiWsCaptureSpike({
      config: {
        series: "KXBTC15M",
        durationSeconds: 5,
        maxMarkets: 1,
        outputDir: "data/live-capture/kalshi-ws-spike",
        dryRun: true,
        captureBtcSpot: false,
        restSnapshotIntervalSeconds: null,
        mockInput: true,
      },
      io,
    });

    expect(result.healthReport.btcSpot.status).toBe("disabled");
    expect(result.healthReport.btcSpot.recordsCaptured).toBe(0);
  });
});
