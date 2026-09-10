import {
  buildMicrostructureFamilyDefinitionReport,
  DIRECTION_CONVENTION,
  DIRECTION_COUNT,
  FAMILY_HYPOTHESIS_COUNT,
  MICROSTRUCTURE_FAMILY_ID,
  MICROSTRUCTURE_SUBFAMILY_ID,
  RESPONSE_MATCH_TOLERANCE_MS,
  type MicrostructureFamilyDefinitionReport,
} from "../spreadLiquidityMicrostructureFamily";
import {
  BOUND_ALPHA,
  BOUND_MATERIAL_EFFECT_CENTS,
  BOUND_OUTCOME_SD_CENTS,
  BOUND_TARGET_POWER,
  MicrostructureGovernedDiscoveryError,
} from "./microstructureDiscoveryTypes";
import {
  buildMicrostructureEvidenceDesignReport,
  deriveMicrostructureRequiredEffectiveN,
  EXPECTED_MICROSTRUCTURE_DISCOVERY_HYPOTHESIS_COUNT,
  EXPECTED_MICROSTRUCTURE_FAMILY_ID,
  EXPECTED_MICROSTRUCTURE_SUBFAMILY_ID,
  MICROSTRUCTURE_DEFAULT_ALPHA,
  MICROSTRUCTURE_DEFAULT_TARGET_POWER,
  requireValidMicrostructureStoppingRule,
  type MicrostructureEvidenceDesignReport,
  type MicrostructureStoppingRule,
} from "../spreadLiquidityMicrostructureEvidenceContract";

export type MicrostructurePreOpenBundle = {
  familyReport: MicrostructureFamilyDefinitionReport;
  familyDefinitionIdentity: string;
  evidenceReport: MicrostructureEvidenceDesignReport;
  evidenceContractIdentity: string;
  materialEffectThresholdCents: number;
  alpha: number;
  targetPower: number;
  outcomeStandardDeviationCents: number;
  requiredEffectiveN: number;
  stoppingRule: MicrostructureStoppingRule;
  responseMatchToleranceMs: number;
  directionConsistencyRule: "median-signed-primary-executable-response-cents-strictly-greater-than-zero";
  structuralSimplicityOrdering: string;
  trainOutcomesOpened: false;
};

/**
 * Structural simplicity rank — frozen BEFORE TRAIN outcomes.
 * Lower = simpler / broader / preferred.
 * 1) lower |imbalance| threshold
 * 2) shorter response horizon
 * 3) under-5-minutes before 5-to-15-minutes
 * 4) deterministic candidateId (encoded by axes order)
 */
export function computeStructuralSimplicityRank(input: {
  imbalanceThresholdAbs: number;
  responseHorizonMs: number;
  timeRemainingBin: string;
}): number {
  const thresholdRank = input.imbalanceThresholdAbs === 0.4
    ? 0
    : input.imbalanceThresholdAbs === 0.6
      ? 1
      : 99;
  const horizonRank = input.responseHorizonMs === 1_000
    ? 0
    : input.responseHorizonMs === 5_000
      ? 1
      : input.responseHorizonMs === 15_000
        ? 2
        : 99;
  const timeRank = input.timeRemainingBin === "under-5-minutes"
    ? 0
    : input.timeRemainingBin === "5-to-15-minutes"
      ? 1
      : 99;
  return thresholdRank * 100 + horizonRank * 10 + timeRank;
}

export const STRUCTURAL_SIMPLICITY_ORDERING_RULE =
  "Ascending |imbalance| threshold (0.40 before 0.60), then ascending response horizon "
  + "(1000→5000→15000), then under-5-minutes before 5-to-15-minutes, then candidateId. "
  + "Bound before TRAIN outcome access; never reordered from observed performance.";

/**
 * Fail-closed pre-open gate. Must complete before any TRAIN response outcome is streamed.
 */
export function sealMicrostructurePreOpenBundle(): MicrostructurePreOpenBundle {
  const familyReport = buildMicrostructureFamilyDefinitionReport({
    generatedAt: "1970-01-01T00:00:00.000Z",
  });

  if (familyReport.familyId !== MICROSTRUCTURE_FAMILY_ID) {
    throw new MicrostructureGovernedDiscoveryError(
      `Family id mismatch: expected ${MICROSTRUCTURE_FAMILY_ID}, got ${familyReport.familyId}`,
    );
  }
  if (familyReport.subfamilyId !== MICROSTRUCTURE_SUBFAMILY_ID) {
    throw new MicrostructureGovernedDiscoveryError(
      `Subfamily id mismatch: expected ${MICROSTRUCTURE_SUBFAMILY_ID}, got ${familyReport.subfamilyId}`,
    );
  }
  if (familyReport.searchUniverse.hypothesisCount !== FAMILY_HYPOTHESIS_COUNT) {
    throw new MicrostructureGovernedDiscoveryError(
      `Expected ${FAMILY_HYPOTHESIS_COUNT} hypotheses; got ${familyReport.searchUniverse.hypothesisCount}`,
    );
  }
  if (familyReport.searchUniverse.hypothesisCount !== 12) {
    throw new MicrostructureGovernedDiscoveryError("Fail closed: hypothesis count must be exactly 12");
  }
  if (familyReport.searchUniverse.directionCount !== DIRECTION_COUNT || DIRECTION_COUNT !== 1) {
    throw new MicrostructureGovernedDiscoveryError("Fail closed: direction count must be exactly 1");
  }
  if (familyReport.directionConvention.convention !== DIRECTION_CONVENTION) {
    throw new MicrostructureGovernedDiscoveryError(
      `Fail closed: direction must be ${DIRECTION_CONVENTION}`,
    );
  }
  // Evidence contract expects "same-direction" label on candidate axes.
  if (!DIRECTION_CONVENTION.includes("same-direction")) {
    throw new MicrostructureGovernedDiscoveryError("Fail closed: direction must be same-direction");
  }
  if (familyReport.responseMatchContract.responseMatchToleranceMs !== RESPONSE_MATCH_TOLERANCE_MS) {
    throw new MicrostructureGovernedDiscoveryError(
      "Fail closed: response-match tolerance must come from family definition",
    );
  }

  const familyDefinitionIdentity = familyReport.familyDefinitionIdentityHash;

  const required = deriveMicrostructureRequiredEffectiveN({
    alpha: BOUND_ALPHA,
    targetPower: BOUND_TARGET_POWER,
    materialEffectCents: BOUND_MATERIAL_EFFECT_CENTS,
    outcomeStandardDeviationCents: BOUND_OUTCOME_SD_CENTS,
  });

  // Do not hardcode 155 — assert model path produced a positive finite N.
  if (!Number.isFinite(required.requiredEffectiveN) || required.requiredEffectiveN < 2) {
    throw new MicrostructureGovernedDiscoveryError(
      "Fail closed: model-derived requiredEffectiveN is invalid",
    );
  }
  if (required.reusedFunction !== "powerAnalysis.computeRequiredSampleSize") {
    throw new MicrostructureGovernedDiscoveryError(
      "Fail closed: required N must come from powerAnalysis.computeRequiredSampleSize",
    );
  }
  if (BOUND_ALPHA !== MICROSTRUCTURE_DEFAULT_ALPHA || BOUND_TARGET_POWER !== MICROSTRUCTURE_DEFAULT_TARGET_POWER) {
    throw new MicrostructureGovernedDiscoveryError(
      "Fail closed: alpha/power must match evidence-contract defaults",
    );
  }

  const stoppingRule = requireValidMicrostructureStoppingRule({
    kind: "fixed-n",
    minimumEffectiveSampleSize: required.requiredEffectiveN,
    interpretationIfNotReached: "inconclusive-underpowered",
  });

  const evidenceReport = buildMicrostructureEvidenceDesignReport({
    config: {
      familyDefinitionIdentity,
      materialEffectThresholdCents: BOUND_MATERIAL_EFFECT_CENTS,
      alpha: BOUND_ALPHA,
      targetPower: BOUND_TARGET_POWER,
      outcomeStandardDeviationCents: BOUND_OUTCOME_SD_CENTS,
      maxShortlistK: 3,
      expectedDiscoveryHypothesisCount: EXPECTED_MICROSTRUCTURE_DISCOVERY_HYPOTHESIS_COUNT,
      stoppingRule,
      outputPath: null,
      htmlOutputPath: null,
    },
    generatedAt: "1970-01-01T00:00:00.000Z",
  });

  if (evidenceReport.expectedFamilyId !== EXPECTED_MICROSTRUCTURE_FAMILY_ID) {
    throw new MicrostructureGovernedDiscoveryError("Evidence contract family id mismatch");
  }
  if (evidenceReport.expectedSubfamilyId !== EXPECTED_MICROSTRUCTURE_SUBFAMILY_ID) {
    throw new MicrostructureGovernedDiscoveryError("Evidence contract subfamily id mismatch");
  }
  if (evidenceReport.familyDefinitionIdentity !== familyDefinitionIdentity) {
    throw new MicrostructureGovernedDiscoveryError(
      "Evidence contract must bind the exact M13.0a familyDefinitionIdentity",
    );
  }

  return {
    familyReport,
    familyDefinitionIdentity,
    evidenceReport,
    evidenceContractIdentity: evidenceReport.contractIdentityHash,
    materialEffectThresholdCents: BOUND_MATERIAL_EFFECT_CENTS,
    alpha: BOUND_ALPHA,
    targetPower: BOUND_TARGET_POWER,
    outcomeStandardDeviationCents: BOUND_OUTCOME_SD_CENTS,
    requiredEffectiveN: required.requiredEffectiveN,
    stoppingRule,
    responseMatchToleranceMs: familyReport.responseMatchContract.responseMatchToleranceMs,
    directionConsistencyRule:
      "median-signed-primary-executable-response-cents-strictly-greater-than-zero",
    structuralSimplicityOrdering: STRUCTURAL_SIMPLICITY_ORDERING_RULE,
    trainOutcomesOpened: false,
  };
}

export function isDirectionConsistentWithFamily(
  signedExecutableMedianCents: number | null,
): boolean {
  return signedExecutableMedianCents != null && signedExecutableMedianCents > 0;
}
