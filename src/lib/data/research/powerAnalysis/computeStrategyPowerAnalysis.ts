import type { ParsedStrategyAggregateSummary } from "../leaderboard/strategyLeaderboardTypes";

import { extractCompletedMarketPnlSamples } from "./extractMarketPnlSamples";
import {
  computeMeanConfidenceInterval95,
  computeMinimumDetectableEffect,
  computeObservedPower,
  computeRequiredSampleSize,
  mean,
  roundMetric,
  sampleStandardDeviation,
  sampleVariance,
} from "./powerAnalysisMath";
import {
  DEFAULT_POWER_ANALYSIS_ALPHA,
  DEFAULT_POWER_ANALYSIS_LEVELS,
  DEFAULT_TARGET_EDGE_CENTS,
  type PowerTableRow,
  type StrategyPowerAnalysis,
} from "./powerAnalysisTypes";

function buildPowerTable(input: {
  sampleSize: number;
  standardDeviation: number | null;
  alpha: number;
  targetPowerLevels: readonly number[];
  targetEdgeCents: readonly number[];
}): PowerTableRow[] {
  return [...input.targetPowerLevels]
    .sort((left, right) => left - right)
    .map((targetPower) => ({
      targetPower,
      alpha: input.alpha,
      minimumDetectableEffectCents:
        input.standardDeviation === null
          ? null
          : computeMinimumDetectableEffect({
              sampleSize: input.sampleSize,
              standardDeviation: input.standardDeviation,
              alpha: input.alpha,
              targetPower,
            }),
      requiredSampleSizeByEdgeCents: [...input.targetEdgeCents]
        .sort((left, right) => left - right)
        .map((edgeCents) => ({
          edgeCents,
          requiredSampleSize:
            input.standardDeviation === null
              ? null
              : computeRequiredSampleSize({
                  edgeCents,
                  standardDeviation: input.standardDeviation,
                  alpha: input.alpha,
                  targetPower,
                }),
        })),
    }));
}

function estimateMarketsRequiredForObservedEffect(input: {
  observedMeanPnlCents: number | null;
  standardDeviation: number | null;
  alpha: number;
  targetPower: number;
}): number | null {
  if (
    input.observedMeanPnlCents === null
    || input.observedMeanPnlCents <= 0
    || input.standardDeviation === null
  ) {
    return null;
  }

  return computeRequiredSampleSize({
    edgeCents: input.observedMeanPnlCents,
    standardDeviation: input.standardDeviation,
    alpha: input.alpha,
    targetPower: input.targetPower,
  });
}

/** Computes power-analysis metrics for one strategy aggregate summary. */
export function computeStrategyPowerAnalysis(
  summary: ParsedStrategyAggregateSummary,
  options: {
    alpha?: number;
    targetPowerLevels?: readonly number[];
    targetEdgeCents?: readonly number[];
    referencePower?: number;
  } = {},
): StrategyPowerAnalysis {
  const alpha = options.alpha ?? DEFAULT_POWER_ANALYSIS_ALPHA;
  const targetPowerLevels = options.targetPowerLevels ?? DEFAULT_POWER_ANALYSIS_LEVELS;
  const targetEdgeCents = options.targetEdgeCents ?? DEFAULT_TARGET_EDGE_CENTS;
  const referencePower = options.referencePower ?? 0.8;

  const samples = extractCompletedMarketPnlSamples(summary.markets);
  const pnlValues = samples.map((sample) => sample.totalPnlCents);
  const sampleSize = pnlValues.length;
  const warnings: string[] = [];

  if (sampleSize === 0) {
    warnings.push("No completed markets available for power analysis.");
  } else if (sampleSize === 1) {
    warnings.push("Only one completed market; variance-based power estimates are unavailable.");
  } else if (sampleSize < 5) {
    warnings.push("Small sample size; power estimates may be unstable.");
  }

  const observedMeanPnlCents = mean(pnlValues);
  const observedVariance = sampleVariance(pnlValues);
  const observedStandardDeviation = sampleStandardDeviation(pnlValues);
  const observedEffectSize =
    observedMeanPnlCents !== null
    && observedStandardDeviation !== null
    && observedStandardDeviation > 0
      ? roundMetric(observedMeanPnlCents / observedStandardDeviation)
      : null;

  const confidenceInterval95 = computeMeanConfidenceInterval95(pnlValues);
  const currentPowerAtObservedEffect =
    observedMeanPnlCents === null || observedStandardDeviation === null
      ? null
      : computeObservedPower({
          sampleSize,
          meanPnlCents: observedMeanPnlCents,
          standardDeviation: observedStandardDeviation,
          alpha,
        });

  const estimatedMarketsRequiredForObservedEffect =
    estimateMarketsRequiredForObservedEffect({
      observedMeanPnlCents,
      standardDeviation: observedStandardDeviation,
      alpha,
      targetPower: referencePower,
    });

  const powerTable = buildPowerTable({
    sampleSize,
    standardDeviation: observedStandardDeviation,
    alpha,
    targetPowerLevels,
    targetEdgeCents,
  });

  const referenceRow = powerTable.find((row) => row.targetPower === referencePower);
  const requiredFor2CentEdge =
    referenceRow?.requiredSampleSizeByEdgeCents.find((entry) => entry.edgeCents === 2)
      ?.requiredSampleSize ?? null;

  const underpowered =
    sampleSize < 2
    || (requiredFor2CentEdge !== null && sampleSize < requiredFor2CentEdge)
    || (currentPowerAtObservedEffect !== null
      && observedMeanPnlCents !== null
      && observedMeanPnlCents > 0
      && currentPowerAtObservedEffect < referencePower);

  if (underpowered && sampleSize >= 2) {
    warnings.push(
      `Current sample size (${sampleSize}) is likely underpowered at ${referencePower * 100}% power.`,
    );
  }

  return {
    strategyId: summary.strategyId,
    sampleSize,
    observedMeanPnlCents:
      observedMeanPnlCents === null ? null : roundMetric(observedMeanPnlCents),
    observedVariance:
      observedVariance === null ? null : roundMetric(observedVariance),
    observedStandardDeviation:
      observedStandardDeviation === null ? null : roundMetric(observedStandardDeviation),
    observedEffectSize,
    confidenceInterval95,
    currentPowerAtObservedEffect,
    estimatedMarketsRequiredForObservedEffect,
    underpowered,
    powerTable,
    sourcePaths: [...summary.sourcePaths].sort(),
    warnings,
  };
}
