import { describe, expect, it } from "vitest";

import { parseExpansionBatchPlanJson } from "./parseExpansionBatchPlanJson";

describe("parseExpansionBatchPlanJson", () => {
  it("accepts empty allocation plans", () => {
    const plan = parseExpansionBatchPlanJson(
      JSON.stringify({
        generatedAt: "2026-04-01T00:00:00.000Z",
        outputPath: "data/research-results/expansion-batch-plan.json",
        htmlOutputPath: "data/reports/expansion-batch-plan.html",
        maxMarkets: 176,
        selectionStrategy: "research-value",
        selectionSeed: "seed",
        inputPaths: {},
        inputStatus: {},
        summary: {
          totalAllocatedMarkets: 0,
          allocationCount: 0,
          scheduledJobCount: 0,
          candidateMonthCount: 1,
          unsupportedHeavyAllocationCount: 0,
          rejectedUnsupportedHeavyAllocationCount: 1,
          rejectedZeroPriorityAllocationCount: 0,
          rejectedAlreadyCoveredAllocationCount: 0,
        },
        plannerNotes: ["No importable research-value allocations found."],
        allocations: [],
        rejectedCandidates: [
          {
            month: "2026-05",
            seriesTicker: "KXBTC15M",
            rejectionReason: "unsupported-heavy",
            priorityScore: 0,
            expectedImportability: "low",
            estimatedUnsupportedRate: 1,
            estimatedImportableMarketCount: 0,
            discoveryAvailableCount: 479,
            currentMarketCount: 478,
            rationale: "Unsupported-heavy month",
          },
        ],
      }),
      "data/research-results/expansion-batch-plan.json",
    );

    expect(plan.allocations).toEqual([]);
    expect(plan.rejectedCandidates).toHaveLength(1);
  });
});
