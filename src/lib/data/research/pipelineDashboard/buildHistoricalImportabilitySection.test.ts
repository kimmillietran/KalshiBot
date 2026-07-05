import { describe, expect, it } from "vitest";

import { buildHistoricalImportabilitySection } from "./buildHistoricalImportabilitySection";
import { normalizeExpansionImportMarketRecords } from "@/lib/data/research/coveragePlanner/importability";

const SUMMARY_PATH = "data/research-results/historical-expansion-import-summary.json";

describe("buildHistoricalImportabilitySection", () => {
  it("summarizes supported and unsupported windows from expansion import history", () => {
    const section = buildHistoricalImportabilitySection({
      summaryPath: SUMMARY_PATH,
      expansionImportSummary: {
        generatedAt: "2026-07-04T04:00:00.000Z",
        document: {
          generatedAt: "2026-07-04T04:00:00.000Z",
          inputPath: "data/import-configs/historical-expansion-config.json",
          outputPath: SUMMARY_PATH,
          execute: true,
          jobs: [
            {
              jobId: "expansion-KXBTC15M-20260101-20260131",
              seriesTicker: "KXBTC15M",
              markets: normalizeExpansionImportMarketRecords([
                {
                  marketTicker: "KXBTC15M-26JAN151215-00",
                  seriesTicker: "KXBTC15M",
                  status: "imported",
                },
                {
                  marketTicker: "KXBTC15M-26FEB151215-00",
                  seriesTicker: "KXBTC15M",
                  status: "failed",
                  errorMessage: "Kalshi historical market response missing required fields: expiration_value",
                },
              ]),
            },
          ],
        },
      },
    });

    expect(section.summaryPresent).toBe(true);
    expect(section.successfulImports).toBe(1);
    expect(section.unsupportedMarkets).toBe(1);
    expect(section.historicalSuccessRate).toBe(0.5);
    expect(section.supportedWindows + section.unsupportedWindows).toBeGreaterThan(0);
  });
});
