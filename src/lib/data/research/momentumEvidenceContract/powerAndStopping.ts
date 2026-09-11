import { computeRequiredSampleSize } from "../powerAnalysis/powerAnalysisMath";

import {
  MOMENTUM_DEFAULT_ALPHA,
  MOMENTUM_DEFAULT_OUTCOME_SD_CENTS,
  MOMENTUM_DEFAULT_TARGET_POWER,
  MOMENTUM_RECOMMENDED_MATERIAL_EFFECT_CENTS,
  MomentumEvidenceContractError,
  type MomentumStoppingRule,
} from "./momentumEvidenceContractTypes";

export type MomentumPowerModelInputs = {
  alpha: number;
  targetPower: number;
  materialEffectCents: number;
  outcomeStandardDeviationCents: number;
};

export function assertNoArbitraryNGate(claimedGate: number | null | undefined): void {
  if (claimedGate === 20 || claimedGate === 50 || claimedGate === 100) {
    throw new MomentumEvidenceContractError(
      `Arbitrary n>=${claimedGate} promotion gate is forbidden; use model-derived requiredEffectiveN.`,
    );
  }
}

export function requireMaterialEffectThreshold(
  materialEffectThresholdCents: number | null | undefined,
): number {
  if (
    materialEffectThresholdCents == null
    || !Number.isFinite(materialEffectThresholdCents)
    || materialEffectThresholdCents <= 0
  ) {
    throw new MomentumEvidenceContractError(
      "materialEffectThresholdCents missing or non-positive: validation/holdout authorization fails closed.",
    );
  }
  return materialEffectThresholdCents;
}

export function deriveMomentumRequiredEffectiveN(input: MomentumPowerModelInputs): {
  requiredEffectiveN: number;
  reusedFunction: "powerAnalysis.computeRequiredSampleSize";
  oneTailed: true;
  alpha: number;
  targetPower: number;
} {
  assertNoArbitraryNGate(null);
  if (input.alpha !== MOMENTUM_DEFAULT_ALPHA) {
    throw new MomentumEvidenceContractError(
      `alpha must remain fixed at ${MOMENTUM_DEFAULT_ALPHA} for this contract; got ${input.alpha}`,
    );
  }
  if (input.targetPower !== MOMENTUM_DEFAULT_TARGET_POWER) {
    throw new MomentumEvidenceContractError(
      `targetPower must remain fixed at ${MOMENTUM_DEFAULT_TARGET_POWER}; got ${input.targetPower}`,
    );
  }
  const materialEffectCents = requireMaterialEffectThreshold(input.materialEffectCents);
  if (input.outcomeStandardDeviationCents <= 0) {
    throw new MomentumEvidenceContractError("outcomeStandardDeviationCents must be positive");
  }

  const requiredEffectiveN = computeRequiredSampleSize({
    edgeCents: materialEffectCents,
    standardDeviation: input.outcomeStandardDeviationCents,
    alpha: input.alpha,
    targetPower: input.targetPower,
  });

  if (requiredEffectiveN === null) {
    throw new MomentumEvidenceContractError("computeRequiredSampleSize returned null");
  }

  return {
    requiredEffectiveN,
    reusedFunction: "powerAnalysis.computeRequiredSampleSize",
    oneTailed: true,
    alpha: input.alpha,
    targetPower: input.targetPower,
  };
}

export function buildMomentumPowerMethodology(input?: {
  materialEffectThresholdCents: number | null;
}): {
  alpha: number;
  targetPower: number;
  recommendedMaterialEffectCents: number;
  materialEffectBound: number | null;
  outcomeSdDefaultCents: number;
  failsClosedIfMaterialEffectMissing: true;
  reusedStack: readonly string[];
  forbiddenArbitraryNGates: readonly number[];
  requiredEffectiveNWhenBound: number | null;
  methodologyRecommendation: string;
} {
  const bound = input?.materialEffectThresholdCents ?? null;
  let requiredEffectiveNWhenBound: number | null = null;
  if (bound != null && bound > 0) {
    requiredEffectiveNWhenBound = deriveMomentumRequiredEffectiveN({
      alpha: MOMENTUM_DEFAULT_ALPHA,
      targetPower: MOMENTUM_DEFAULT_TARGET_POWER,
      materialEffectCents: bound,
      outcomeStandardDeviationCents: MOMENTUM_DEFAULT_OUTCOME_SD_CENTS,
    }).requiredEffectiveN;
  }

  return {
    alpha: MOMENTUM_DEFAULT_ALPHA,
    targetPower: MOMENTUM_DEFAULT_TARGET_POWER,
    recommendedMaterialEffectCents: MOMENTUM_RECOMMENDED_MATERIAL_EFFECT_CENTS,
    materialEffectBound: bound,
    outcomeSdDefaultCents: MOMENTUM_DEFAULT_OUTCOME_SD_CENTS,
    failsClosedIfMaterialEffectMissing: true,
    reusedStack: [
      "powerAnalysis.computeRequiredSampleSize (one-tailed)",
      "oosPowerCorrection (staged FDR / multiplicity lineage)",
      "candidatePromotion / candidatePreregistrationEligibility",
    ],
    forbiddenArbitraryNGates: [20, 50, 100],
    requiredEffectiveNWhenBound,
    methodologyRecommendation:
      "MDE/SD refer to gross executable one-contract primary estimand unless a fee contract "
      + "is activated and governance promotes fee-adjusted P&L to primary. Bind MDE before "
      + "outcome access; never from observed TRAIN performance.",
  };
}

export function validateMomentumStoppingRule(
  stoppingRule: MomentumStoppingRule | null | undefined,
): { valid: boolean; reasons: readonly string[] } {
  if (stoppingRule == null) {
    return { valid: false, reasons: ["missing stopping rule fails closed"] };
  }
  if (stoppingRule.kind === "fixed-n") {
    if (
      !Number.isFinite(stoppingRule.minimumEffectiveSampleSize)
      || stoppingRule.minimumEffectiveSampleSize < 2
    ) {
      return {
        valid: false,
        reasons: ["fixed-n stopping rule requires minimumEffectiveSampleSize >= 2"],
      };
    }
    return { valid: true, reasons: [] };
  }
  if (stoppingRule.kind === "fixed-capture-horizon") {
    if (
      !Number.isFinite(stoppingRule.captureHorizonHours)
      || stoppingRule.captureHorizonHours <= 0
    ) {
      return {
        valid: false,
        reasons: ["fixed-capture-horizon requires positive captureHorizonHours"],
      };
    }
    return { valid: true, reasons: [] };
  }
  return { valid: false, reasons: ["unknown stopping rule kind fails closed"] };
}

export function requireValidMomentumStoppingRule(
  stoppingRule: MomentumStoppingRule | null | undefined,
): MomentumStoppingRule {
  const result = validateMomentumStoppingRule(stoppingRule);
  if (!result.valid || stoppingRule == null) {
    throw new MomentumEvidenceContractError(result.reasons.join("; "));
  }
  return stoppingRule;
}

/** Reject peeking / optional-stopping heuristics based on observed effect or p-value. */
export function rejectOptionalStoppingHeuristic(kind:
  | "keep-collecting-until-p-lt-05"
  | "stop-because-effect-looks-bad"
  | "stop-because-effect-looks-good"
): never {
  throw new MomentumEvidenceContractError(
    `Optional stopping heuristic rejected: ${kind}. Prefer fixed-n `
      + "(optional max capture budget may end as underpowered/inconclusive, never automatic success).",
  );
}
