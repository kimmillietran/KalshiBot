/**
 * M16.1a CR2 cluster-robust variance for an intercept-only mean.
 *
 * Cluster unit: UTC calendar day of observation.
 * Design matrix X = column of ones (k=1).
 * OLS mean μ̂ = ȳ.
 * Residual e_i = y_i − ȳ.
 * Cluster leverage H_g = (1/N) ι_g ι_g′ (eigenvalue n_g/N on the constant span).
 * CR2 residual adjustment on the score: ũ_g = √(N/(N−n_g)) · n_g · (ȳ_g − ȳ).
 * V̂_CR2(μ̂) = Σ_g ũ_g² / N².
 * Primary test: one-sided t with df = G−1 for H0: μ≤0 vs H1: μ>0.
 *
 * Synthetic fixtures only in this milestone — never feed real M16 P&L here.
 */
import {
  oneSampleTTestPValueGreaterThanZero,
  studentTCdf,
} from "@/lib/data/research/statisticalSignificance/studentTTest";

import { M16ReversalError } from "./m16Types";

export const M16_CR2_INFERENCE_METHOD =
  "cr2-cluster-robust-intercept-only-mean-with-one-sided-t-df-G-minus-1" as const;

export type M16ClusteredObservation = {
  clusterKey: string;
  valueCents: number;
};

export type M16Cr2MeanInferenceResult = {
  method: typeof M16_CR2_INFERENCE_METHOD;
  n: number;
  g: number;
  degreesOfFreedom: number;
  sampleMeanCents: number;
  cr2Variance: number;
  cr2StandardError: number;
  tStatistic: number;
  oneSidedPValueGreaterThanZero: number;
  rejectsNullAtAlpha05: boolean;
  sampleMeanStrictlyPositive: boolean;
  supportCriterionMet: boolean;
};

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new M16ReversalError(`M16 CR2: ${label} must be finite`);
  }
}

/**
 * Compute CR2 SE / one-sided t test for H0 μ≤0 vs H1 μ>0.
 * Fail closed on G<2, empty data, or any cluster with n_g = N.
 */
export function computeM16Cr2ClusterMeanInference(
  observations: readonly M16ClusteredObservation[],
  alpha = 0.05,
): M16Cr2MeanInferenceResult {
  if (observations.length === 0) {
    throw new M16ReversalError("M16 CR2: no observations");
  }
  for (const obs of observations) {
    assertFinite(obs.valueCents, "valueCents");
    if (!obs.clusterKey) {
      throw new M16ReversalError("M16 CR2: empty clusterKey");
    }
  }

  const byCluster = new Map<string, number[]>();
  for (const obs of observations) {
    const list = byCluster.get(obs.clusterKey) ?? [];
    list.push(obs.valueCents);
    byCluster.set(obs.clusterKey, list);
  }

  const n = observations.length;
  const g = byCluster.size;
  if (g < 2) {
    throw new M16ReversalError(
      `M16 CR2: require G≥2 distinct clusters; got G=${g}`,
    );
  }
  for (const [key, values] of byCluster) {
    if (values.length === n) {
      throw new M16ReversalError(
        `M16 CR2: cluster ${key} contains all N=${n} observations (N−n_g=0)`,
      );
    }
  }

  const sampleMeanCents =
    observations.reduce((sum, obs) => sum + obs.valueCents, 0) / n;
  assertFinite(sampleMeanCents, "sampleMean");

  let sandwichSum = 0;
  for (const values of byCluster.values()) {
    const nG = values.length;
    const clusterMean =
      values.reduce((sum, value) => sum + value, 0) / nG;
    const score =
      Math.sqrt(n / (n - nG)) * nG * (clusterMean - sampleMeanCents);
    sandwichSum += score * score;
  }

  const cr2Variance = sandwichSum / (n * n);
  assertFinite(cr2Variance, "cr2Variance");
  if (cr2Variance < 0) {
    throw new M16ReversalError("M16 CR2: negative variance");
  }
  if (cr2Variance === 0) {
    throw new M16ReversalError(
      "M16 CR2: zero variance — refuse silent IID fallback",
    );
  }

  const cr2StandardError = Math.sqrt(cr2Variance);
  const tStatistic = sampleMeanCents / cr2StandardError;
  assertFinite(tStatistic, "tStatistic");

  const degreesOfFreedom = g - 1;
  const oneSidedPValueGreaterThanZero = oneSampleTTestPValueGreaterThanZero(
    tStatistic,
    degreesOfFreedom,
  );
  if (oneSidedPValueGreaterThanZero == null) {
    throw new M16ReversalError("M16 CR2: one-sided p-value unavailable");
  }

  const rejectsNullAtAlpha05 = oneSidedPValueGreaterThanZero < alpha;
  const sampleMeanStrictlyPositive = sampleMeanCents > 0;

  return {
    method: M16_CR2_INFERENCE_METHOD,
    n,
    g,
    degreesOfFreedom,
    sampleMeanCents,
    cr2Variance,
    cr2StandardError,
    tStatistic,
    oneSidedPValueGreaterThanZero,
    rejectsNullAtAlpha05,
    sampleMeanStrictlyPositive,
    supportCriterionMet: sampleMeanStrictlyPositive && rejectsNullAtAlpha05,
  };
}

/** Two-sided t CDF helper exposed for fixture checks (critical value approx). */
export function m16StudentTSurvival(t: number, df: number): number {
  return 1 - studentTCdf(t, df);
}
