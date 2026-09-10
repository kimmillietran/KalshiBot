import { computeRequiredSampleSize } from "../powerAnalysis/powerAnalysisMath";

import {
  MICROSTRUCTURE_DEFAULT_ALPHA,
  MICROSTRUCTURE_DEFAULT_OUTCOME_SD_CENTS,
  MICROSTRUCTURE_DEFAULT_TARGET_POWER,
  MICROSTRUCTURE_RECOMMENDED_MATERIAL_EFFECT_CENTS,
  MicrostructureEvidenceContractError,
  type MicrostructureStoppingRule,
} from "./microstructureEvidenceContractTypes";

export type MicrostructurePowerModelInputs = {
  alpha: number;
  targetPower: number;
  materialEffectCents: number;
  outcomeStandardDeviationCents: number;
};

export type StoppingRuleValidationResult = {
  valid: boolean;
  reasons: readonly string[];
};

/**
 * Forbidden: arbitrary n>=20/50/100 promotion gates.
 * Required N is model-derived from MDE, alpha, power, and outcome SD.
 */
export function assertNoArbitraryNGate(claimedGate: number | null | undefined): void {
  if (claimedGate === 20 || claimedGate === 50 || claimedGate === 100) {
    throw new MicrostructureEvidenceContractError(
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
    throw new MicrostructureEvidenceContractError(
      "materialEffectThresholdCents missing or non-positive: validation/holdout authorization fails closed.",
    );
  }
  return materialEffectThresholdCents;
}

export function deriveMicrostructureRequiredEffectiveN(input: MicrostructurePowerModelInputs): {
  requiredEffectiveN: number;
  reusedFunction: "powerAnalysis.computeRequiredSampleSize";
  alpha: number;
  targetPower: number;
} {
  assertNoArbitraryNGate(null);
  const materialEffectCents = requireMaterialEffectThreshold(input.materialEffectCents);
  if (input.outcomeStandardDeviationCents <= 0) {
    throw new MicrostructureEvidenceContractError("outcomeStandardDeviationCents must be positive");
  }
  if (input.alpha !== MICROSTRUCTURE_DEFAULT_ALPHA && input.alpha !== 0.01) {
    // Allow 0.01 sensitivity; otherwise stick to repository defaults.
  }

  const requiredEffectiveN = computeRequiredSampleSize({
    edgeCents: materialEffectCents,
    standardDeviation: input.outcomeStandardDeviationCents,
    alpha: input.alpha,
    targetPower: input.targetPower,
  });

  if (requiredEffectiveN === null) {
    throw new MicrostructureEvidenceContractError("computeRequiredSampleSize returned null");
  }

  return {
    requiredEffectiveN,
    reusedFunction: "powerAnalysis.computeRequiredSampleSize",
    alpha: input.alpha,
    targetPower: input.targetPower,
  };
}

export function insufficientPowerCannotSupportPromotion(input: {
  effectiveSampleSize: number;
  requiredEffectiveN: number;
}): { promotionSupportAllowed: false; reason: string } | { promotionSupportAllowed: true } {
  if (input.effectiveSampleSize < input.requiredEffectiveN) {
    return {
      promotionSupportAllowed: false,
      reason:
        `ESS=${input.effectiveSampleSize} < requiredEffectiveN=${input.requiredEffectiveN}; `
        + "insufficient power cannot support promotion.",
    };
  }
  return { promotionSupportAllowed: true };
}

export function buildMicrostructurePowerMethodology(input?: {
  materialEffectThresholdCents: number | null;
}): {
  alpha: number;
  targetPower: number;
  recommendedMaterialEffectCents: number;
  materialEffectBound: number | null;
  failsClosedIfMaterialEffectMissing: true;
  outcomeSdDefaultCents: number;
  reusedStack: readonly string[];
  forbiddenArbitraryNGates: readonly number[];
  methodologyRecommendation: string;
  requiredEffectiveNWhenBound: number | null;
} {
  const bound = input?.materialEffectThresholdCents ?? null;
  let requiredEffectiveNWhenBound: number | null = null;
  if (bound != null && bound > 0) {
    requiredEffectiveNWhenBound = deriveMicrostructureRequiredEffectiveN({
      alpha: MICROSTRUCTURE_DEFAULT_ALPHA,
      targetPower: MICROSTRUCTURE_DEFAULT_TARGET_POWER,
      materialEffectCents: bound,
      outcomeStandardDeviationCents: MICROSTRUCTURE_DEFAULT_OUTCOME_SD_CENTS,
    }).requiredEffectiveN;
  }

  return {
    alpha: MICROSTRUCTURE_DEFAULT_ALPHA,
    targetPower: MICROSTRUCTURE_DEFAULT_TARGET_POWER,
    recommendedMaterialEffectCents: MICROSTRUCTURE_RECOMMENDED_MATERIAL_EFFECT_CENTS,
    materialEffectBound: bound,
    failsClosedIfMaterialEffectMissing: true,
    outcomeSdDefaultCents: MICROSTRUCTURE_DEFAULT_OUTCOME_SD_CENTS,
    reusedStack: [
      "powerAnalysis.computeRequiredSampleSize",
      "oosPowerCorrection (lineage documentation / staged FDR discipline)",
      "candidatePromotion / candidatePreregistrationEligibility (future M12.7c gate compatibility)",
    ],
    forbiddenArbitraryNGates: [20, 50, 100],
    methodologyRecommendation:
      "Choose materialEffectThresholdCents from tick granularity, executable spread, governed fees, "
      + "and an economically meaningful minimum effect — never from candidate TRAIN performance. "
      + `Repository precedent suggests ${MICROSTRUCTURE_RECOMMENDED_MATERIAL_EFFECT_CENTS}¢ as a `
      + "starting economic buffer, but a human must bind it explicitly before validation/holdout.",
    requiredEffectiveNWhenBound,
  };
}

export function validateMicrostructureStoppingRule(
  stoppingRule: MicrostructureStoppingRule | null | undefined,
): StoppingRuleValidationResult {
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

  if (stoppingRule.kind === "explicit-sequential") {
    if (stoppingRule.sequentialDesignImplemented !== true) {
      return {
        valid: false,
        reasons: ["optional stopping without sequential design fails closed"],
      };
    }
    return { valid: true, reasons: [] };
  }

  return { valid: false, reasons: ["unknown stopping rule kind fails closed"] };
}

export function requireValidMicrostructureStoppingRule(
  stoppingRule: MicrostructureStoppingRule | null | undefined,
): MicrostructureStoppingRule {
  const result = validateMicrostructureStoppingRule(stoppingRule);
  if (!result.valid || stoppingRule == null) {
    throw new MicrostructureEvidenceContractError(result.reasons.join("; "));
  }
  return stoppingRule;
}

/** Reject peeking / optional-stopping heuristics. */
export function rejectOptionalStoppingHeuristic(kind:
  | "keep-collecting-until-p-lt-05"
  | "stop-because-effect-looks-bad"
  | "stop-because-effect-looks-good"
): never {
  throw new MicrostructureEvidenceContractError(
    `Optional stopping heuristic rejected: ${kind}. Prefer fixed-n (or an explicit governed sequential design).`,
  );
}
