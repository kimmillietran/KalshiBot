import {
  deterministicUniformIndex,
  mean,
  percentile,
} from "./deterministicSampling";
import type { CompletedMarketSample, ConfidenceInterval } from "./statisticalSignificanceTypes";

function confidencePercentiles(confidenceLevel: number): {
  lowerPct: number;
  upperPct: number;
} {
  const alpha = (1 - confidenceLevel) / 2;
  return {
    lowerPct: alpha * 100,
    upperPct: (1 - alpha) * 100,
  };
}

/** Deterministic bootstrap CI for the mean of per-market PnL samples. */
export function bootstrapMeanConfidenceInterval(
  values: readonly number[],
  options: {
    seed: number;
    simulationCount: number;
    confidenceLevel: number;
  },
): ConfidenceInterval | null {
  if (values.length === 0) {
    return null;
  }

  const pointEstimate = mean(values);
  const sampleSize = values.length;
  const { lowerPct, upperPct } = confidencePercentiles(options.confidenceLevel);
  const bootstrapMeans: number[] = [];

  for (let simulationIndex = 0; simulationIndex < options.simulationCount; simulationIndex += 1) {
    let sum = 0;
    for (let drawIndex = 0; drawIndex < sampleSize; drawIndex += 1) {
      const index = deterministicUniformIndex({
        seed: options.seed,
        simulationIndex,
        drawIndex,
        upperBound: sampleSize,
      });
      sum += values[index]!;
    }
    bootstrapMeans.push(sum / sampleSize);
  }

  bootstrapMeans.sort((left, right) => left - right);

  return {
    lower: percentile(bootstrapMeans, lowerPct),
    upper: percentile(bootstrapMeans, upperPct),
    pointEstimate,
  };
}

/** Deterministic bootstrap CI for trade-weighted win rate across markets. */
export function bootstrapWinRateConfidenceInterval(
  samples: readonly CompletedMarketSample[],
  options: {
    seed: number;
    simulationCount: number;
    confidenceLevel: number;
  },
): ConfidenceInterval | null {
  if (samples.length === 0) {
    return null;
  }

  const totalTrades = samples.reduce((sum, sample) => sum + sample.tradeCount, 0);
  if (totalTrades === 0) {
    return null;
  }

  const totalWins = samples.reduce(
    (sum, sample) => sum + sample.winningTradeCount,
    0,
  );
  const pointEstimate = (totalWins / totalTrades) * 100;
  const sampleSize = samples.length;
  const { lowerPct, upperPct } = confidencePercentiles(options.confidenceLevel);
  const bootstrapRates: number[] = [];

  for (let simulationIndex = 0; simulationIndex < options.simulationCount; simulationIndex += 1) {
    let wins = 0;
    let trades = 0;
    for (let drawIndex = 0; drawIndex < sampleSize; drawIndex += 1) {
      const index = deterministicUniformIndex({
        seed: options.seed,
        simulationIndex,
        drawIndex,
        upperBound: sampleSize,
      });
      const sample = samples[index]!;
      wins += sample.winningTradeCount;
      trades += sample.tradeCount;
    }

    bootstrapRates.push(trades === 0 ? 0 : (wins / trades) * 100);
  }

  bootstrapRates.sort((left, right) => left - right);

  return {
    lower: percentile(bootstrapRates, lowerPct),
    upper: percentile(bootstrapRates, upperPct),
    pointEstimate,
  };
}
