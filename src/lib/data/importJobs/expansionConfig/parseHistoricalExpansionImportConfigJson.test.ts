import { describe, expect, it } from "vitest";

import {
  assertExpansionConfigNotCoveragePlan,
  parseHistoricalExpansionImportConfigJson,
} from "./parseHistoricalExpansionImportConfigJson";
import { ExpansionConfigError } from "./expansionConfigTypes";

const OUTPUT_PATH = "data/import-configs/historical-expansion-config.json";

describe("assertExpansionConfigNotCoveragePlan", () => {
  it("rejects coverage-plan-shaped documents", () => {
    expect(() =>
      assertExpansionConfigNotCoveragePlan(
        {
          generatedAt: "2026-07-04T00:00:00.000Z",
          recommendations: [],
          snapshot: { marketCount: 1 },
        },
        OUTPUT_PATH,
      ),
    ).toThrow(ExpansionConfigError);
  });
});

describe("parseHistoricalExpansionImportConfigJson", () => {
  it("parses a valid expansion import config", () => {
    const parsed = parseHistoricalExpansionImportConfigJson(
      OUTPUT_PATH,
      JSON.stringify({
        generatedAt: "2026-07-04T00:00:00.000Z",
        outputPath: OUTPUT_PATH,
        inputPath: "data/research-results/historical-coverage-plan.json",
        dryRun: false,
        importConfigsDir: "data/import-configs",
        summary: {
          recommendationCount: 1,
          scheduledJobCount: 1,
          skippedJobCount: 0,
        },
        jobs: [
          {
            jobId: "expansion-KXBTC15M-20260101-20260331",
            priority: 71,
            status: "scheduled",
            seriesTicker: "KXBTC15M",
            windowStart: "2026-01-01T00:00:00.000Z",
            windowEnd: "2026-03-31T23:59:59.999Z",
            discovery: {
              seriesTicker: "KXBTC15M",
              sampling: {
                afterDate: "2026-01-01T00:00:00.000Z",
                beforeDate: "2026-03-31T23:59:59.999Z",
              },
            },
            importDefaults: {
              kalshi: {
                marketSource: "kalshi-rest",
                candleSource: "kalshi-candles",
                settlementSource: "kalshi-rest",
              },
              btc: {
                provider: "coinbase-spot",
                symbol: "BTC-USD",
                interval: "1m",
              },
              output: {
                format: "json",
                includeValidationReport: true,
                includeFixture: false,
              },
            },
          },
        ],
      }),
    );

    expect(parsed.outputPath).toBe(OUTPUT_PATH);
    expect(parsed.jobs).toHaveLength(1);
    expect(parsed.jobs[0]?.jobId).toBe("expansion-KXBTC15M-20260101-20260331");
  });
});
