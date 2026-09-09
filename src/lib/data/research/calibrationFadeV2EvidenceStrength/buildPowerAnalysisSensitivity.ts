import {
  computeRequiredSampleSize,
  roundMetric,
} from "../powerAnalysis/powerAnalysisMath";

import type {
  PowerAnalysisSummary,
  PowerAssumptionRow,
} from "./calibrationFadeV2EvidenceStrengthTypes";
import { meanOrNull } from "./enumerateExactCalibratedNull";

const TARGET_POWERS = [0.8, 0.9] as const;
const ALPHA = 0.05;

/**
 * Required-n sensitivity under a normal approximation for a one-tailed mean-gap test.
 * Reuses existing powerAnalysisMath; does not invent a hardcoded n=100.
 */
export function buildPowerAnalysisSensitivity(input: {
  impliedYesProbabilities: readonly number[];
  rejectionGap: number;
  supportGap: number;
  observedGapMagnitude: number | null;
}): PowerAnalysisSummary {
  const meanVar =
    input.impliedYesProbabilities.length > 0
      ? meanOrNull(input.impliedYesProbabilities.map((p) => p * (1 - p))) ?? 0.25
      : 0.25;
  const worstCaseVar = 0.25;

  const targetGaps = [
    { id: "support-threshold", gap: input.supportGap },
    { id: "rejection-threshold", gap: input.rejectionGap },
  ];
  if (
    input.observedGapMagnitude !== null
    && Number.isFinite(input.observedGapMagnitude)
    && input.observedGapMagnitude > 0
  ) {
    targetGaps.push({ id: "observed-magnitude", gap: input.observedGapMagnitude });
  }

  const varianceSets = [
    {
      id: "current-mean-bernoulli-variance",
      description:
        "Baseline variance = mean(p_i(1-p_i)) from sealed implied probabilities under calibrated Bernoulli model.",
      variance: meanVar,
    },
    {
      id: "worst-case-p-half",
      description: "Baseline variance = 0.25 (Bernoulli p=0.5 upper bound).",
      variance: worstCaseVar,
    },
  ];

  const rows: PowerAssumptionRow[] = [];
  for (const varianceSet of varianceSets) {
    for (const target of targetGaps) {
      for (const targetPower of TARGET_POWERS) {
        const sd = Math.sqrt(varianceSet.variance);
        const requiredN = computeRequiredSampleSize({
          edgeCents: target.gap,
          standardDeviation: sd,
          alpha: ALPHA,
          targetPower,
        });
        rows.push({
          assumptionId: `${varianceSet.id}__${target.id}__power-${targetPower}`,
          description:
            `${varianceSet.description} Target |gap|=${roundMetric(target.gap, 6)}; `
            + `α=${ALPHA}; power=${targetPower}.`,
          targetDetectableCalibrationGap: target.gap,
          alpha: ALPHA,
          targetPower,
          baselineBernoulliVariance: roundMetric(varianceSet.variance, 6),
          requiredN,
        });
      }
    }
  }

  return {
    method: "normal-approximation-one-tailed-mean-gap",
    note:
      "Required N depends on variance and target-gap assumptions. "
      + "These rows are methodological planning aids, not a change to the frozen minimum of 5. "
      + "Do not hard-code n=100 or any other single heuristic as a requirement.",
    rows,
  };
}
