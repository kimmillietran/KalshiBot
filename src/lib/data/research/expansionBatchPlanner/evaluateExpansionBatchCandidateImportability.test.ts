import { describe, expect, it } from "vitest";

import {
  classifyExpansionBatchCandidateRejection,
  estimateExpansionBatchCandidateImportability,
  partitionImportableExpansionBatchCandidates,
} from "./evaluateExpansionBatchCandidateImportability";
import type { ScoredExpansionBatchMonthCandidate } from "./expansionBatchPlannerTypes";

function createCandidate(
  overrides: Partial<ScoredExpansionBatchMonthCandidate> = {},
): ScoredExpansionBatchMonthCandidate {
  return {
    month: "2026-05",
    seriesTicker: "KXBTC15M",
    coverageStatus: "UNDER_COVERED",
    targetHypothesisIds: ["hyp-c"],
    expectedValidationBenefit: "Add May evidence.",
    expectedImportability: "low",
    estimatedUnsupportedRate: 1,
    currentObservations: 4,
    currentMarketCount: 478,
    desiredObservations: 100,
    discoveryAvailableCount: 479,
    recommendationPriority: 40,
    thinHypothesisCount: 0,
    coverageAwareBoost: 0,
    score: 0,
    scoreRationale: "Penalized",
    ...overrides,
  };
}

describe("evaluateExpansionBatchCandidateImportability", () => {
  it("rejects unsupported-heavy months with zero importable markets", () => {
    const candidate = createCandidate();
    const importability = estimateExpansionBatchCandidateImportability(candidate, [
      {
        marketTicker: "KXBTC15M-26MAY010000-00",
        seriesTicker: "KXBTC15M",
        status: "failed",
        errorMessage: "Kalshi historical market response missing expiration_value",
        skipReason: null,
        calendarMonth: "2026-05",
        outcomeCategory: "unsupported-market",
      },
    ]);

    expect(importability.estimatedImportableMarketCount).toBe(0);
    expect(importability.uncoveredDiscoveryCount).toBe(1);
    expect(
      classifyExpansionBatchCandidateRejection(candidate, importability),
    ).toBe("unsupported-heavy");
  });

  it("rejects already-covered months when discovery is fully represented in corpus", () => {
    const candidate = createCandidate({
      expectedImportability: "high",
      estimatedUnsupportedRate: 0,
      currentMarketCount: 479,
      discoveryAvailableCount: 479,
      score: 80,
    });
    const importability = estimateExpansionBatchCandidateImportability(candidate, []);

    expect(importability.uncoveredDiscoveryCount).toBe(0);
    expect(
      classifyExpansionBatchCandidateRejection(candidate, importability),
    ).toBe("already-covered");
  });

  it("partitions candidates into importable and rejected buckets", () => {
    const partitioned = partitionImportableExpansionBatchCandidates({
      candidates: [
        createCandidate(),
        createCandidate({
          month: "2026-03",
          expectedImportability: "high",
          estimatedUnsupportedRate: 0.05,
          currentMarketCount: 0,
          discoveryAvailableCount: 800,
          score: 90,
        }),
      ],
      importabilityMarkets: [],
    });

    expect(partitioned.importableCandidates).toHaveLength(1);
    expect(partitioned.importableCandidates[0]?.month).toBe("2026-03");
    expect(partitioned.rejectedCandidates).toHaveLength(1);
    expect(partitioned.rejectedCandidates[0]?.month).toBe("2026-05");
    expect(partitioned.rejectedUnsupportedHeavyAllocationCount).toBe(1);
  });

  it("rejects months with zero successful imports and only one uncovered discovery market", () => {
    const candidate = createCandidate({
      expectedImportability: "medium",
      estimatedUnsupportedRate: 0,
      score: 40,
    });
    const importability = estimateExpansionBatchCandidateImportability(candidate, [
      {
        marketTicker: "KXBTC15M-26MAY010000-00",
        seriesTicker: "KXBTC15M",
        status: "failed",
        errorMessage: "other failure",
        skipReason: null,
        calendarMonth: "2026-05",
        outcomeCategory: "other-failure",
      },
    ]);

    expect(importability.estimatedImportableMarketCount).toBe(0);
    expect(
      classifyExpansionBatchCandidateRejection(candidate, importability),
    ).toBe("already-covered");
  });
});
