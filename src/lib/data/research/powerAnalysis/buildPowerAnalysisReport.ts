import { stableStringify } from "@/lib/trading/config/hashConfig";

import { discoverStrategyAggregateSummaries } from "../leaderboard/discoverStrategyAggregateSummaries";
import { StrategyLeaderboardErrorCode } from "../leaderboard/strategyLeaderboardTypes";
import type { StrategyLeaderboardError } from "../leaderboard/strategyLeaderboardTypes";

import { computeStrategyPowerAnalysis } from "./computeStrategyPowerAnalysis";
import {
  DEFAULT_POWER_ANALYSIS_ALPHA,
  DEFAULT_POWER_ANALYSIS_LEVELS,
  DEFAULT_TARGET_EDGE_CENTS,
  type BuildPowerAnalysisReportInput,
  type PowerAnalysisIo,
  type PowerAnalysisOverallSummary,
  type PowerAnalysisReport,
  type StrategyPowerAnalysis,
} from "./powerAnalysisTypes";

function sortStrategies(
  strategies: readonly StrategyPowerAnalysis[],
): StrategyPowerAnalysis[] {
  return [...strategies].sort((left, right) =>
    left.strategyId.localeCompare(right.strategyId),
  );
}

function buildOverallSummary(
  strategies: readonly StrategyPowerAnalysis[],
): PowerAnalysisOverallSummary {
  const requiredFor2Cent = strategies
    .map(
      (strategy) =>
        strategy.powerTable
          .find((row) => row.targetPower === 0.8)
          ?.requiredSampleSizeByEdgeCents.find((entry) => entry.edgeCents === 2)
          ?.requiredSampleSize ?? null,
    )
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right);

  const medianRequiredSampleSizeFor2CentEdge =
    requiredFor2Cent.length === 0
      ? null
      : requiredFor2Cent[Math.floor(requiredFor2Cent.length / 2)]!;

  return {
    strategyCount: strategies.length,
    totalCompletedMarkets: strategies.reduce(
      (sum, strategy) => sum + strategy.sampleSize,
      0,
    ),
    underpoweredStrategyCount: strategies.filter((strategy) => strategy.underpowered)
      .length,
    medianRequiredSampleSizeFor2CentEdge,
  };
}

function buildRecommendations(
  strategies: readonly StrategyPowerAnalysis[],
): string[] {
  const recommendations = new Set<string>();

  if (strategies.length === 0) {
    recommendations.add("No strategy aggregate summaries found; run research:aggregate first.");
    return [...recommendations].sort((left, right) => left.localeCompare(right));
  }

  const underpowered = strategies.filter((strategy) => strategy.underpowered);
  if (underpowered.length > 0) {
    recommendations.add(
      `Current sample sizes are likely underpowered for ${underpowered.length} of ${strategies.length} strategies.`,
    );

    for (const strategy of underpowered) {
      const required =
        strategy.estimatedMarketsRequiredForObservedEffect
        ?? strategy.powerTable
          .find((row) => row.targetPower === 0.8)
          ?.requiredSampleSizeByEdgeCents.find((entry) => entry.edgeCents === 2)
          ?.requiredSampleSize
        ?? null;

      if (required !== null) {
        recommendations.add(
          `Strategy ${strategy.strategyId}: estimated markets required ${required} at 80% power.`,
        );
      }
    }
  } else {
    recommendations.add(
      "Observed sample sizes appear adequate for 2¢ edge detection at 80% power.",
    );
  }

  return [...recommendations].sort((left, right) => left.localeCompare(right));
}

function buildEmptyReport(input: {
  inputRoot: string;
  outputPath: string;
  generatedAt: string;
  alpha: number;
  targetPowerLevels: readonly number[];
  targetEdgeCents: readonly number[];
}): PowerAnalysisReport {
  return {
    generatedAt: input.generatedAt,
    inputRoot: input.inputRoot,
    outputPath: input.outputPath,
    alpha: input.alpha,
    targetPowerLevels: [...input.targetPowerLevels],
    targetEdgeCents: [...input.targetEdgeCents],
    overallSummary: {
      strategyCount: 0,
      totalCompletedMarkets: 0,
      underpoweredStrategyCount: 0,
      medianRequiredSampleSizeFor2CentEdge: null,
    },
    strategies: [],
    recommendations: [
      "No strategy aggregate summaries found; run research:aggregate first.",
    ],
  };
}

/** Builds a deterministic power-analysis report from aggregate summaries. */
export function buildPowerAnalysisReport(
  input: BuildPowerAnalysisReportInput,
): PowerAnalysisReport {
  const alpha = input.alpha ?? DEFAULT_POWER_ANALYSIS_ALPHA;
  const targetPowerLevels = input.targetPowerLevels ?? DEFAULT_POWER_ANALYSIS_LEVELS;
  const targetEdgeCents = input.targetEdgeCents ?? DEFAULT_TARGET_EDGE_CENTS;

  if (input.summaries.length === 0) {
    return buildEmptyReport({
      inputRoot: input.inputRoot,
      outputPath: input.outputPath,
      generatedAt: input.generatedAt,
      alpha,
      targetPowerLevels,
      targetEdgeCents,
    });
  }

  const strategies = sortStrategies(
    input.summaries.map((summary) =>
      computeStrategyPowerAnalysis(summary, {
        alpha,
        targetPowerLevels,
        targetEdgeCents,
      }),
    ),
  );

  return {
    generatedAt: input.generatedAt,
    inputRoot: input.inputRoot,
    outputPath: input.outputPath,
    alpha,
    targetPowerLevels: [...targetPowerLevels],
    targetEdgeCents: [...targetEdgeCents],
    overallSummary: buildOverallSummary(strategies),
    strategies,
    recommendations: buildRecommendations(strategies),
  };
}

export function discoverPowerAnalysisSummaries(
  inputRoot: string,
  io: PowerAnalysisIo,
) {
  try {
    return discoverStrategyAggregateSummaries(inputRoot, io);
  } catch (error) {
    const leaderboardError = error as StrategyLeaderboardError;
    if (
      leaderboardError.code === StrategyLeaderboardErrorCode.EMPTY_DATASET
      || leaderboardError.code === StrategyLeaderboardErrorCode.MISSING_INPUT_DIRECTORY
    ) {
      return [];
    }

    throw error;
  }
}

export function buildPowerAnalysisReportFromDirectories(
  inputRoot: string,
  outputPath: string,
  io: PowerAnalysisIo,
  options: { generatedAt: string },
): PowerAnalysisReport {
  const summaries = discoverPowerAnalysisSummaries(inputRoot, io);

  return buildPowerAnalysisReport({
    inputRoot,
    outputPath,
    generatedAt: options.generatedAt,
    summaries,
  });
}

export function serializePowerAnalysisReport(report: PowerAnalysisReport): string {
  return stableStringify(report);
}
