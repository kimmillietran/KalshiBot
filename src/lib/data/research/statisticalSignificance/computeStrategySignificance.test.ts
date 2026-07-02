import { describe, expect, it } from "vitest";

import {
  bootstrapMeanConfidenceInterval,
  bootstrapWinRateConfidenceInterval,
} from "./bootstrapConfidenceIntervals";
import {
  computeStrategyStatisticalSignificance,
  extractCompletedMarketSamples,
  resolveStatisticalSignificanceConfig,
} from "./computeStrategySignificance";
import { deterministicUniformIndex, mean, percentile } from "./deterministicSampling";
import {
  computeStandardError,
  computeTStatistic,
  oneSampleTTestPValueGreaterThanZero,
} from "./studentTTest";
import { DEFAULT_BOOTSTRAP_SEED } from "./statisticalSignificanceTypes";
import type { ParsedStrategyAggregateSummary } from "../leaderboard/strategyLeaderboardTypes";

const GENERATED_AT = "2026-06-27T20:00:00.000Z";

function createMarket(
  marketTicker: string,
  totalPnlCents: number,
  winningTradeCount = 2,
  tradeCount = 4,
) {
  return {
    marketTicker,
    outputPath: `data/research-results/test/KXBTC15M/${marketTicker}/research-output.json`,
    status: "completed" as const,
    durationMs: 1_000,
    error: null,
    metrics: {
      totalPnlCents,
      totalReturnPct: 1,
      maxDrawdownPct: 1,
      sharpeRatio: 1,
      winRatePct: (winningTradeCount / tradeCount) * 100,
      lossRatePct: 100 - (winningTradeCount / tradeCount) * 100,
      tradeCount,
      winningTradeCount,
      losingTradeCount: tradeCount - winningTradeCount,
      fillCount: tradeCount,
      contractsFilled: tradeCount,
    },
  };
}

function createSummary(
  strategyId: string,
  markets: ReturnType<typeof createMarket>[],
): ParsedStrategyAggregateSummary {
  const totalPnlCents = markets.reduce(
    (sum, market) => sum + market.metrics.totalPnlCents,
    0,
  );

  return {
    strategyId,
    sourcePaths: [`data/research-results/${strategyId}/KXBTC15M/aggregate-summary.json`],
    marketCounts: {
      total: markets.length,
      completed: markets.length,
      failed: 0,
    },
    performance: {
      totalTrades: markets.reduce((sum, market) => sum + market.metrics.tradeCount, 0),
      totalFills: markets.reduce((sum, market) => sum + market.metrics.fillCount, 0),
      totalContractsFilled: markets.reduce(
        (sum, market) => sum + market.metrics.contractsFilled,
        0,
      ),
      totalPnlCents,
      averagePnlCents: markets.length === 0 ? 0 : totalPnlCents / markets.length,
      medianPnlCents: markets[0]?.metrics.totalPnlCents ?? 0,
      averageReturnPct: 1,
      winRatePct: 50,
      lossRatePct: 50,
      maxDrawdownPct: 1,
      sharpeRatio: 1,
    },
    duration: {
      totalDurationMs: markets.length * 1_000,
      averageDurationMs: 1_000,
      medianDurationMs: 1_000,
      minDurationMs: 1_000,
      maxDurationMs: 1_000,
    },
    markets,
  };
}

describe("deterministic bootstrap", () => {
  it("produces identical confidence intervals for the same seed and inputs", () => {
    const values = [100, 120, 80, 140, 90];
    const options = {
      seed: DEFAULT_BOOTSTRAP_SEED,
      simulationCount: 250,
      confidenceLevel: 0.95,
    };

    const first = bootstrapMeanConfidenceInterval(values, options);
    const second = bootstrapMeanConfidenceInterval(values, options);

    expect(first).toEqual(second);
    expect(first?.pointEstimate).toBe(mean(values));
    expect(first!.lower).toBeLessThanOrEqual(first!.pointEstimate);
    expect(first!.upper).toBeGreaterThanOrEqual(first!.pointEstimate);
  });

  it("uses deterministic uniform indices", () => {
    const first = deterministicUniformIndex({
      seed: 42,
      simulationIndex: 3,
      drawIndex: 7,
      upperBound: 10,
    });
    const second = deterministicUniformIndex({
      seed: 42,
      simulationIndex: 3,
      drawIndex: 7,
      upperBound: 10,
    });

    expect(first).toBe(second);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(10);
  });
});

describe("tiny datasets", () => {
  it("handles a single completed market without t-test statistics", () => {
    const summary = createSummary("tiny", [createMarket("M1", 50)]);

    const metrics = computeStrategyStatisticalSignificance(
      summary,
      resolveStatisticalSignificanceConfig({ simulationCount: 100 }),
    );

    expect(metrics.sampleSize).toBe(1);
    expect(metrics.meanPnlCents).toBe(50);
    expect(metrics.meanPnlStandardError).toBeNull();
    expect(metrics.meanPnlTStatistic).toBeNull();
    expect(metrics.meanPnlPValueOneTailed).toBeNull();
    expect(metrics.statisticallySignificant).toBe(false);
    expect(metrics.insufficientSample).toBe(true);
    expect(metrics.warnings).toContain(
      "Only one completed market; standard error and t-test are unavailable.",
    );
    expect(metrics.meanPnlBootstrapConfidenceInterval?.lower).toBe(50);
    expect(metrics.meanPnlBootstrapConfidenceInterval?.upper).toBe(50);
  });

  it("warns on small multi-market samples", () => {
    const summary = createSummary("small", [
      createMarket("M1", 20),
      createMarket("M2", 30),
    ]);

    const metrics = computeStrategyStatisticalSignificance(
      summary,
      resolveStatisticalSignificanceConfig({ simulationCount: 100 }),
    );

    expect(metrics.sampleSize).toBe(2);
    expect(metrics.meanPnlStandardError).not.toBeNull();
    expect(metrics.warnings).toContain(
      "Small sample size; confidence intervals may be unstable.",
    );
  });
});

describe("empty dataset", () => {
  it("returns null metrics and warnings when no completed markets exist", () => {
    const summary = createSummary("empty", []);

    const metrics = computeStrategyStatisticalSignificance(
      summary,
      resolveStatisticalSignificanceConfig(),
    );

    expect(metrics.sampleSize).toBe(0);
    expect(metrics.meanPnlCents).toBeNull();
    expect(metrics.winRatePct).toBeNull();
    expect(metrics.confidenceInterval95.meanPnlCents).toBeNull();
    expect(metrics.confidenceInterval95.winRatePct).toBeNull();
    expect(metrics.statisticallySignificant).toBe(false);
    expect(metrics.warnings).toContain(
      "No completed markets available for significance analysis.",
    );
    expect(extractCompletedMarketSamples({ markets: [] })).toEqual([]);
  });
});

describe("CI correctness", () => {
  it("computes analytical standard error and t-statistic for known samples", () => {
    const values = [10, 20, 30];
    const sampleMean = mean(values);
    const standardError = computeStandardError(values);
    const tStatistic = computeTStatistic(sampleMean, standardError);

    expect(sampleMean).toBe(20);
    expect(standardError).toBeCloseTo(5.773502692, 5);
    expect(tStatistic).toBeCloseTo(3.464101615, 5);
    expect(oneSampleTTestPValueGreaterThanZero(tStatistic!, 2)).toBeLessThan(0.05);
  });

  it("places the sample mean inside the bootstrap confidence interval", () => {
    const samples = [
      { marketTicker: "A", totalPnlCents: 40, winningTradeCount: 3, tradeCount: 4 },
      { marketTicker: "B", totalPnlCents: 60, winningTradeCount: 2, tradeCount: 4 },
      { marketTicker: "C", totalPnlCents: 80, winningTradeCount: 4, tradeCount: 5 },
      { marketTicker: "D", totalPnlCents: 20, winningTradeCount: 1, tradeCount: 4 },
    ];

    const pnlCi = bootstrapMeanConfidenceInterval(
      samples.map((sample) => sample.totalPnlCents),
      {
        seed: 7,
        simulationCount: 500,
        confidenceLevel: 0.95,
      },
    );
    const winRateCi = bootstrapWinRateConfidenceInterval(samples, {
      seed: 7,
      simulationCount: 500,
      confidenceLevel: 0.95,
    });

    expect(pnlCi).not.toBeNull();
    expect(winRateCi).not.toBeNull();
    expect(pnlCi!.lower).toBeLessThanOrEqual(pnlCi!.pointEstimate);
    expect(pnlCi!.upper).toBeGreaterThanOrEqual(pnlCi!.pointEstimate);
    expect(winRateCi!.lower).toBeLessThanOrEqual(winRateCi!.pointEstimate);
    expect(winRateCi!.upper).toBeGreaterThanOrEqual(winRateCi!.pointEstimate);
  });

  it("marks positive-edge strategies as statistically significant", () => {
    const summary = createSummary("winner", [
      createMarket("M1", 200, 4, 4),
      createMarket("M2", 180, 4, 4),
      createMarket("M3", 220, 4, 4),
      createMarket("M4", 190, 4, 4),
      createMarket("M5", 210, 4, 4),
    ]);

    const metrics = computeStrategyStatisticalSignificance(
      summary,
      resolveStatisticalSignificanceConfig({ simulationCount: 500 }),
    );

    expect(metrics.meanPnlCents).toBeGreaterThan(0);
    expect(metrics.meanPnlPValueOneTailed).toBeLessThan(0.05);
    expect(metrics.statisticallySignificant).toBe(true);
    expect(metrics.confidenceInterval95.meanPnlCents?.lower).toBeGreaterThan(0);
  });
});

describe("percentile", () => {
  it("interpolates between sorted values", () => {
    expect(percentile([10, 20, 30, 40], 50)).toBe(25);
  });
});

describe("buildStatisticalSignificanceReport", () => {
  it("sorts strategies deterministically", async () => {
    const { buildStatisticalSignificanceReport, serializeStatisticalSignificanceReport } =
      await import("./buildStatisticalSignificanceReport");

    const report = buildStatisticalSignificanceReport({
      inputRoot: "data/research-results",
      outputPath: "data/research-results/statistical-significance.json",
      generatedAt: GENERATED_AT,
      summaries: [
        createSummary("zeta", [createMarket("M1", 10)]),
        createSummary("alpha", [createMarket("M1", 20)]),
      ],
      config: { simulationCount: 50 },
    });

    expect(report.strategies.map((strategy) => strategy.strategyId)).toEqual([
      "alpha",
      "zeta",
    ]);
    expect(JSON.parse(serializeStatisticalSignificanceReport(report)).config.seed).toBe(
      DEFAULT_BOOTSTRAP_SEED,
    );
  });
});
