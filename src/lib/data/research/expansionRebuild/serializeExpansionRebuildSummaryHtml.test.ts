import { describe, expect, it } from "vitest";

import { serializeExpansionRebuildSummaryHtml } from "./serializeExpansionRebuildSummaryHtml";
import type { ExpansionRebuildSummary } from "./expansionRebuildTypes";

const SUMMARY: ExpansionRebuildSummary = {
  generatedAt: "2026-07-04T12:00:00.000Z",
  outputPath: "data/research-results/expansion-rebuild-summary.json",
  htmlOutputPath: "data/reports/expansion-rebuild-summary.html",
  inputPath: "data/research-results/historical-expansion-import-summary.json",
  fullRebuild: false,
  targetMarketCount: 1,
  before: {
    fixtureCount: 10,
    researchOutputCount: 10,
    registryMarketCount: 10,
    uniqueTradingDays: 4,
    atlasMarketCount: 10,
  },
  after: {
    fixtureCount: 11,
    researchOutputCount: 11,
    registryMarketCount: 11,
    uniqueTradingDays: 5,
    atlasMarketCount: 10,
  },
  fixtureResults: [
    {
      marketTicker: "KXBTC15M-MARKET-B",
      seriesTicker: "KXBTC15M",
      importResultPath: "data/imports/KXBTC15M/KXBTC15M-MARKET-B/import-result.json",
      fixturePath: "data/fixtures/KXBTC15M/KXBTC15M-MARKET-B/fixture.json",
      status: "success",
      errorMessage: null,
    },
  ],
  researchResults: [
    {
      marketTicker: "KXBTC15M-MARKET-B",
      seriesTicker: "KXBTC15M",
      fixturePath: "data/fixtures/KXBTC15M/KXBTC15M-MARKET-B/fixture.json",
      outputPath: "data/research-results/noop/KXBTC15M/KXBTC15M-MARKET-B/research-output.json",
      status: "success",
      errorMessage: null,
      runId: "fixture-KXBTC15M-MARKET-B",
    },
  ],
  summary: {
    fixturesBuilt: 1,
    fixturesSkipped: 0,
    fixturesFailed: 0,
    researchRunsSucceeded: 1,
    researchRunsSkipped: 0,
    researchRunsFailed: 0,
    registrySeriesCount: 1,
    durationMs: 42,
  },
  warnings: [],
};

describe("serializeExpansionRebuildSummaryHtml", () => {
  it("renders before/after metrics and per-market results", () => {
    const html = serializeExpansionRebuildSummaryHtml(SUMMARY);

    expect(html).toContain("Expansion Fixture + Research Rebuild");
    expect(html).toContain("Fixtures");
    expect(html).toContain("+1");
    expect(html).toContain("KXBTC15M-MARKET-B");
    expect(html).toContain("status-success");
  });
});
