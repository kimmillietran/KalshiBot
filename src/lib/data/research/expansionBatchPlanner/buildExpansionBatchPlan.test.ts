import { describe, expect, it } from "vitest";

import type { HistoricalCoveragePlanReport } from "@/lib/data/research/coveragePlanner/coveragePlannerTypes";
import type { CoverageAwareValidationClassification } from "@/lib/data/research/coverageAwareValidation/coverageAwareValidationTypes";

import {
  allocateExpansionBatchBudget,
  buildExpansionBatchMonthCandidates,
  buildExpansionBatchPlan,
  expansionBatchAllocationTotal,
  scoreExpansionBatchMonthCandidates,
  serializeExpansionBatchPlanHtml,
} from "./index";

const BASE_GENERATED_AT = "2026-04-01T12:00:00.000Z";

function createCoveragePlanFixture(
  overrides?: Partial<HistoricalCoveragePlanReport>,
): HistoricalCoveragePlanReport {
  return {
    generatedAt: BASE_GENERATED_AT,
    outputPath: "data/research-results/historical-coverage-plan.json",
    htmlOutputPath: "data/reports/historical-coverage-plan.html",
    config: {
      outputPath: "data/research-results/historical-coverage-plan.json",
      htmlOutputPath: "data/reports/historical-coverage-plan.html",
      dataHealthPath: "data/research-results/data-health.json",
      mispricingAtlasPath: "data/research-results/mispricing-atlas.json",
      hypothesisValidationPath: "data/research-results/hypothesis-validation.json",
      regimeTagsPath: "data/research-results/regime-tags.json",
      expansionImportSummaryPath:
        "data/research-results/historical-expansion-import-summary.json",
      importConfigsDir: "data/import-configs",
      fixturesDir: "data/fixtures",
      researchResultsDir: "data/research-results",
      monthPersistenceThreshold: 0.67,
      minMarketsPerMonth: 100,
      minTradingDaysPerMonth: 10,
    },
    inputStatus: {
      dataHealthPath: "data/research-results/data-health.json",
      mispricingAtlasPath: "data/research-results/mispricing-atlas.json",
      hypothesisValidationPath: "data/research-results/hypothesis-validation.json",
      regimeTagsPath: "data/research-results/regime-tags.json",
      expansionImportSummaryPath:
        "data/research-results/historical-expansion-import-summary.json",
      importConfigsDir: "data/import-configs",
      fixturesDir: "data/fixtures",
      researchResultsDir: "data/research-results",
      dataHealthPresent: true,
      mispricingAtlasPresent: true,
      hypothesisValidationPresent: true,
      regimeTagsPresent: true,
      expansionImportSummaryPresent: true,
    },
    snapshot: {
      marketCount: 500,
      uniqueTradingDays: 120,
      monthCoverage: [
        {
          month: "2026-01",
          marketCount: 20,
          tradingDayCount: 8,
          coverageStatus: "UNDER_COVERED",
          thresholds: {
            minMarketsPerMonth: 100,
            minTradingDaysPerMonth: 10,
            marketsMet: false,
            tradingDaysMet: false,
          },
        },
        {
          month: "2026-03",
          marketCount: 0,
          tradingDayCount: 0,
          coverageStatus: "MISSING",
          thresholds: {
            minMarketsPerMonth: 100,
            minTradingDaysPerMonth: 10,
            marketsMet: false,
            tradingDaysMet: false,
          },
        },
        {
          month: "2026-05",
          marketCount: 10,
          tradingDayCount: 4,
          coverageStatus: "UNDER_COVERED",
          thresholds: {
            minMarketsPerMonth: 100,
            minTradingDaysPerMonth: 10,
            marketsMet: false,
            tradingDaysMet: false,
          },
        },
      ],
      missingMonths: ["2026-03"],
      underCoveredMonths: ["2026-01", "2026-05"],
      coveredMonths: [],
      depthThresholds: {
        minMarketsPerMonth: 100,
        minTradingDaysPerMonth: 10,
      },
      coverageHorizon: {
        earliestMonth: "2026-01",
        latestMonth: "2026-05",
      },
      volatilityRegimeCoverage: [],
      marketTypeCoverage: [{ seriesTicker: "KXBTC15M", marketCount: 500, monthCount: 3, tickerPattern: "KXBTC15M-*" }],
      importConfigCount: 100,
      fixtureCount: 100,
      researchOutputCount: 100,
    },
    recommendations: [
      {
        recommendationId: "rec-march",
        recommendationType: "coverage-gap-import",
        seriesTicker: "KXBTC15M",
        startMonth: "2026-03",
        endMonth: "2026-03",
        missingMonths: ["2026-03"],
        includesMissing: true,
        includesUnderCovered: false,
        priorityScore: 90,
        rationale: "March is missing entirely.",
        expectedResearchBenefit: "Fill missing March coverage.",
        supportingHypothesisIds: ["hyp-a"],
        targetHypothesisIds: ["hyp-a"],
        estimatedSupportLevel: "high",
        estimatedUnsupportedRate: 0.05,
      },
      {
        recommendationId: "rec-january",
        recommendationType: "temporal-balance-import",
        seriesTicker: "KXBTC15M",
        startMonth: "2026-01",
        endMonth: "2026-01",
        missingMonths: ["2026-01"],
        includesMissing: false,
        includesUnderCovered: true,
        priorityScore: 55,
        rationale: "January is thin for promising hypotheses.",
        expectedResearchBenefit: "Improve month persistence.",
        supportingHypothesisIds: ["hyp-b"],
        targetHypothesisIds: ["hyp-b"],
        estimatedSupportLevel: "medium",
        estimatedUnsupportedRate: 0.1,
      },
      {
        recommendationId: "rec-may",
        recommendationType: "coverage-gap-import",
        seriesTicker: "KXBTC15M",
        startMonth: "2026-05",
        endMonth: "2026-05",
        missingMonths: ["2026-05"],
        includesMissing: false,
        includesUnderCovered: true,
        priorityScore: 40,
        rationale: "May is under-covered.",
        expectedResearchBenefit: "Add May evidence.",
        supportingHypothesisIds: ["hyp-c"],
        targetHypothesisIds: ["hyp-c"],
        estimatedSupportLevel: "low",
        estimatedUnsupportedRate: 0.55,
      },
    ],
    temporalBalance: {
      monthDiagnostics: [
        { month: "2026-01", marketCount: 20, researchObservationCount: 12, qualifyingHypothesisObservationCount: 8 },
        { month: "2026-03", marketCount: 0, researchObservationCount: 0, qualifyingHypothesisObservationCount: 0 },
        { month: "2026-05", marketCount: 10, researchObservationCount: 6, qualifyingHypothesisObservationCount: 4 },
      ],
      hypothesisBalances: [
        {
          hypothesisId: "hyp-a",
          hypothesis: "Hypothesis A",
          robustnessScore: 72,
          monthObservationDistribution: [
            { month: "2026-01", observations: 20 },
            { month: "2026-03", observations: 2 },
            { month: "2026-05", observations: 15 },
          ],
          weakestMonths: ["2026-03"],
          thinMonths: ["2026-03"],
          targetMinimumObservationsPerMonth: 20,
          expectedValidationBenefit: "Expected to improve month persistence.",
          validationBenefit: {
            improvesMonthPersistence: true,
            improvesLeaveOneMonthOutStability: true,
            improvesSampleConcentration: false,
          },
        },
        {
          hypothesisId: "hyp-b",
          hypothesis: "Hypothesis B",
          robustnessScore: 68,
          monthObservationDistribution: [
            { month: "2026-01", observations: 4 },
            { month: "2026-05", observations: 18 },
          ],
          weakestMonths: ["2026-01"],
          thinMonths: ["2026-01"],
          targetMinimumObservationsPerMonth: 20,
          expectedValidationBenefit: "Expected to improve sample concentration.",
          validationBenefit: {
            improvesMonthPersistence: false,
            improvesLeaveOneMonthOutStability: false,
            improvesSampleConcentration: true,
          },
        },
      ],
      unevenHypothesisCount: 2,
      thinMonthCount: 2,
      targetMinimumObservationsPerMonth: 20,
    },
    importability: {
      summaryPath: "data/research-results/historical-expansion-import-summary.json",
      summaryPresent: true,
      attemptedMarkets: 10,
      successfulImports: 7,
      historicalSuccessRate: 0.7,
      unsupportedMarkets: 2,
      estimatedUnsupportedRate: 0.2,
    },
    plannerNotes: [],
    ...overrides,
  };
}

function createLoadedInputs(
  coveragePlan: HistoricalCoveragePlanReport,
  classification: CoverageAwareValidationClassification = "promising-needs-more-history",
) {
  return {
    inputStatus: {
      coveragePlanPresent: true,
      expansionConfigPresent: true,
      expansionImportSummaryPresent: true,
      hypothesisValidationPresent: true,
      coverageAwareValidationPresent: true,
      discoveryResultPresent: true,
    },
    coveragePlan,
    expansionConfig: {
      generatedAt: BASE_GENERATED_AT,
      outputPath: "data/import-configs/historical-expansion-config.json",
      inputPath: "data/research-results/historical-coverage-plan.json",
      dryRun: false,
      importConfigsDir: "data/import-configs",
      summary: {
        recommendationCount: 3,
        scheduledJobCount: 3,
        skippedJobCount: 0,
      },
      jobs: [],
    },
    expansionImportSummary: null,
    hypothesisValidation: null,
    coverageAwareValidation: {
      generatedAt: BASE_GENERATED_AT,
      outputPath: "data/research-results/coverage-aware-validation.json",
      htmlOutputPath: "data/reports/coverage-aware-validation.html",
      inputPaths: {
        hypothesisValidationPath: "data/research-results/hypothesis-validation.json",
        crossValidationPath: "data/research-results/cross-validation.json",
        coveragePlanPath: "data/research-results/historical-coverage-plan.json",
        hypothesisCandidatesPath: "data/research-results/hypothesis-candidates.json",
      },
      thresholds: {
        minMonthsForJudgment: 3,
        minTradingDaysForJudgment: 8,
        minObservationsForJudgment: 6,
        minRegimesForJudgment: 2,
        promisingRobustnessFloor: 50,
      },
      summary: {
        totalHypotheses: 1,
        rejectedCount: 0,
        inconclusiveInsufficientCoverageCount: 0,
        inconclusiveRegimeSparseCount: 0,
        promisingNeedsMoreHistoryCount: 1,
        robustEnoughToTestCount: 0,
      },
      entries: [
        {
          hypothesisId: "hyp-a",
          hypothesis: "Hypothesis A",
          classification,
          metrics: {
            observationCount: 40,
            uniqueTradingDays: 20,
            monthCount: 3,
            regimeCoverage: {
              regimesWithData: 2,
              regimesWithEdge: 1,
              sparseRegimes: [],
            },
            robustnessScore: 72,
            largestDayPercent: 0.2,
            singleDayDominated: false,
            crossValidationPasses: null,
          },
          rationale: "Needs more history.",
          recommendedImportWindows: [],
        },
      ],
    },
    discoveryMarketsByMonth: new Map([
      ["2026-01", 300],
      ["2026-03", 800],
      ["2026-05", 250],
    ]),
  };
}

describe("buildExpansionBatchPlan", () => {
  it("allocates the full budget across month buckets", () => {
    const coveragePlan = createCoveragePlanFixture();
    const loaded = createLoadedInputs(coveragePlan);
    const candidates = buildExpansionBatchMonthCandidates(loaded, []);
    const scored = scoreExpansionBatchMonthCandidates(candidates, "research-value", "seed");
    const allocations = allocateExpansionBatchBudget({
      maxMarkets: 1000,
      candidates: scored,
    });

    expect(expansionBatchAllocationTotal(allocations)).toBe(1000);
    expect(allocations.length).toBeGreaterThan(0);
  });

  it("prioritizes promising-hypothesis months under research-value strategy", () => {
    const coveragePlan = createCoveragePlanFixture();
    const loaded = createLoadedInputs(coveragePlan);
    const candidates = buildExpansionBatchMonthCandidates(loaded, []);
    const scored = scoreExpansionBatchMonthCandidates(candidates, "research-value", "seed");
    const allocations = allocateExpansionBatchBudget({
      maxMarkets: 1000,
      candidates: scored,
    });

    const march = allocations.find((entry) => entry.month === "2026-03");
    const may = allocations.find((entry) => entry.month === "2026-05");

    expect(march?.marketCount ?? 0).toBeGreaterThan(may?.marketCount ?? 0);
    expect(march?.targetHypothesisIds).toContain("hyp-a");
  });

  it("prioritizes under-covered months under temporal-balance strategy", () => {
    const coveragePlan = createCoveragePlanFixture();
    const loaded = createLoadedInputs(coveragePlan);
    const candidates = buildExpansionBatchMonthCandidates(loaded, []);
    const scored = scoreExpansionBatchMonthCandidates(candidates, "temporal-balance", "seed");
    const allocations = allocateExpansionBatchBudget({
      maxMarkets: 1000,
      candidates: scored,
    });

    const january = allocations.find((entry) => entry.month === "2026-01");
    const march = allocations.find((entry) => entry.month === "2026-03");

    expect(january?.marketCount ?? 0).toBeGreaterThan(0);
    expect(march?.marketCount ?? 0).toBeGreaterThan(0);
    expect((january?.currentObservations ?? 0)).toBeLessThan(january?.desiredObservations ?? 0);
  });

  it("deprioritizes unsupported-heavy windows under supported-first strategy", () => {
    const coveragePlan = createCoveragePlanFixture();
    const loaded = createLoadedInputs(coveragePlan);
    const candidates = buildExpansionBatchMonthCandidates(loaded, [
      {
        marketTicker: "KXBTC15M-26MAY010000-00",
        seriesTicker: "KXBTC15M",
        status: "failed",
        errorMessage: "unsupported",
        skipReason: null,
        calendarMonth: "2026-05",
        outcomeCategory: "unsupported-market",
      },
      {
        marketTicker: "KXBTC15M-26MAY010015-15",
        seriesTicker: "KXBTC15M",
        status: "failed",
        errorMessage: "unsupported",
        skipReason: null,
        calendarMonth: "2026-05",
        outcomeCategory: "unsupported-market",
      },
      {
        marketTicker: "KXBTC15M-26MAR010000-00",
        seriesTicker: "KXBTC15M",
        status: "imported",
        errorMessage: null,
        skipReason: null,
        calendarMonth: "2026-03",
        outcomeCategory: "successful-import",
      },
    ]);
    const mayCandidate = candidates.find((entry) => entry.month === "2026-05");
    const marchCandidate = candidates.find((entry) => entry.month === "2026-03");

    expect(mayCandidate?.expectedImportability).toBe("low");
    expect(marchCandidate?.expectedImportability).toBe("high");

    const scored = scoreExpansionBatchMonthCandidates(candidates, "supported-first", "seed");
    const allocations = allocateExpansionBatchBudget({
      maxMarkets: 300,
      candidates: scored,
    });

    const march = allocations.find((entry) => entry.month === "2026-03");
    const may = allocations.find((entry) => entry.month === "2026-05");

    expect(march?.marketCount ?? 0).toBeGreaterThan(may?.marketCount ?? 0);
  });

  it("renders HTML for the batch plan", () => {
    const plan = buildExpansionBatchPlan({
      generatedAt: BASE_GENERATED_AT,
      config: {
        outputPath: "data/research-results/expansion-batch-plan.json",
        htmlOutputPath: "data/reports/expansion-batch-plan.html",
        maxMarkets: 100,
        selectionStrategy: "research-value",
        selectionSeed: "seed",
        inputPaths: {
          coveragePlanPath: "data/research-results/historical-coverage-plan.json",
          expansionConfigPath: "data/import-configs/historical-expansion-config.json",
          expansionImportSummaryPath:
            "data/research-results/historical-expansion-import-summary.json",
          hypothesisValidationPath: "data/research-results/hypothesis-validation.json",
          coverageAwareValidationPath: "data/research-results/coverage-aware-validation.json",
          discoveryResultPath: "discovery-result.json",
        },
      },
      io: {
        readFile: (path) => {
          if (path.endsWith("historical-coverage-plan.json")) {
            return JSON.stringify(createCoveragePlanFixture());
          }
          if (path.endsWith("coverage-aware-validation.json")) {
            return JSON.stringify(createLoadedInputs(createCoveragePlanFixture()).coverageAwareValidation);
          }
          if (path.endsWith("historical-expansion-config.json")) {
            return JSON.stringify(createLoadedInputs(createCoveragePlanFixture()).expansionConfig);
          }
          return "{}";
        },
        fileExists: (path) =>
          path.endsWith("historical-coverage-plan.json")
          || path.endsWith("coverage-aware-validation.json")
          || path.endsWith("historical-expansion-config.json"),
      },
    });

    const html = serializeExpansionBatchPlanHtml(plan);
    expect(html).toContain("Expansion Batch Plan");
    expect(html).toContain("2026-03");
    expect(html).toContain("Month allocations");
  });

  it("produces deterministic output for identical inputs", () => {
    const config = {
      outputPath: "data/research-results/expansion-batch-plan.json",
      htmlOutputPath: "data/reports/expansion-batch-plan.html",
      maxMarkets: 500,
      selectionStrategy: "research-value" as const,
      selectionSeed: "deterministic-seed",
      inputPaths: {
        coveragePlanPath: "data/research-results/historical-coverage-plan.json",
        expansionConfigPath: "data/import-configs/historical-expansion-config.json",
        expansionImportSummaryPath:
          "data/research-results/historical-expansion-import-summary.json",
        hypothesisValidationPath: "data/research-results/hypothesis-validation.json",
        coverageAwareValidationPath: "data/research-results/coverage-aware-validation.json",
        discoveryResultPath: "discovery-result.json",
      },
    };

    const io = {
      readFile: (path: string) => {
        if (path.endsWith("historical-coverage-plan.json")) {
          return JSON.stringify(createCoveragePlanFixture());
        }
        if (path.endsWith("coverage-aware-validation.json")) {
          return JSON.stringify(createLoadedInputs(createCoveragePlanFixture()).coverageAwareValidation);
        }
        if (path.endsWith("historical-expansion-config.json")) {
          return JSON.stringify(createLoadedInputs(createCoveragePlanFixture()).expansionConfig);
        }
        return "{}";
      },
      fileExists: (path: string) =>
        path.endsWith("historical-coverage-plan.json")
        || path.endsWith("coverage-aware-validation.json")
        || path.endsWith("historical-expansion-config.json"),
    };

    const first = buildExpansionBatchPlan({
      generatedAt: BASE_GENERATED_AT,
      config,
      io,
    });
    const second = buildExpansionBatchPlan({
      generatedAt: BASE_GENERATED_AT,
      config,
      io,
    });

    expect(first).toEqual(second);
  });
});
