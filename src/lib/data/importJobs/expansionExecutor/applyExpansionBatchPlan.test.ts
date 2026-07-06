import { describe, expect, it } from "vitest";

import type { ExpansionBatchPlan } from "@/lib/data/research/expansionBatchPlanner/expansionBatchPlannerTypes";
import { createExpansionBatchPlanConsumptionState } from "@/lib/data/research/expansionBatchPlanner/parseExpansionBatchPlanJson";

import { selectMarketsUsingBatchPlan } from "./applyExpansionBatchPlan";
import type { ExpansionDiscoveredMarket } from "./expansionExecutorTypes";

function market(ticker: string): ExpansionDiscoveredMarket {
  return {
    marketTicker: ticker,
    seriesTicker: "KXBTC15M",
    eventTicker: "EVT",
    status: "open",
    openTime: "2026-03-01T00:00:00Z",
    closeTime: "2026-03-01T00:15:00Z",
    settlementTime: null,
    expirationValue: null,
    title: null,
    subtitle: null,
    listMarketWire: {} as ExpansionDiscoveredMarket["listMarketWire"],
    provenance: {
      source: "kalshi-historical-api",
      fetchedAt: "2026-04-01T00:00:00Z",
      requestPath: "/historical/markets",
    },
  };
}

const batchPlan: ExpansionBatchPlan = {
  generatedAt: "2026-04-01T00:00:00Z",
  outputPath: "data/research-results/expansion-batch-plan.json",
  htmlOutputPath: "data/reports/expansion-batch-plan.html",
  maxMarkets: 5,
  selectionStrategy: "research-value",
  selectionSeed: "seed",
  inputPaths: {
    coveragePlanPath: "data/research-results/historical-coverage-plan.json",
    expansionConfigPath: "data/import-configs/historical-expansion-config.json",
    expansionImportSummaryPath: "data/research-results/historical-expansion-import-summary.json",
    hypothesisValidationPath: "data/research-results/hypothesis-validation.json",
    coverageAwareValidationPath: "data/research-results/coverage-aware-validation.json",
    discoveryResultPath: "discovery-result.json",
  },
  inputStatus: {
    coveragePlanPresent: true,
    expansionConfigPresent: true,
    expansionImportSummaryPresent: false,
    hypothesisValidationPresent: false,
    coverageAwareValidationPresent: false,
    discoveryResultPresent: false,
  },
  summary: {
    totalAllocatedMarkets: 5,
    allocationCount: 2,
    scheduledJobCount: 1,
    candidateMonthCount: 2,
    unsupportedHeavyAllocationCount: 0,
  },
  plannerNotes: [],
  allocations: [
    {
      allocationId: "batch-2026-03-1",
      month: "2026-03",
      seriesTicker: "KXBTC15M",
      marketCount: 3,
      rationale: "March gap",
      targetHypothesisIds: ["hyp-a"],
      expectedValidationBenefit: "Improve month persistence.",
      expectedImportability: "high",
      estimatedUnsupportedRate: 0,
      currentObservations: 0,
      currentMarketCount: 0,
      desiredObservations: 20,
      discoveryAvailableCount: null,
      riskNotes: [],
      priorityScore: 90,
    },
    {
      allocationId: "batch-2026-01-1",
      month: "2026-01",
      seriesTicker: "KXBTC15M",
      marketCount: 2,
      rationale: "January thin month",
      targetHypothesisIds: ["hyp-b"],
      expectedValidationBenefit: "Improve sample concentration.",
      expectedImportability: "medium",
      estimatedUnsupportedRate: 0.1,
      currentObservations: 4,
      currentMarketCount: 20,
      desiredObservations: 20,
      discoveryAvailableCount: null,
      riskNotes: [],
      priorityScore: 55,
    },
  ],
};

describe("selectMarketsUsingBatchPlan", () => {
  it("selects markets according to month allocations and global budget", () => {
    const remainingByMonth = createExpansionBatchPlanConsumptionState(batchPlan);
    const eligibleMarkets = [
      market("KXBTC15M-26MAR010000-00"),
      market("KXBTC15M-26MAR010015-15"),
      market("KXBTC15M-26MAR010030-30"),
      market("KXBTC15M-26MAR010045-45"),
      market("KXBTC15M-26JAN010000-00"),
      market("KXBTC15M-26JAN010015-15"),
      market("KXBTC15M-26JAN010030-30"),
    ];

    const result = selectMarketsUsingBatchPlan({
      eligibleMarkets,
      batchPlan,
      remainingByMonth,
      remainingMarketBudget: 5,
      planningHistory: {
        summaryPath: null,
        summaryPresent: false,
        knownUnsupportedTickers: new Set(),
        successfullyImportedTickers: new Set(),
      },
      selectionSeed: "job-a",
    });

    expect(result.plannedQueue).toHaveLength(5);
    expect(result.plannedQueue.filter((entry) => entry.marketTicker.includes("MAR"))).toHaveLength(3);
    expect(result.plannedQueue.filter((entry) => entry.marketTicker.includes("JAN"))).toHaveLength(2);
    expect(remainingByMonth.get("2026-03")).toBe(0);
    expect(remainingByMonth.get("2026-01")).toBe(0);
  });
});
