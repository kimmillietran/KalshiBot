import { describe, expect, it } from "vitest";

import {
  parseCaptureSpikeConfigFromArgv,
  parseHtmlOutputPathFromArgv,
} from "./runKalshiWsCaptureSpikeTypes";

describe("runKalshiWsCaptureSpike CLI args", () => {
  it("parses required capture spike flags", () => {
    const config = parseCaptureSpikeConfigFromArgv([
      "--series",
      "KXBTC15M",
      "--duration-seconds",
      "300",
      "--max-markets",
      "1",
      "--output-dir",
      "data/live-capture/kalshi-ws-spike",
      "--dry-run",
      "--capture-btc-spot",
    ]);

    expect(config).toEqual({
      series: "KXBTC15M",
      durationSeconds: 300,
      maxMarkets: 1,
      outputDir: "data/live-capture/kalshi-ws-spike",
      dryRun: true,
      marketTicker: undefined,
      privateKeyPath: undefined,
      captureBtcSpot: true,
      restSnapshotIntervalSeconds: null,
      mockInput: true,
    });
  });

  it("parses private key path override", () => {
    const config = parseCaptureSpikeConfigFromArgv([
      "--series",
      "KXBTC15M",
      "--private-key-path",
      "C:\\Users\\me\\.kalshi\\key.pem",
      "--dry-run",
    ]);

    expect(config.privateKeyPath).toBe("C:\\Users\\me\\.kalshi\\key.pem");
  });

  it("parses html output path override", () => {
    expect(
      parseHtmlOutputPathFromArgv([
        "--html-output",
        "data/reports/custom-kalshi-ws-capture-spike.html",
      ]),
    ).toBe("data/reports/custom-kalshi-ws-capture-spike.html");
  });
});
