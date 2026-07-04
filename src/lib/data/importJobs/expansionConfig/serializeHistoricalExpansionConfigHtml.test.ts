import { describe, expect, it } from "vitest";

import { serializeHistoricalExpansionConfigHtml } from "./serializeHistoricalExpansionConfigHtml";
import type { HistoricalExpansionImportConfig } from "./expansionConfigTypes";

describe("serializeHistoricalExpansionConfigHtml", () => {
  it("renders scheduled jobs and summary counts", () => {
    const config: HistoricalExpansionImportConfig = {
      generatedAt: "2026-07-03T12:00:00.000Z",
      outputPath: "data/import-configs/historical-expansion-config.json",
      inputPath: "data/research-results/historical-coverage-plan.json",
      dryRun: true,
      importConfigsDir: "data/import-configs",
      summary: {
        recommendationCount: 1,
        scheduledJobCount: 1,
        skippedJobCount: 0,
      },
      jobs: [
        {
          jobId: "expansion-KXBTC15M-20260301-20260331",
          priority: 1,
          status: "scheduled",
          seriesTicker: "KXBTC15M",
          windowStart: "2026-03-01T00:00:00.000Z",
          windowEnd: "2026-03-31T23:59:59.000Z",
          estimatedMarketCount: 7200,
          reason: "March gap",
          expectedResearchBenefit: null,
          skipReason: null,
          discovery: {
            seriesTicker: "KXBTC15M",
            sampling: {
              afterDate: "2026-03-01T00:00:00.000Z",
              beforeDate: "2026-03-31T23:59:59.000Z",
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
    };

    const html = serializeHistoricalExpansionConfigHtml(config);

    expect(html).toContain("Historical Expansion Import Config");
    expect(html).toContain("expansion-KXBTC15M-20260301-20260331");
    expect(html).toContain("coinbase-spot");
    expect(html).toContain("7200");
  });
});
