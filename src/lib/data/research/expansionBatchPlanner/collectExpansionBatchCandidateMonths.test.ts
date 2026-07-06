import { describe, expect, it } from "vitest";

import {
  collectExpandedCandidateMonths,
  collectKnownCandidateMonths,
} from "./collectExpansionBatchCandidateMonths";
import type { HistoricalCoveragePlanReport } from "@/lib/data/research/coveragePlanner/coveragePlannerTypes";
import type { HistoricalExpansionImportConfig } from "@/lib/data/importJobs/expansionConfig/expansionConfigTypes";

function createCoveragePlan(): HistoricalCoveragePlanReport {
  return {
    generatedAt: "2026-04-01T00:00:00.000Z",
    outputPath: "data/research-results/historical-coverage-plan.json",
    htmlOutputPath: "data/reports/historical-coverage-plan.html",
    config: {} as HistoricalCoveragePlanReport["config"],
    inputStatus: {} as HistoricalCoveragePlanReport["inputStatus"],
    snapshot: {
      marketCount: 100,
      uniqueTradingDays: 20,
      monthCoverage: [],
      missingMonths: ["2026-03"],
      underCoveredMonths: ["2026-05"],
      coveredMonths: ["2026-04"],
      depthThresholds: { minMarketsPerMonth: 100, minTradingDaysPerMonth: 10 },
      coverageHorizon: { earliestMonth: "2026-03", latestMonth: "2026-05" },
      volatilityRegimeCoverage: [],
      marketTypeCoverage: [{ seriesTicker: "KXBTC15M", marketCount: 100 }],
      importConfigCount: 1,
      fixtureCount: 0,
      researchOutputCount: 0,
    },
    recommendations: [
      {
        recommendationId: "rec-1",
        seriesTicker: "KXBTC15M",
        startMonth: "2026-01",
        endMonth: "2026-03",
        missingMonths: ["2026-03"],
        priorityScore: 80,
        targetHypothesisIds: ["hyp-a"],
        expectedResearchBenefit: "Fill Q1 gaps.",
        estimatedSupportLevel: "high",
        estimatedUnsupportedRate: 0.05,
        rationale: "Q1 gap",
      },
    ],
    temporalBalance: {
      monthDiagnostics: [],
      hypothesisBalances: [{ hypothesisId: "hyp-a", hypothesis: "H1", thinMonths: ["2026-05"] }],
      unevenHypothesisCount: 1,
      thinMonthCount: 1,
      targetMinimumObservationsPerMonth: 20,
    },
    importability: null,
    plannerNotes: [],
  } as HistoricalCoveragePlanReport;
}

function createExpansionConfig(): HistoricalExpansionImportConfig {
  return {
    dryRun: false,
    generatedAt: "2026-04-01T00:00:00.000Z",
    importConfigsDir: "data/import-configs",
    inputPath: "data/research-results/historical-coverage-plan.json",
    outputPath: "data/import-configs/historical-expansion-config.json",
    summary: { recommendationCount: 1, scheduledJobCount: 1, skippedJobCount: 0 },
    jobs: [
      {
        jobId: "job-june",
        priority: 10,
        status: "scheduled",
        seriesTicker: "KXBTC15M",
        windowStart: "2026-06-01T00:00:00.000Z",
        windowEnd: "2026-06-30T23:59:59.999Z",
        discovery: {
          seriesTicker: "KXBTC15M",
          sampling: {
            afterDate: "2026-06-01T00:00:00.000Z",
            beforeDate: "2026-06-30T23:59:59.999Z",
          },
        },
        importDefaults: {} as HistoricalExpansionImportConfig["jobs"][number]["importDefaults"],
        estimatedMarketCount: null,
        expectedResearchBenefit: "June coverage",
        reason: "June gap",
        skipReason: null,
      },
    ],
  };
}

describe("collectExpansionBatchCandidateMonths", () => {
  it("collects known candidate months from coverage gaps only", () => {
    const months = collectKnownCandidateMonths(createCoveragePlan());
    expect(months).toEqual(["2026-03", "2026-05"]);
  });

  it("expands candidates using recommendation windows and scheduled jobs", () => {
    const expanded = collectExpandedCandidateMonths({
      coveragePlan: createCoveragePlan(),
      expansionConfig: createExpansionConfig(),
    });

    expect(expanded).toEqual(
      expect.arrayContaining(["2026-01", "2026-02", "2026-03", "2026-05", "2026-06"]),
    );
    expect(expanded.length).toBeGreaterThan(collectKnownCandidateMonths(createCoveragePlan()).length);
  });
});
