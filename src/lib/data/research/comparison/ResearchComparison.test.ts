import { describe, expect, it } from "vitest";

import type { BacktestMetricsSummary } from "@/lib/data/backtesting/metricsTypes";

import {
  ComparisonMetricId,
  ResearchComparisonError,
  ResearchComparisonErrorCode,
} from "./comparisonTypes";
import type { ResearchExperimentResultWithMetrics } from "./comparisonTypes";
import {
  compareResearchExperiments,
  serializeResearchComparison,
} from "./ResearchComparison";

function metrics(
  overrides: Partial<BacktestMetricsSummary> = {},
): BacktestMetricsSummary {
  return {
    totalReturnPct: 10,
    totalPnlCents: 10_000,
    maxDrawdownPct: 5,
    maxDrawdownCents: 5_000,
    winRatePct: 55,
    lossRatePct: 45,
    averageWinCents: 1_000,
    averageLossCents: -800,
    profitFactor: 1.5,
    expectancyCents: 250,
    tradeCount: 20,
    winningTradeCount: 11,
    losingTradeCount: 9,
    breakevenTradeCount: 0,
    startEquityCents: 100_000,
    endEquityCents: 110_000,
    peakEquityCents: 115_000,
    troughEquityCents: 95_000,
    annualizedReturnPct: 12,
    sharpeRatio: 1.2,
    returnVolatilityPct: 8,
    ...overrides,
  };
}

function experiment(
  experimentId: string,
  metricOverrides: Partial<BacktestMetricsSummary> = {},
  parameters: Record<string, unknown> = { strategy: experimentId },
): ResearchExperimentResultWithMetrics {
  return {
    experimentId,
    sweepId: "comparison-sweep",
    parameters,
    status: "completed",
    metrics: metrics(metricOverrides),
  };
}

describe("compareResearchExperiments", () => {
  it("compares two experiments and selects a winner", () => {
    const comparison = compareResearchExperiments([
      experiment("exp-b", { endEquityCents: 105_000, totalReturnPct: 5 }),
      experiment("exp-a", { endEquityCents: 120_000, totalReturnPct: 20 }),
    ]);

    expect(comparison.summary.experimentCount).toBe(2);
    expect(comparison.winner.experimentId).toBe("exp-a");
    expect(comparison.summary.winnerExperimentId).toBe("exp-a");
    expect(comparison.rankings.map((entry) => entry.experimentId)).toEqual([
      "exp-a",
      "exp-b",
    ]);
    expect(comparison.metricTable).toHaveLength(2);
    expect(comparison.dominance).toHaveLength(9);
  });

  it("compares many experiments with deterministic ordering", () => {
    const inputs = [
      experiment("exp-c", { endEquityCents: 108_000, sharpeRatio: 0.9 }),
      experiment("exp-a", { endEquityCents: 120_000, sharpeRatio: 1.5 }),
      experiment("exp-b", { endEquityCents: 115_000, sharpeRatio: 1.1 }),
      experiment("exp-d", { endEquityCents: 101_000, sharpeRatio: 0.4 }),
    ];

    const first = compareResearchExperiments(inputs);
    const second = compareResearchExperiments([
      inputs[2]!,
      inputs[0]!,
      inputs[3]!,
      inputs[1]!,
    ]);

    expect(first.rankings.map((entry) => entry.experimentId)).toEqual([
      "exp-a",
      "exp-b",
      "exp-c",
      "exp-d",
    ]);
    expect(second.rankings.map((entry) => entry.experimentId)).toEqual(
      first.rankings.map((entry) => entry.experimentId),
    );
    expect(first.comparisonId).toBe(second.comparisonId);
  });

  it("handles identical overall metrics as ties", () => {
    const sharedMetrics = {
      endEquityCents: 110_000,
      sharpeRatio: 1.2,
      maxDrawdownPct: 5,
      totalReturnPct: 10,
    };

    const comparison = compareResearchExperiments([
      experiment("exp-z", sharedMetrics),
      experiment("exp-a", sharedMetrics),
      experiment("exp-m", sharedMetrics),
      experiment("exp-b", { endEquityCents: 105_000, sharpeRatio: 0.8 }),
    ]);

    expect(comparison.winner.rank).toBe(1);
    expect(comparison.winner.tiedExperimentIds).toEqual([
      "exp-a",
      "exp-m",
      "exp-z",
    ]);
    expect(comparison.summary.tiedWinnerExperimentIds).toEqual([
      "exp-a",
      "exp-m",
      "exp-z",
    ]);
    expect(comparison.ties).toEqual([
      { rank: 1, experimentIds: ["exp-a", "exp-m", "exp-z"] },
    ]);
    expect(comparison.rankings[3]?.rank).toBe(4);
  });

  it("uses the tie-break chain for deterministic ranking", () => {
    const comparison = compareResearchExperiments([
      experiment("exp-b", {
        endEquityCents: 110_000,
        sharpeRatio: 1.0,
        maxDrawdownPct: 6,
      }),
      experiment("exp-a", {
        endEquityCents: 110_000,
        sharpeRatio: 1.4,
        maxDrawdownPct: 8,
      }),
      experiment("exp-c", {
        endEquityCents: 110_000,
        sharpeRatio: 1.4,
        maxDrawdownPct: 4,
      }),
      experiment("exp-d", {
        endEquityCents: 110_000,
        sharpeRatio: 1.4,
        maxDrawdownPct: 4,
      }),
    ]);

    expect(comparison.rankings.map((entry) => entry.experimentId)).toEqual([
      "exp-c",
      "exp-d",
      "exp-a",
      "exp-b",
    ]);
  });

  it("reports metric dominance leaders and ties per metric", () => {
    const comparison = compareResearchExperiments([
      experiment("exp-a", { endEquityCents: 110_000, tradeCount: 20 }),
      experiment("exp-b", {
        endEquityCents: 110_000,
        tradeCount: 20,
        profitFactor: 2.5,
      }),
    ]);

    const finalEquityLeader = comparison.dominance.find(
      (entry) => entry.metricId === ComparisonMetricId.FINAL_EQUITY,
    );
    const profitFactorLeader = comparison.dominance.find(
      (entry) => entry.metricId === ComparisonMetricId.PROFIT_FACTOR,
    );

    expect(finalEquityLeader?.leaderExperimentIds).toEqual(["exp-a", "exp-b"]);
    expect(profitFactorLeader?.leaderExperimentIds).toEqual(["exp-b"]);
  });

  it("serializes comparisons deterministically", () => {
    const inputs = [
      experiment("exp-a", { endEquityCents: 120_000 }),
      experiment("exp-b", { endEquityCents: 110_000 }),
    ];

    const first = serializeResearchComparison(compareResearchExperiments(inputs));
    const second = serializeResearchComparison(compareResearchExperiments(inputs));

    expect(first).toBe(second);
    expect(first).toContain("exp-a");
  });

  it("returns deeply frozen immutable outputs", () => {
    const comparison = compareResearchExperiments([
      experiment("exp-a"),
      experiment("exp-b", { endEquityCents: 105_000 }),
    ]);

    expect(Object.isFrozen(comparison)).toBe(true);
    expect(Object.isFrozen(comparison.rankings)).toBe(true);
    expect(Object.isFrozen(comparison.metricTable)).toBe(true);
    expect(Object.isFrozen(comparison.dominance)).toBe(true);
    expect(Object.isFrozen(comparison.summary)).toBe(true);
    expect(Object.isFrozen(comparison.winner)).toBe(true);
    expect(Object.isFrozen(comparison.winner.metrics)).toBe(true);
  });

  it("rejects empty input", () => {
    expect(() => compareResearchExperiments([])).toThrow(ResearchComparisonError);

    try {
      compareResearchExperiments([]);
    } catch (error) {
      expect(error).toMatchObject({
        code: ResearchComparisonErrorCode.EMPTY_EXPERIMENTS,
      });
    }
  });
});
