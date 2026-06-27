import { clamp01, normalizeSigned } from "@/lib/features/normalize";
import type { MarketFeatureVector } from "@/lib/features/types";

import {
  DEFAULT_PROBABILITY_MODEL_CONFIG,
  PROBABILITY_MODEL_VERSION,
  type ProbabilityDriverContribution,
  type ProbabilityEstimate,
  type ProbabilityModelConfig,
} from "./types";

function sigmoid(logOdds: number): number {
  if (!Number.isFinite(logOdds)) {
    return 0.5;
  }
  if (logOdds >= 20) return 1;
  if (logOdds <= -20) return 0;
  return 1 / (1 + Math.exp(-logOdds));
}

function distanceLogOdds(
  features: MarketFeatureVector,
  config: ProbabilityModelConfig,
): number {
  const percent = features.percentToTarget.percent;
  return (percent / 100) * config.distanceWeight * 10;
}

function momentumLogOdds(
  features: MarketFeatureVector,
  config: ProbabilityModelConfig,
): number {
  const normalized = normalizeSigned(
    features.momentum.changePercent,
    config.momentumNormalizePercent,
  );
  return normalized * config.momentumWeight;
}

function trendLogOdds(
  features: MarketFeatureVector,
  config: ProbabilityModelConfig,
): number {
  return features.trend.score * config.trendWeight;
}

function crossTargetLogOdds(
  features: MarketFeatureVector,
  config: ProbabilityModelConfig,
): number {
  const { crossed, direction } = features.crossedTargetRecently;
  if (!crossed || direction === null) {
    return 0;
  }
  return direction === "up" ? config.crossUpWeight : config.crossDownWeight;
}

function volatilityDampenMultiplier(
  features: MarketFeatureVector,
  config: ProbabilityModelConfig,
): number {
  const cv = Math.max(features.volatility.coefficientOfVariation, 0);
  return 1 / (1 + cv * config.volatilityDampenFactor);
}

function timeUrgencyMultiplier(
  features: MarketFeatureVector,
  config: ProbabilityModelConfig,
): number {
  const { minutes, expired } = features.timeRemaining;
  if (expired || minutes <= 0) {
    return config.timeUrgencyMaxAmplify;
  }

  const urgency = clamp01(
    1 - minutes / Math.max(config.timeUrgencyMinutes, 1e-9),
  );
  return 1 + urgency * (config.timeUrgencyMaxAmplify - 1);
}

function computeConfidence(
  features: MarketFeatureVector,
  config: ProbabilityModelConfig,
): number {
  const barFactor = clamp01(
    features.volatility.bars / Math.max(config.confidenceMinBars, 1),
  );
  const liquidityFactor = clamp01(features.liquidity.score / 100);
  const timeFactor =
    features.timeRemaining.expired || features.timeRemaining.minutes <= 0
      ? 0.35
      : clamp01(features.timeRemaining.minutes / 15);

  return clamp01(barFactor * 0.45 + liquidityFactor * 0.35 + timeFactor * 0.2);
}

/**
 * Deterministic fair-value probability from a `MarketFeatureVector`.
 * No I/O, no clock reads — suitable for golden tests and backtests.
 */
export function estimateProbability(
  features: MarketFeatureVector,
  config: ProbabilityModelConfig = DEFAULT_PROBABILITY_MODEL_CONFIG,
): ProbabilityEstimate {
  const drivers: ProbabilityDriverContribution[] = [
    { driver: "distance", logOddsAdjustment: distanceLogOdds(features, config) },
    { driver: "momentum", logOddsAdjustment: momentumLogOdds(features, config) },
    { driver: "trend", logOddsAdjustment: trendLogOdds(features, config) },
    { driver: "crossTarget", logOddsAdjustment: crossTargetLogOdds(features, config) },
  ];

  const rawLogOdds = drivers.reduce(
    (sum, driver) => sum + driver.logOddsAdjustment,
    0,
  );

  const volDampen = volatilityDampenMultiplier(features, config);
  const timeAmplify = timeUrgencyMultiplier(features, config);

  drivers.push({
    driver: "volatilityDampen",
    logOddsAdjustment: rawLogOdds * (volDampen - 1),
  });
  drivers.push({
    driver: "timeUrgency",
    logOddsAdjustment: rawLogOdds * volDampen * (timeAmplify - 1),
  });

  const logOdds = rawLogOdds * volDampen * timeAmplify;
  const probabilityUp = clamp01(sigmoid(logOdds));
  const probabilityDown = clamp01(1 - probabilityUp);

  return {
    probabilityUp,
    probabilityDown,
    confidence: computeConfidence(features, config),
    modelVersion: PROBABILITY_MODEL_VERSION,
    logOdds,
    drivers,
  };
}

export {
  DEFAULT_PROBABILITY_MODEL_CONFIG,
  PROBABILITY_MODEL_VERSION,
} from "./types";

export type {
  ProbabilityDriver,
  ProbabilityDriverContribution,
  ProbabilityEstimate,
  ProbabilityModelConfig,
} from "./types";
