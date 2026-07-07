import type { HypothesisFailureReasonCategory } from "@/lib/data/research/hypothesisFailureAnalysis/hypothesisFailureAnalysisTypes";

import {
  ROBUSTNESS_DISTRIBUTION_BUCKET_IDS,
  type FailureReasonHistogramEntry,
  type RobustnessDistributionBucketId,
  type RobustnessDistributionEntry,
} from "./researchPortfolioAnalyticsTypes";

export function roundMetric(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function computeMean(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return roundMetric(values.reduce((total, value) => total + value, 0) / values.length);
}

export function computeMedian(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return roundMetric((sorted[middle - 1]! + sorted[middle]!) / 2);
  }

  return roundMetric(sorted[middle]!);
}

export function computePassRate(passCount: number, validationCount: number): number | null {
  if (validationCount === 0) {
    return null;
  }

  return roundMetric(passCount / validationCount);
}

export function resolveRobustnessDistributionBucketId(
  robustnessScore: number,
): RobustnessDistributionBucketId {
  if (robustnessScore <= 34) {
    return "0-34";
  }

  if (robustnessScore <= 49) {
    return "35-49";
  }

  if (robustnessScore <= 59) {
    return "50-59";
  }

  if (robustnessScore <= 69) {
    return "60-69";
  }

  return "70-100";
}

export function buildRobustnessDistribution(
  robustnessScores: readonly number[],
): readonly RobustnessDistributionEntry[] {
  const counts = new Map<RobustnessDistributionBucketId, number>(
    ROBUSTNESS_DISTRIBUTION_BUCKET_IDS.map((bucketId) => [bucketId, 0]),
  );

  for (const score of robustnessScores) {
    const bucketId = resolveRobustnessDistributionBucketId(score);
    counts.set(bucketId, (counts.get(bucketId) ?? 0) + 1);
  }

  return ROBUSTNESS_DISTRIBUTION_BUCKET_IDS.map((bucketId) => ({
    bucketId,
    count: counts.get(bucketId) ?? 0,
  }));
}

export function buildFailureReasonHistogram(
  categories: readonly HypothesisFailureReasonCategory[],
): readonly FailureReasonHistogramEntry[] {
  const counts = new Map<HypothesisFailureReasonCategory, number>();

  for (const category of categories) {
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort(([leftCategory], [rightCategory]) => leftCategory.localeCompare(rightCategory))
    .map(([category, count]) => ({ category, count }));
}

export function computeMonthInstability(monthPersistenceRate: number): number {
  return roundMetric(1 - monthPersistenceRate);
}

export function computeRegimeInstability(input: {
  regimesWithData: number;
  regimesWithEdge: number;
}): number | null {
  if (input.regimesWithData === 0) {
    return null;
  }

  return roundMetric(1 - input.regimesWithEdge / input.regimesWithData);
}
