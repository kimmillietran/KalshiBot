import { describe, expect, it } from "vitest";

import { runQuoteFidelityGateCommand } from "./buildQuoteFidelityGate";

const REGISTRY_FIXTURE = {
  generatedAt: "2026-01-01T00:00:00.000Z",
  seriesTicker: "KXBTC15M",
  fixturesRoot: "data/fixtures/KXBTC15M",
  metadataRoot: null,
  summary: {
    marketCount: 1,
    linkedMetadataCount: 0,
    totalBronzeRecords: 10,
    totalBtcBars: 5,
    totalKalshiCandles: 5,
    settlementMarketCount: 1,
    validFixtureCount: 1,
    suspiciousZeroSpreadMarketCount: 1,
  },
  markets: [
    {
      seriesTicker: "KXBTC15M",
      marketTicker: "KXBTC15M-26MAY081945-45",
      fixturePath: "data/fixtures/KXBTC15M/KXBTC15M-26MAY081945-45/fixture.json",
      metadataPath: null,
      marketCloseTime: "2026-05-08T23:45:00Z",
      settlementPresent: true,
      bronzeRecordCount: 10,
      btcBarCount: 5,
      kalshiCandleCount: 5,
      validationStatus: { valid: true, errorCount: 0, warningCount: 0 },
      bidAskFidelity: {
        statistics: {
          candleCount: 5,
          equalBidAskCount: 5,
          bidLessThanAskCount: 0,
          bidGreaterThanAskCount: 0,
          missingBidAskCount: 0,
          liveCloseOnlyCount: 5,
          minSpreadCents: 0,
          averageSpreadCents: 0,
          maxSpreadCents: 0,
          percentZeroSpread: 100,
          percentInvertedSpread: 0,
        },
        warnings: [
          { code: "live-close-only-quotes", severity: "warning", message: "live close only" },
          { code: "all-candles-zero-spread", severity: "warning", message: "zero spread" },
        ],
        suspiciousZeroSpread: true,
      },
      provenance: { runId: "r1", strategyId: "noop", sources: ["kalshi-candles"] },
      importMetadata: null,
    },
  ],
};

describe("runQuoteFidelityGateCommand", () => {
  it("returns zero and writes report for valid registry", () => {
    const stdout: string[] = [];
    const written: Record<string, string> = {};

    const exitCode = runQuoteFidelityGateCommand(
      ["--output", "out.json", "--html-output", "out.html"],
      {
        readFile: (path) => {
          if (path.includes("dataset-registry")) {
            return JSON.stringify(REGISTRY_FIXTURE);
          }

          return "{}";
        },
        writeStdout: (text) => {
          stdout.push(text);
        },
        writeStderr: () => {},
        writeFile: (path, data) => {
          written[path] = data;
        },
        mkdirSync: () => {},
        fileExists: (path) => path.includes("dataset-registry"),
        readdir: () => [],
        isDirectory: () => false,
      },
      { generatedAt: "2026-01-01T00:00:00.000Z" },
    );

    expect(exitCode).toBe(0);
    expect(stdout.join("")).toContain("blocked-no-ladder");
    expect(written["out.json"]).toContain("blocked-no-ladder");
    expect(written["out.html"]).toContain("Do Not Claim");
  });
});
