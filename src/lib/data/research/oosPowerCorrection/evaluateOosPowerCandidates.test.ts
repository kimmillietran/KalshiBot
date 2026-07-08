import { describe, expect, it } from "vitest";

import type { EnrichedMispricingObservation } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";
import type { HypothesisCandidate } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";

import { evaluateOosPowerCandidates } from "./evaluateOosPowerCandidates";

function observation(input: {
  marketTicker: string;
  calendarMonth: string;
  tradingDayUtc: string;
  predictedProbability: number;
  observedOutcome: 0 | 1;
  stepIndex?: number;
}): EnrichedMispricingObservation {
  return {
    strategyId: "noop",
    seriesTicker: "KXBTC15M",
    marketTicker: input.marketTicker,
    outputPath: "data/research-results/noop/KXBTC15M/M1/research-output.json",
    stepIndex: input.stepIndex ?? 0,
    predictedProbability: input.predictedProbability,
    observedOutcome: input.observedOutcome,
    timeRemainingMs: 600_000,
    moneynessPercent: 0,
    annualizedVolatility: 0.4,
    momentumPercent: 0,
    tradingDayUtc: input.tradingDayUtc,
    timestampMs: Date.parse(`${input.tradingDayUtc}T12:00:00.000Z`),
    calendarMonth: input.calendarMonth,
    calendarQuarter: `${input.calendarMonth.slice(0, 4)}-Q1`,
    volatilityRegime: "medium",
  };
}

function candidate(candidateId: string): HypothesisCandidate {
  return {
    candidateId,
    sourceArtifact: "mispricing-atlas.json",
    hypothesis: candidateId,
    rationale: "test",
    marketCondition: "test",
    suggestedStrategyFamily: "test",
    requiredData: [],
    proposedEntryCondition: "test",
    proposedExitSettlementAssumption: "test",
    expectedFailureMode: "test",
    killCriterion: "test",
    confidence: "medium",
    warnings: [],
    bucketMetadata: {
      groupId: "probabilityOnly",
      bucketId: "coarse-prob-3",
      bucketLabel: "60-70%",
      observations: 20,
      uniqueTradingDays: 8,
      calibrationError: 0.1,
      calibrationDirection: "over",
    },
  };
}

describe("evaluateOosPowerCandidates", () => {
  const config = {
    alpha: 0.05,
    targetPower: 0.8,
    minEffectCents: 2,
    correctionMethod: "benjaminiYekutieli" as const,
    blockKey: "market-day" as const,
    officialOnly: false,
    blockBootstrapIterations: 50,
    blockBootstrapSeed: 42,
    explicitSplit: {
      trainMonths: ["2025-10", "2025-11"],
      validationMonths: ["2025-12"],
      holdoutMonths: ["2026-01"],
    },
  };

  it("evaluates candidates with holdout verdict fields", () => {
    const observations = [
      ...Array.from({ length: 4 }, (_, index) =>
        observation({
          marketTicker: `M${index}`,
          calendarMonth: "2026-01",
          tradingDayUtc: `2026-01-${String(index + 10).padStart(2, "0")}`,
          predictedProbability: 0.6 + index * 0.02,
          observedOutcome: index % 2 === 0 ? 1 : 0,
          stepIndex: index,
        }),
      ),
      observation({
        marketTicker: "M-train",
        calendarMonth: "2025-10",
        tradingDayUtc: "2025-10-05",
        predictedProbability: 0.65,
        observedOutcome: 1,
      }),
    ];

    const result = evaluateOosPowerCandidates({
      candidates: [candidate("atlas-probabilityOnly-coarse-prob-3-over")],
      observations,
      tradeReplayByHypothesisId: new Map(),
      regimeVolatilityByMarket: new Map(),
      config,
    });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.splitMetrics.holdout.rawObservationCount).toBe(4);
    expect(result.entries[0]?.uncorrectedPValue).not.toBeNull();
    expect(result.entries[0]?.finalStatisticalVerdict).not.toBe("skipped");
    expect(result.splitSummary.holdoutMonths).toEqual(["2026-01"]);
  });

  it("does not assign holdout months to train split", () => {
    const result = evaluateOosPowerCandidates({
      candidates: [],
      observations: [],
      tradeReplayByHypothesisId: new Map(),
      regimeVolatilityByMarket: new Map(),
      config,
    });

    expect(result.splitSummary.trainMonths).not.toContain("2026-01");
    expect(result.splitSummary.holdoutMonths).toContain("2026-01");
  });
});
