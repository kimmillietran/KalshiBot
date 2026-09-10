import { computeMinimumDetectableEffect } from "../powerAnalysis/powerAnalysisMath";
import {
  DEFAULT_LEAD_LAG_MATERIAL_EFFECT_CENTS,
  DEFAULT_LEAD_LAG_OUTCOME_SD_CENTS,
  deriveRequiredEffectiveEvidence,
} from "../btcKalshiLeadLagEvidenceContract/powerModel";

import type { LockedHoldoutEvaluationMetrics } from "./evaluateLockedHoldoutCandidate";
import type {
  LeadLagHoldoutOverallStatus,
  LeadLagHoldoutPowerResult,
  LeadLagHoldoutRecommendedNextAction,
  LeadLagHoldoutStatisticalVerdict,
} from "./leadLagHoldoutTypes";

export const DEFAULT_HOLDOUT_EXECUTABLE_OBSERVABILITY_FLOOR = 0.05;

export function computeHoldoutPowerResult(input: {
  metrics: LockedHoldoutEvaluationMetrics;
  alpha: number;
  targetPower: number;
  materialEffectThresholdCents: number;
  outcomeStandardDeviationCents: number;
}): LeadLagHoldoutPowerResult {
  const required = deriveRequiredEffectiveEvidence({
    alpha: input.alpha,
    targetPower: input.targetPower,
    materialEffectCents: input.materialEffectThresholdCents,
    outcomeStandardDeviationCents: input.outcomeStandardDeviationCents,
  });
  const requiredEvidence = required.requiredEffectiveN;
  const ess = input.metrics.effectiveSampleSize;
  const isUnderpowered =
    requiredEvidence === null ? true : ess < requiredEvidence;
  const mde = computeMinimumDetectableEffect({
    sampleSize: Math.max(ess, 2),
    standardDeviation: input.outcomeStandardDeviationCents,
    alpha: input.alpha,
    targetPower: input.targetPower,
  });
  const observed = input.metrics.holdoutEffectCents;
  // Direction-adjusted: positive means consistent with declared direction.
  const clearsMde =
    observed !== null
    && Number.isFinite(observed)
    && observed >= input.materialEffectThresholdCents;

  return {
    alpha: input.alpha,
    targetPower: input.targetPower,
    materialEffectThresholdCents: input.materialEffectThresholdCents,
    outcomeStandardDeviationCents: input.outcomeStandardDeviationCents,
    requiredEvidence,
    effectiveSampleSize: ess,
    minimumDetectableEffect: mde,
    clearsMde,
    isUnderpowered,
    observedPrimaryEffectCents: observed,
  };
}

export function classifyHoldoutVerdict(input: {
  qualityPassed: boolean;
  qualityFailureReasons: readonly string[];
  metrics: LockedHoldoutEvaluationMetrics;
  power: LeadLagHoldoutPowerResult;
  executableObservabilityFloor?: number;
}): {
  holdoutStatisticalVerdict: LeadLagHoldoutStatisticalVerdict;
  holdoutOverallStatus: LeadLagHoldoutOverallStatus;
  recommendedNextAction: LeadLagHoldoutRecommendedNextAction;
  executionObservabilitySatisfied: boolean;
  rationale: readonly string[];
} {
  const floor =
    input.executableObservabilityFloor ?? DEFAULT_HOLDOUT_EXECUTABLE_OBSERVABILITY_FLOOR;
  const execShare = input.metrics.executableObservabilityShare;
  const executionObservabilitySatisfied =
    execShare !== null && execShare >= floor;
  const rationale: string[] = [];

  if (!input.qualityPassed) {
    rationale.push(...input.qualityFailureReasons);
    return {
      holdoutStatisticalVerdict: "capture-quality-failure",
      holdoutOverallStatus: "holdout-capture-quality-failure",
      recommendedNextAction: "invalid-holdout-evidence",
      executionObservabilitySatisfied,
      rationale,
    };
  }

  if (input.metrics.rawEligibleEventCount === 0) {
    rationale.push("No eligible locked-cell events on holdout.");
    return {
      holdoutStatisticalVerdict: "insufficient-incidence",
      holdoutOverallStatus: "holdout-insufficient-incidence",
      recommendedNextAction: "insufficient-holdout-evidence",
      executionObservabilitySatisfied,
      rationale,
    };
  }

  if (input.power.isUnderpowered) {
    rationale.push(
      `Effective sample size ${input.power.effectiveSampleSize} < required `
        + `${input.power.requiredEvidence}; underpowered status remains underpowered.`,
    );
    return {
      holdoutStatisticalVerdict: "underpowered",
      holdoutOverallStatus: "holdout-underpowered",
      recommendedNextAction: "insufficient-holdout-evidence",
      executionObservabilitySatisfied,
      rationale,
    };
  }

  if (!executionObservabilitySatisfied) {
    rationale.push(
      "Inadequate execution observability blocks economic support "
        + `(share=${execShare}, floor=${floor}). Midpoint cannot substitute for executable evidence.`,
    );
    return {
      holdoutStatisticalVerdict: "reject",
      holdoutOverallStatus: "holdout-reject",
      recommendedNextAction: "reject-lead-lag-candidate",
      executionObservabilitySatisfied,
      rationale,
    };
  }

  if (!input.power.clearsMde) {
    rationale.push(
      "MDE/material-effect failure cannot become support "
        + `(observed=${input.power.observedPrimaryEffectCents}, `
        + `threshold=${input.power.materialEffectThresholdCents}).`,
    );
    return {
      holdoutStatisticalVerdict: "reject",
      holdoutOverallStatus: "holdout-reject",
      recommendedNextAction: "reject-lead-lag-candidate",
      executionObservabilitySatisfied,
      rationale,
    };
  }

  rationale.push(
    "Holdout ESS met; primary signed midpoint clears material threshold in declared direction; "
      + "execution observability satisfied.",
  );
  return {
    holdoutStatisticalVerdict: "support",
    holdoutOverallStatus: "holdout-support",
    recommendedNextAction: "proceed-to-promotion-evaluation",
    executionObservabilitySatisfied,
    rationale,
  };
}

export function defaultHoldoutPowerAssumptions(): {
  materialEffectThresholdCents: number;
  outcomeStandardDeviationCents: number;
  alpha: number;
  targetPower: number;
} {
  return {
    materialEffectThresholdCents: DEFAULT_LEAD_LAG_MATERIAL_EFFECT_CENTS,
    outcomeStandardDeviationCents: DEFAULT_LEAD_LAG_OUTCOME_SD_CENTS,
    alpha: 0.05,
    targetPower: 0.8,
  };
}
