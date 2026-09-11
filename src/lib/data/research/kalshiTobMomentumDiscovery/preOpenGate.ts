import {
  buildMomentumFamilyDefinitionReport,
  DIRECTION_CONVENTION,
  DIRECTION_COUNT,
  FAMILY_HYPOTHESIS_COUNT,
  MOMENTUM_FAMILY_ID,
  MOMENTUM_SUBFAMILY_ID,
  RESPONSE_MATCH_TOLERANCE_MS,
  enumerateMomentumHypotheses,
  type MomentumFamilyDefinitionReport,
} from "../kalshiTobMomentumFamily";
import {
  assertFamilyUniverseMatchesContract,
  bindAuthoritativeMomentumFamilyDefinition,
} from "../momentumEvidenceContract";
import {
  buildMomentumEvidenceDesignReport,
  deriveMomentumRequiredEffectiveN,
  EXPECTED_MOMENTUM_DISCOVERY_HYPOTHESIS_COUNT,
  EXPECTED_MOMENTUM_FAMILY_ID,
  EXPECTED_MOMENTUM_SUBFAMILY_ID,
  MOMENTUM_DEFAULT_ALPHA,
  MOMENTUM_DEFAULT_TARGET_POWER,
  MOMENTUM_DIRECTION,
  requireValidMomentumStoppingRule,
  type MomentumEvidenceDesignReport,
  type MomentumStoppingRule,
} from "../momentumEvidenceContract";

import {
  BOUND_ALPHA,
  BOUND_MATERIAL_EFFECT_CENTS,
  BOUND_OUTCOME_SD_CENTS,
  BOUND_TARGET_POWER,
  MomentumGovernedDiscoveryError,
} from "./momentumDiscoveryTypes";

export type MomentumPreOpenBundle = {
  familyReport: MomentumFamilyDefinitionReport;
  familyDefinitionIdentity: string;
  evidenceReport: MomentumEvidenceDesignReport;
  evidenceContractIdentity: string;
  materialEffectThresholdCents: number;
  alpha: number;
  targetPower: number;
  outcomeStandardDeviationCents: number;
  requiredEffectiveN: number;
  stoppingRule: MomentumStoppingRule;
  responseMatchToleranceMs: number;
  directionConsistencyRule: "median-signed-gross-executable-pnl-cents-strictly-greater-than-zero";
  structuralSimplicityOrdering: string;
  trainOutcomesOpened: false;
};

export const STRUCTURAL_SIMPLICITY_ORDERING_RULE =
  "Ascending lookbackWindowMs W (5000 before 15000), then ascending thresholdCents X "
  + "(2 before 3), then ascending responseHorizonMs H (5000→15000→30000), then candidateId. "
  + "Bound before TRAIN outcome access; never reordered from observed performance.";

/**
 * Fail-closed pre-open gate. Must complete before any TRAIN response outcome is streamed.
 */
export function sealMomentumPreOpenBundle(): MomentumPreOpenBundle {
  const binding = bindAuthoritativeMomentumFamilyDefinition({
    generatedAt: "1970-01-01T00:00:00.000Z",
  });
  assertFamilyUniverseMatchesContract(binding);

  const familyReport = buildMomentumFamilyDefinitionReport({
    generatedAt: "1970-01-01T00:00:00.000Z",
  });

  if (familyReport.familyId !== MOMENTUM_FAMILY_ID) {
    throw new MomentumGovernedDiscoveryError(
      `Family id mismatch: expected ${MOMENTUM_FAMILY_ID}, got ${familyReport.familyId}`,
    );
  }
  if (familyReport.subfamilyId !== MOMENTUM_SUBFAMILY_ID) {
    throw new MomentumGovernedDiscoveryError(
      `Subfamily id mismatch: expected ${MOMENTUM_SUBFAMILY_ID}, got ${familyReport.subfamilyId}`,
    );
  }
  if (familyReport.searchUniverse.hypothesisCount !== FAMILY_HYPOTHESIS_COUNT) {
    throw new MomentumGovernedDiscoveryError(
      `Expected ${FAMILY_HYPOTHESIS_COUNT} hypotheses; got ${familyReport.searchUniverse.hypothesisCount}`,
    );
  }
  if (familyReport.searchUniverse.hypothesisCount !== 12) {
    throw new MomentumGovernedDiscoveryError("Fail closed: hypothesis count must be exactly 12");
  }
  if (familyReport.searchUniverse.directionCount !== DIRECTION_COUNT || DIRECTION_COUNT !== 1) {
    throw new MomentumGovernedDiscoveryError("Fail closed: direction count must be exactly 1");
  }
  if (familyReport.directionConvention.convention !== DIRECTION_CONVENTION) {
    throw new MomentumGovernedDiscoveryError(
      `Fail closed: direction must be ${DIRECTION_CONVENTION}`,
    );
  }
  if (DIRECTION_CONVENTION !== MOMENTUM_DIRECTION) {
    throw new MomentumGovernedDiscoveryError("Fail closed: direction must be continuation");
  }
  if (familyReport.responseMatchContract.responseMatchToleranceMs !== RESPONSE_MATCH_TOLERANCE_MS) {
    throw new MomentumGovernedDiscoveryError(
      "Fail closed: response-match tolerance must come from family definition",
    );
  }

  const canonicalHypotheses = enumerateMomentumHypotheses();
  const familyHypothesisIds = familyReport.searchUniverse.hypotheses.map((cell) => cell.hypothesisId);
  const canonicalIds = canonicalHypotheses.map((cell) => cell.hypothesisId);
  if (familyHypothesisIds.length !== canonicalIds.length) {
    throw new MomentumGovernedDiscoveryError("Canonical hypothesis ID count mismatch");
  }
  for (let index = 0; index < canonicalIds.length; index += 1) {
    if (familyHypothesisIds[index] !== canonicalIds[index]) {
      throw new MomentumGovernedDiscoveryError(
        `Canonical hypothesis ID mismatch at index ${index}: `
          + `expected ${canonicalIds[index]}, got ${familyHypothesisIds[index]}`,
      );
    }
  }

  const familyDefinitionIdentity = binding.familyDefinitionIdentity;
  if (familyDefinitionIdentity !== familyReport.familyDefinitionIdentityHash) {
    throw new MomentumGovernedDiscoveryError(
      "Family binding identity must match family report identity hash",
    );
  }

  const required = deriveMomentumRequiredEffectiveN({
    alpha: BOUND_ALPHA,
    targetPower: BOUND_TARGET_POWER,
    materialEffectCents: BOUND_MATERIAL_EFFECT_CENTS,
    outcomeStandardDeviationCents: BOUND_OUTCOME_SD_CENTS,
  });

  if (!Number.isFinite(required.requiredEffectiveN) || required.requiredEffectiveN < 2) {
    throw new MomentumGovernedDiscoveryError(
      "Fail closed: model-derived requiredEffectiveN is invalid",
    );
  }
  if (required.reusedFunction !== "powerAnalysis.computeRequiredSampleSize") {
    throw new MomentumGovernedDiscoveryError(
      "Fail closed: required N must come from powerAnalysis.computeRequiredSampleSize",
    );
  }
  if (BOUND_ALPHA !== MOMENTUM_DEFAULT_ALPHA || BOUND_TARGET_POWER !== MOMENTUM_DEFAULT_TARGET_POWER) {
    throw new MomentumGovernedDiscoveryError(
      "Fail closed: alpha/power must match evidence-contract defaults",
    );
  }

  const stoppingRule = requireValidMomentumStoppingRule({
    kind: "fixed-n",
    minimumEffectiveSampleSize: required.requiredEffectiveN,
    interpretationIfNotReached: "inconclusive-underpowered",
  });

  const evidenceReport = buildMomentumEvidenceDesignReport({
    config: {
      familyDefinitionIdentity,
      materialEffectThresholdCents: BOUND_MATERIAL_EFFECT_CENTS,
      alpha: BOUND_ALPHA,
      targetPower: BOUND_TARGET_POWER,
      outcomeStandardDeviationCents: BOUND_OUTCOME_SD_CENTS,
      maxShortlistK: 3,
      expectedDiscoveryHypothesisCount: EXPECTED_MOMENTUM_DISCOVERY_HYPOTHESIS_COUNT,
      stoppingRule,
      outputPath: null,
      htmlOutputPath: null,
    },
    generatedAt: "1970-01-01T00:00:00.000Z",
    sealedInventoryOnly: true,
  });

  if (evidenceReport.expectedFamilyId !== EXPECTED_MOMENTUM_FAMILY_ID) {
    throw new MomentumGovernedDiscoveryError("Evidence contract family id mismatch");
  }
  if (evidenceReport.expectedSubfamilyId !== EXPECTED_MOMENTUM_SUBFAMILY_ID) {
    throw new MomentumGovernedDiscoveryError("Evidence contract subfamily id mismatch");
  }
  if (evidenceReport.familyDefinitionIdentity !== familyDefinitionIdentity) {
    throw new MomentumGovernedDiscoveryError(
      "Evidence contract must bind the exact M14.0a familyDefinitionIdentity",
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
      "median-signed-gross-executable-pnl-cents-strictly-greater-than-zero",
    structuralSimplicityOrdering: STRUCTURAL_SIMPLICITY_ORDERING_RULE,
    trainOutcomesOpened: false,
  };
}

export function isDirectionConsistentWithFamily(
  signedExecutableMedianCents: number | null,
): boolean {
  return signedExecutableMedianCents != null && signedExecutableMedianCents > 0;
}

export function printMomentumPreOpenSummary(
  preOpen: MomentumPreOpenBundle,
  log: (message: string) => void = console.error,
  extras?: {
    trainRunId?: string;
    trainContaminationRole?: string;
    validationQuarantined?: boolean;
    holdoutQuarantined?: boolean;
    shortlistCap?: number;
  },
): void {
  log(`family identity = ${preOpen.familyDefinitionIdentity}`);
  log(`evidence contract identity = ${preOpen.evidenceContractIdentity}`);
  if (extras?.trainRunId != null) {
    log(`TRAIN run = ${extras.trainRunId}`);
  }
  if (extras?.trainContaminationRole != null) {
    log(`TRAIN contamination role = ${extras.trainContaminationRole}`);
  }
  log(`hypothesis count = 12`);
  log(`direction = continuation`);
  log(`alpha = ${preOpen.alpha}`);
  log(`power = ${preOpen.targetPower}`);
  log(`MDE = ${preOpen.materialEffectThresholdCents}¢`);
  log(`SD = ${preOpen.outcomeStandardDeviationCents}¢`);
  log(`shortlist cap = ${extras?.shortlistCap ?? 3}`);
  log(`validation quarantined = ${extras?.validationQuarantined ?? true}`);
  log(`holdout quarantined = ${extras?.holdoutQuarantined ?? true}`);
  log(
    `M14.0b pre-open sealed: requiredN=${preOpen.requiredEffectiveN} `
      + `family=${preOpen.familyDefinitionIdentity.slice(0, 12)}… `
      + `evidence=${preOpen.evidenceContractIdentity.slice(0, 12)}…`,
  );
}
