import { quantile } from "@/lib/utils/stats";

import type { ResearchDimensionSampleSizeStats } from "./researchDimensionExplorerTypes";

/** Shannon entropy (base 2) for a non-negative count vector. */
export function computeShannonEntropy(counts: readonly number[]): number | null {
  const positive = counts.filter((count) => count > 0);
  if (positive.length === 0) {
    return null;
  }

  const total = positive.reduce((sum, count) => sum + count, 0);
  if (total <= 0) {
    return null;
  }

  let entropy = 0;
  for (const count of positive) {
    const probability = count / total;
    entropy -= probability * Math.log2(probability);
  }

  return entropy;
}

export function computeSampleSizeStats(
  values: readonly number[],
): ResearchDimensionSampleSizeStats {
  if (values.length === 0) {
    return {
      min: null,
      max: null,
      median: null,
      mean: null,
      p25: null,
      p75: null,
    };
  }

  const sorted = [...values].sort((left, right) => left - right);
  const total = sorted.reduce((sum, value) => sum + value, 0);

  return {
    min: sorted[0] ?? null,
    max: sorted[sorted.length - 1] ?? null,
    median: quantile(sorted, 0.5),
    mean: total / sorted.length,
    p25: quantile(sorted, 0.25),
    p75: quantile(sorted, 0.75),
  };
}
