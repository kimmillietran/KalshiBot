import { describe, expect, it } from "vitest";

import { buildExpansionRunHistorySection } from "./buildExpansionRunHistorySection";

describe("buildExpansionRunHistorySection", () => {
  it("returns empty section when history is missing", () => {
    const section = buildExpansionRunHistorySection(null);

    expect(section.historyPresent).toBe(false);
    expect(section.runCount).toBe(0);
    expect(section.efficiencyImproving).toBeNull();
  });

  it("renders dashboard highlights from history", () => {
    const section = buildExpansionRunHistorySection({
      schemaVersion: 1,
      generatedAt: "2026-07-05T12:00:00.000Z",
      outputPath: "data/research-results/expansion-run-history.json",
      htmlOutputPath: "data/reports/expansion-run-history.html",
      maxRunsRetained: 100,
      runs: [
        {
          runId: "2026-07-01T10:00:00.000Z",
          generatedAt: "2026-07-01T10:00:00.000Z",
          summarySourcePath: "data/research-results/historical-expansion-import-summary.json",
          maxMarkets: 1000,
          plannedCount: 1000,
          importedCount: 100,
          failedCount: 900,
          skippedCount: 0,
          unsupportedCount: 800,
          rateLimitedCount: 0,
          backoffDurationMs: 0,
          elapsedMs: 600_000,
          importsPerMinute: 10,
          discoveryTimeEstimateMs: 500_000,
          discoveryOverheadShare: 0.83,
          discoverySegmentsCacheHit: 0,
          discoverySegmentsRefreshed: 0,
          estimatedDiscoverySavingsMs: 0,
          cacheEnabled: true,
          discoverySegmentsCorrupt: 0,
          sampleStrategy: "supported-first",
          adaptiveThrottleEnabled: false,
          resultingFixtureCount: 100,
          resultingAtlasMarketCount: 80,
          researchYieldPerImportedMarket: 0.8,
          importSuccessRate: 0.1,
          unsupportedRate: 0.8,
          rateLimitRate: 0,
          execute: true,
          runStatus: "partial",
        },
        {
          runId: "2026-07-05T12:00:00.000Z",
          generatedAt: "2026-07-05T12:00:00.000Z",
          summarySourcePath: "data/research-results/historical-expansion-import-summary.json",
          maxMarkets: 1000,
          plannedCount: 1000,
          importedCount: 984,
          failedCount: 16,
          skippedCount: 0,
          unsupportedCount: 0,
          rateLimitedCount: 2,
          backoffDurationMs: 5000,
          elapsedMs: 500_000,
          importsPerMinute: 118,
          discoveryTimeEstimateMs: 200_000,
          discoveryOverheadShare: 0.4,
          discoverySegmentsCacheHit: 5,
          discoverySegmentsRefreshed: 1,
          estimatedDiscoverySavingsMs: 80_000,
          cacheEnabled: true,
          discoverySegmentsCorrupt: 0,
          sampleStrategy: "supported-first",
          adaptiveThrottleEnabled: true,
          resultingFixtureCount: 984,
          resultingAtlasMarketCount: 900,
          researchYieldPerImportedMarket: 0.91,
          importSuccessRate: 0.984,
          unsupportedRate: 0,
          rateLimitRate: 0.002,
          execute: true,
          runStatus: "completed",
        },
      ],
    });

    expect(section.runCount).toBe(2);
    expect(section.latestImportedCount).toBe(984);
    expect(section.bestThroughputImportsPerMinute).toBe(118);
    expect(section.worstBottleneckDiscoveryShare).toBe(0.83);
    expect(section.efficiencyImproving).toBe(true);
  });
});
