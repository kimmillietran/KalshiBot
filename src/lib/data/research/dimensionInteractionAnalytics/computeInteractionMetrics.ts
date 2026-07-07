import type { MispricingAtlasBucketSummary } from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";

export function roundMetric(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Normalized Shannon entropy in [0, 1] across bucket observation counts. */
export function normalizedBucketEntropy(
  buckets: readonly MispricingAtlasBucketSummary[],
): number {
  if (buckets.length === 0) {
    return 0;
  }

  const counts = buckets.map((bucket) => bucket.observations);
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (total === 0) {
    return 0;
  }

  const entropy = counts
    .filter((count) => count > 0)
    .reduce((sum, count) => {
      const probability = count / total;
      return sum - probability * Math.log2(probability);
    }, 0);

  const maxEntropy = Math.log2(buckets.length);
  return maxEntropy > 0 ? roundMetric(entropy / maxEntropy) : 0;
}

export function computeBucketSparsity(
  buckets: readonly MispricingAtlasBucketSummary[],
): number {
  if (buckets.length === 0) {
    return 1;
  }

  const emptyBuckets = buckets.filter((bucket) => bucket.observations === 0).length;
  return roundMetric(emptyBuckets / buckets.length);
}

export function computeCoverageQuality(input: {
  buckets: readonly MispricingAtlasBucketSummary[];
  minSampleThreshold: number;
}): number {
  if (input.buckets.length === 0) {
    return 0;
  }

  const nonEmpty = input.buckets.filter((bucket) => bucket.observations > 0);
  const nonEmptyRatio = nonEmpty.length / input.buckets.length;
  const thresholdRatio =
    nonEmpty.filter((bucket) => bucket.observations >= input.minSampleThreshold).length
    / input.buckets.length;

  const tradingDayScores = nonEmpty.map((bucket) => {
    const uniqueTradingDays = bucket.uniqueTradingDays;
    if (uniqueTradingDays === null || uniqueTradingDays === undefined || uniqueTradingDays === 0) {
      return 0.5;
    }

    return Math.min(1, uniqueTradingDays / 8);
  });
  const tradingDayQuality =
    tradingDayScores.length > 0 ? mean(tradingDayScores) : 0;

  return roundMetric(
    nonEmptyRatio * 0.4 + thresholdRatio * 0.35 + tradingDayQuality * 0.25,
  );
}

export function computeInteractionScore(input: {
  passRate: number;
  averageRobustness: number;
  nearPromisingFrequency: number;
  averageCalibrationError: number;
  coverageQuality: number;
  bucketSparsity: number;
  entropy: number;
}): number {
  const calibrationSignal = Math.min(1, input.averageCalibrationError / 0.1);
  const concentrationQuality = 1 - Math.abs(input.entropy - 0.55) * 1.8;

  return roundMetric(
    input.passRate * 0.25
    + (input.averageRobustness / 100) * 0.2
    + (1 - input.bucketSparsity) * 0.15
    + input.coverageQuality * 0.15
    + Math.max(0, concentrationQuality) * 0.05
    + input.nearPromisingFrequency * 0.1
    + calibrationSignal * 0.1,
  );
}

export function formatDimensionLabel(dimensionId: string): string {
  const labels: Record<string, string> = {
    probability: "Probability",
    coarseProbability: "Probability",
    coarseProbabilityAxis: "Probability",
    timeRemaining: "Time remaining",
    coarseTimeRemaining: "Time remaining",
    moneyness: "Moneyness",
    volatility: "Volatility",
    momentum15m: "Momentum",
    hourUtc: "Hour",
    dayOfWeekUtc: "Weekday",
    sessionBucket: "Session",
    weekendFlag: "Weekend",
  };

  return labels[dimensionId] ?? dimensionId;
}

export function formatInteractionLabel(dimensionIds: readonly string[]): string {
  const uniqueLabels = [...new Set(dimensionIds.map(formatDimensionLabel))];
  return uniqueLabels.join(" × ");
}

export function isNearPromisingHeuristic(input: {
  passes: boolean;
  robustnessScore: number;
  passScoreThreshold: number;
  nearPromisingRobustnessFloor: number;
}): boolean {
  if (input.passes) {
    return false;
  }

  return (
    input.robustnessScore >= input.nearPromisingRobustnessFloor
    && input.robustnessScore < input.passScoreThreshold
  );
}
