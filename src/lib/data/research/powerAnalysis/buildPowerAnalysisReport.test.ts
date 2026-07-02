import { describe, expect, it } from "vitest";

import type { ParsedStrategyAggregateSummary } from "../leaderboard/strategyLeaderboardTypes";

import {
  buildPowerAnalysisReport,
  computeStrategyPowerAnalysis,
  serializePowerAnalysisReport,
} from "./index";

const GENERATED_AT = "2026-06-28T12:00:00.000Z";
const INPUT_ROOT = "data/research-results";
const OUTPUT_PATH = "data/research-results/power-analysis.json";

function createSummary(
  strategyId: string,
  pnlValues: number[],
): ParsedStrategyAggregateSummary {
  return {
    strategyId,
    sourcePaths: [`${INPUT_ROOT}/${strategyId}/aggregate-summary.json`],
    marketCounts: {
      total: pnlValues.length,
      completed: pnlValues.length,
      failed: 0,
    },
    performance: {
      totalPnlCents: pnlValues.reduce((sum, value) => sum + value, 0),
      averagePnlCents:
        pnlValues.length === 0
          ? 0
          : pnlValues.reduce((sum, value) => sum + value, 0) / pnlValues.length,
      medianPnlCents: pnlValues[0] ?? 0,
      totalReturnPct: 0,
      averageReturnPct: 0,
      winRatePct: 0,
      lossRatePct: 0,
      totalTrades: pnlValues.length,
      totalFills: pnlValues.length,
      totalContractsFilled: pnlValues.length,
      maxDrawdownPct: 0,
      sharpeRatio: null,
    },
    duration: {
      totalDurationMs: 0,
      averageDurationMs: 0,
      medianDurationMs: 0,
    },
    markets: pnlValues.map((totalPnlCents, index) => ({
      marketTicker: `KXBTC15M-MARKET-${index + 1}`,
      outputPath: `${INPUT_ROOT}/${strategyId}/KXBTC15M/KXBTC15M-MARKET-${index + 1}/research-output.json`,
      status: "completed" as const,
      durationMs: 1_000,
      metrics: {
        totalPnlCents,
        totalReturnPct: 0,
        maxDrawdownPct: 0,
        sharpeRatio: null,
        winRatePct: 0,
        lossRatePct: 0,
        tradeCount: 1,
        winningTradeCount: totalPnlCents > 0 ? 1 : 0,
        losingTradeCount: totalPnlCents < 0 ? 1 : 0,
        fillCount: 1,
        contractsFilled: 1,
      },
      error: null,
    })),
  };
}

describe("computeStrategyPowerAnalysis", () => {
  it("flags tiny samples as underpowered with warnings", () => {
    const analysis = computeStrategyPowerAnalysis(createSummary("noop", [2, 4]));

    expect(analysis.sampleSize).toBe(2);
    expect(analysis.observedVariance).not.toBeNull();
    expect(analysis.underpowered).toBe(true);
    expect(analysis.warnings.length).toBeGreaterThan(0);
  });

  it("reports lower power pressure for large samples with stable variance", () => {
    const largeSample = Array.from({ length: 500 }, (_, index) => 2 + (index % 3));
    const analysis = computeStrategyPowerAnalysis(createSummary("noop", largeSample));

    expect(analysis.sampleSize).toBe(500);
    expect(analysis.powerTable).toHaveLength(3);
    expect(analysis.powerTable[0]?.targetPower).toBe(0.8);
    expect(
      analysis.powerTable[0]?.requiredSampleSizeByEdgeCents.find(
        (entry) => entry.edgeCents === 2,
      )?.requiredSampleSize,
    ).toBeLessThan(500);
  });
});

describe("buildPowerAnalysisReport", () => {
  it("serializes deterministic output with sorted strategies and recommendations", () => {
    const report = buildPowerAnalysisReport({
      inputRoot: INPUT_ROOT,
      outputPath: OUTPUT_PATH,
      generatedAt: GENERATED_AT,
      summaries: [
        createSummary("strategy-b", Array.from({ length: 12 }, () => 3)),
        createSummary("strategy-a", Array.from({ length: 8 }, () => 1)),
      ],
    });

    expect(report.strategies.map((strategy) => strategy.strategyId)).toEqual([
      "strategy-a",
      "strategy-b",
    ]);
    expect(report.recommendations.length).toBeGreaterThan(0);

    const first = serializePowerAnalysisReport(report);
    const second = serializePowerAnalysisReport(report);
    expect(first).toBe(second);
  });

  it("handles an empty dataset", () => {
    const report = buildPowerAnalysisReport({
      inputRoot: INPUT_ROOT,
      outputPath: OUTPUT_PATH,
      generatedAt: GENERATED_AT,
      summaries: [],
    });

    expect(report.overallSummary.strategyCount).toBe(0);
    expect(report.strategies).toHaveLength(0);
    expect(report.recommendations[0]).toContain("No strategy aggregate summaries");
  });
});
