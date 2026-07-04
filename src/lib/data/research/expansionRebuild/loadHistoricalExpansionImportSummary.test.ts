import { describe, expect, it } from "vitest";

import {
  ExpansionRebuildError,
  ExpansionRebuildErrorCode,
} from "./expansionRebuildTypes";
import {
  extractImportedExpansionMarkets,
  parseHistoricalExpansionImportSummaryJson,
} from "./loadHistoricalExpansionImportSummary";

const SUMMARY_PATH = "data/research-results/historical-expansion-import-summary.json";

function createSummaryJson(): string {
  return JSON.stringify({
    generatedAt: "2026-07-04T12:00:00.000Z",
    execute: true,
    inputPath: "data/import-configs/historical-expansion-config.json",
    outputPath: SUMMARY_PATH,
    jobs: [
      {
        jobId: "expansion-KXBTC15M-20260101-20260331",
        seriesTicker: "KXBTC15M",
        markets: [
          {
            marketTicker: "KXBTC15M-MARKET-A",
            seriesTicker: "KXBTC15M",
            status: "imported",
            importResultPath: "data/imports/KXBTC15M/KXBTC15M-MARKET-A/import-result.json",
          },
          {
            marketTicker: "KXBTC15M-MARKET-B",
            seriesTicker: "KXBTC15M",
            status: "failed",
            importResultPath: null,
          },
          {
            marketTicker: "KXBTC15M-MARKET-C",
            seriesTicker: "KXBTC15M",
            status: "skipped",
            importResultPath: null,
          },
        ],
      },
    ],
  });
}

describe("parseHistoricalExpansionImportSummaryJson", () => {
  it("parses imported markets from expansion import summary", () => {
    const summary = parseHistoricalExpansionImportSummaryJson(
      SUMMARY_PATH,
      createSummaryJson(),
    );

    expect(summary.jobs).toHaveLength(1);
    expect(extractImportedExpansionMarkets(summary)).toEqual([
      {
        marketTicker: "KXBTC15M-MARKET-A",
        seriesTicker: "KXBTC15M",
        importResultPath: "data/imports/KXBTC15M/KXBTC15M-MARKET-A/import-result.json",
      },
    ]);
  });

  it("throws on invalid JSON", () => {
    expect(() =>
      parseHistoricalExpansionImportSummaryJson(SUMMARY_PATH, "{not-json"),
    ).toThrowError(ExpansionRebuildError);

    try {
      parseHistoricalExpansionImportSummaryJson(SUMMARY_PATH, "{not-json");
    } catch (error) {
      expect(error).toMatchObject({
        code: ExpansionRebuildErrorCode.INVALID_EXPANSION_IMPORT_SUMMARY_JSON,
      });
    }
  });
});
