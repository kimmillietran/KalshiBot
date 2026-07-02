import { describe, expect, it } from "vitest";

import { buildOverfittingDiagnosticsReport } from "./computeOverfittingMetrics";
import type { ParsedStrategyAggregateSummary } from "../leaderboard/strategyLeaderboardTypes";
import type { StatisticalSignificanceReport } from "../statisticalSignificance/statisticalSignificanceTypes";

const GENERATED_AT = "2026-07-02T12:00:00.000Z";

function createSummary(
  strategyId: string,
  totalPnlCents: number,
  sharpeRatio: number | null = 1,
): ParsedStrategyAggregateSummary {
  return {
    strategyId,
    sourcePaths: [`data/research-results/${strategyId}/KXBTC15M/aggregate-summary.json`],
    marketCounts: { total: 2, completed: 2, failed: 0 },
    performance: {
      totalTrades: 4,
      totalFills: 4,
      totalContractsFilled: 4,
      totalPnlCents,
      averagePnlCents: totalPnlCents / 2,
      medianPnlCents: totalPnlCents / 2,
      averageReturnPct: 1,
      winRatePct: 50,
      lossRatePct: 50,
      maxDrawdownPct: 1,
      sharpeRatio,
    },
    duration: {
      totalDurationMs: 2_000,
      averageDurationMs: 1_000,
      medianDurationMs: 1_000,
      minDurationMs: 1_000,
      maxDurationMs: 1_000,
    },
    markets: [],
  };
}

function createSignificanceReport(
  strategies: StatisticalSignificanceReport["strategies"],
): StatisticalSignificanceReport {
  return {
    generatedAt: GENERATED_AT,
    inputRoot: "data/research-results",
    outputPath: "data/research-results/statistical-significance.json",
    config: {
      seed: 42,
      simulationCount: 1000,
      confidenceLevel: 0.95,
      significanceAlpha: 0.05,
    },
    strategies,
  };
}

describe("buildOverfittingDiagnosticsReport", () => {
  it("sorts strategy families deterministically and records best observed results", () => {
    const report = buildOverfittingDiagnosticsReport({
      inputRoot: "data/research-results",
      experimentsRoot: "data/experiments",
      outputPath: "data/research-results/overfitting-diagnostics.json",
      generatedAt: GENERATED_AT,
      summaries: [
        createSummary("zeta", 300),
        createSummary("alpha", 500),
      ],
      significanceReport: null,
      significancePath: null,
      experimentRegistry: {
        available: false,
        experimentCount: 0,
        uniqueConfigCount: 0,
        warnings: [],
      },
      configCount: 2,
      foldPerformanceMatrix: null,
    });

    expect(report.strategyFamilies.map((family) => family.strategyId)).toEqual([
      "alpha",
      "zeta",
    ]);
    expect(report.strategyFamilies[0]?.bestObserved.value).toBe(500);
    expect(report.warnings.some((warning) => warning.includes("statistical-significance"))).toBe(
      true,
    );
  });

  it("marks multiple-testing adjustments unavailable when significance is missing", () => {
    const report = buildOverfittingDiagnosticsReport({
      inputRoot: "data/research-results",
      experimentsRoot: "data/experiments",
      outputPath: "data/research-results/overfitting-diagnostics.json",
      generatedAt: GENERATED_AT,
      summaries: [createSummary("alpha", 100), createSummary("beta", 200)],
      significanceReport: null,
      significancePath: null,
      experimentRegistry: {
        available: false,
        experimentCount: 0,
        uniqueConfigCount: 0,
        warnings: [],
      },
      configCount: 2,
      foldPerformanceMatrix: null,
    });

    expect(report.multipleTesting.status).toBe("unavailable");
    expect(report.multipleTesting.warnings[0]).toContain("No raw p-values");
  });

  it("computes multiple-testing adjustments when significance data is present", () => {
    const report = buildOverfittingDiagnosticsReport({
      inputRoot: "data/research-results",
      experimentsRoot: "data/experiments",
      outputPath: "data/research-results/overfitting-diagnostics.json",
      generatedAt: GENERATED_AT,
      summaries: [createSummary("alpha", 100), createSummary("beta", 200)],
      significanceReport: createSignificanceReport([
        {
          strategyId: "alpha",
          sampleSize: 10,
          completedMarkets: 10,
          totalTrades: 10,
          meanPnlCents: 10,
          meanPnlStandardError: 2,
          meanPnlTStatistic: 2,
          meanPnlPValueOneTailed: 0.02,
          meanPnlBootstrapConfidenceInterval: null,
          winRatePct: 60,
          winRateBootstrapConfidenceInterval: null,
          confidenceInterval95: {
            meanPnlCents: null,
            winRatePct: null,
          },
          statisticallySignificant: true,
          insufficientSample: false,
          warnings: [],
          sourcePaths: [],
        },
        {
          strategyId: "beta",
          sampleSize: 10,
          completedMarkets: 10,
          totalTrades: 10,
          meanPnlCents: 5,
          meanPnlStandardError: 2,
          meanPnlTStatistic: 1,
          meanPnlPValueOneTailed: 0.15,
          meanPnlBootstrapConfidenceInterval: null,
          winRatePct: 55,
          winRateBootstrapConfidenceInterval: null,
          confidenceInterval95: {
            meanPnlCents: null,
            winRatePct: null,
          },
          statisticallySignificant: false,
          insufficientSample: false,
          warnings: [],
          sourcePaths: [],
        },
      ]),
      significancePath: "data/research-results/statistical-significance.json",
      experimentRegistry: {
        available: true,
        experimentCount: 2,
        uniqueConfigCount: 2,
        warnings: [],
      },
      configCount: 2,
      foldPerformanceMatrix: null,
    });

    expect(report.multipleTesting.status).toBe("computed");
    expect(report.multipleTesting.familyWise[0]?.strategyId).toBe("alpha");
    expect(report.multipleTesting.fdr[0]?.rejectedFdr).toBe(true);
  });

  it("warns when deflated Sharpe inputs are insufficient", () => {
    const report = buildOverfittingDiagnosticsReport({
      inputRoot: "data/research-results",
      experimentsRoot: "data/experiments",
      outputPath: "data/research-results/overfitting-diagnostics.json",
      generatedAt: GENERATED_AT,
      summaries: [createSummary("alpha", 100, null)],
      significanceReport: null,
      significancePath: null,
      experimentRegistry: {
        available: false,
        experimentCount: 0,
        uniqueConfigCount: 0,
        warnings: [],
      },
      configCount: 1,
      foldPerformanceMatrix: null,
    });

    expect(report.deflatedSharpe.status).toBe("unavailable");
    expect(report.deflatedSharpe.warnings[0]).toContain("No Sharpe ratio data");
    expect(report.backtestOverfitting.status).toBe("unavailable");
  });
});
