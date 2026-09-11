import {
  BACKWARD_WINDOWS_MS,
  DIRECTION_CONVENTION,
  FAMILY_HYPOTHESIS_COUNT,
  FORWARD_HORIZONS_MS,
  MOMENTUM_FAMILY_ID,
  MOMENTUM_SUBFAMILY_ID,
  RETURN_THRESHOLDS_CENTS,
  buildMomentumFamilyDefinitionReport,
} from "../kalshiTobMomentumFamily";

import {
  EXPECTED_MOMENTUM_DISCOVERY_HYPOTHESIS_COUNT,
  EXPECTED_MOMENTUM_FAMILY_ID,
  EXPECTED_MOMENTUM_LOOKBACK_WINDOWS_MS,
  EXPECTED_MOMENTUM_RESPONSE_HORIZONS_MS,
  EXPECTED_MOMENTUM_SUBFAMILY_ID,
  EXPECTED_MOMENTUM_THRESHOLDS_CENTS,
  MOMENTUM_DIRECTION,
  MomentumEvidenceContractError,
} from "./momentumEvidenceContractTypes";

/**
 * Narrow adapter for the authoritative M14.0a family definition.
 * Imports the sealed family module for identity/axes only — no historical outcomes.
 */
export type MomentumFamilyDefinitionBinding = {
  familyDefinitionIdentity: string;
  familyId: typeof EXPECTED_MOMENTUM_FAMILY_ID;
  subfamilyId: typeof EXPECTED_MOMENTUM_SUBFAMILY_ID;
  hypothesisCount: typeof EXPECTED_MOMENTUM_DISCOVERY_HYPOTHESIS_COUNT;
  direction: typeof MOMENTUM_DIRECTION;
  lookbackWindowsMs: readonly number[];
  thresholdsCents: readonly number[];
  responseHorizonsMs: readonly number[];
};

export function createUnboundMomentumFamilyBindingSlot(): {
  familyDefinitionIdentity: null;
  expectedFamilyId: typeof EXPECTED_MOMENTUM_FAMILY_ID;
  expectedSubfamilyId: typeof EXPECTED_MOMENTUM_SUBFAMILY_ID;
  expectedHypothesisCount: typeof EXPECTED_MOMENTUM_DISCOVERY_HYPOTHESIS_COUNT;
  expectedDirection: typeof MOMENTUM_DIRECTION;
  realOutcomeAccessAuthorized: false;
  note: string;
} {
  return {
    familyDefinitionIdentity: null,
    expectedFamilyId: EXPECTED_MOMENTUM_FAMILY_ID,
    expectedSubfamilyId: EXPECTED_MOMENTUM_SUBFAMILY_ID,
    expectedHypothesisCount: EXPECTED_MOMENTUM_DISCOVERY_HYPOTHESIS_COUNT,
    expectedDirection: MOMENTUM_DIRECTION,
    realOutcomeAccessAuthorized: false,
    note:
      "M14.0a family-definition identity must be injected before any real momentum "
      + "outcome access. This prep contract is not the identity authority.",
  };
}

/**
 * Fail closed: real historical momentum outcome pipelines require an exact M14.0a identity.
 */
export function requireExactFamilyDefinitionIdentityForOutcomeAccess(
  familyDefinitionIdentity: string | null | undefined,
): string {
  if (
    typeof familyDefinitionIdentity !== "string"
    || familyDefinitionIdentity.trim() === ""
  ) {
    throw new MomentumEvidenceContractError(
      "Exact M14.0a familyDefinitionIdentity required before real momentum outcome access.",
    );
  }
  return familyDefinitionIdentity.trim();
}

export function assertFamilyUniverseMatchesContract(
  binding: MomentumFamilyDefinitionBinding,
): void {
  if (binding.familyId !== EXPECTED_MOMENTUM_FAMILY_ID) {
    throw new MomentumEvidenceContractError(
      `Expected familyId=${EXPECTED_MOMENTUM_FAMILY_ID}; got ${binding.familyId}`,
    );
  }
  if (binding.subfamilyId !== EXPECTED_MOMENTUM_SUBFAMILY_ID) {
    throw new MomentumEvidenceContractError(
      `Expected subfamilyId=${EXPECTED_MOMENTUM_SUBFAMILY_ID}; got ${binding.subfamilyId}`,
    );
  }
  if (binding.hypothesisCount !== EXPECTED_MOMENTUM_DISCOVERY_HYPOTHESIS_COUNT) {
    throw new MomentumEvidenceContractError(
      `Family count must be ${EXPECTED_MOMENTUM_DISCOVERY_HYPOTHESIS_COUNT}; got ${binding.hypothesisCount}`,
    );
  }
  if (binding.direction !== MOMENTUM_DIRECTION) {
    throw new MomentumEvidenceContractError(
      `Continuation is the only allowed direction; got ${String(binding.direction)}`,
    );
  }
  if (
    binding.lookbackWindowsMs.length !== EXPECTED_MOMENTUM_LOOKBACK_WINDOWS_MS.length
    || EXPECTED_MOMENTUM_LOOKBACK_WINDOWS_MS.some(
      (value, index) => binding.lookbackWindowsMs[index] !== value,
    )
  ) {
    throw new MomentumEvidenceContractError("Lookback window axis W must be {5s,15s}");
  }
  if (
    binding.thresholdsCents.length !== EXPECTED_MOMENTUM_THRESHOLDS_CENTS.length
    || EXPECTED_MOMENTUM_THRESHOLDS_CENTS.some(
      (value, index) => binding.thresholdsCents[index] !== value,
    )
  ) {
    throw new MomentumEvidenceContractError("Threshold axis X must be {2¢,3¢}");
  }
  if (
    binding.responseHorizonsMs.length !== EXPECTED_MOMENTUM_RESPONSE_HORIZONS_MS.length
    || EXPECTED_MOMENTUM_RESPONSE_HORIZONS_MS.some(
      (value, index) => binding.responseHorizonsMs[index] !== value,
    )
  ) {
    throw new MomentumEvidenceContractError("Horizon axis H must be {5s,15s,30s}");
  }
}

export function rejectReversalDirectionMutation(
  direction: string,
): asserts direction is typeof MOMENTUM_DIRECTION {
  if (direction !== MOMENTUM_DIRECTION) {
    throw new MomentumEvidenceContractError(
      `Reversal / non-continuation direction mutation fails closed (got ${direction}).`,
    );
  }
}

/**
 * Bind the sealed M14.0a family definition by recomputing its content-addressed identity
 * from the authoritative module (definition schema only — no capture/outcome reads).
 */
export function bindAuthoritativeMomentumFamilyDefinition(input?: {
  expectedIdentity?: string | null;
  generatedAt?: string;
}): MomentumFamilyDefinitionBinding {
  // Cross-check published M14.0a constants against this contract's expected axes.
  if (MOMENTUM_FAMILY_ID !== EXPECTED_MOMENTUM_FAMILY_ID) {
    throw new MomentumEvidenceContractError("M14.0a familyId mismatch");
  }
  if (MOMENTUM_SUBFAMILY_ID !== EXPECTED_MOMENTUM_SUBFAMILY_ID) {
    throw new MomentumEvidenceContractError("M14.0a subfamilyId mismatch");
  }
  if (FAMILY_HYPOTHESIS_COUNT !== EXPECTED_MOMENTUM_DISCOVERY_HYPOTHESIS_COUNT) {
    throw new MomentumEvidenceContractError("M14.0a hypothesisCount mismatch");
  }
  if (DIRECTION_CONVENTION !== MOMENTUM_DIRECTION) {
    throw new MomentumEvidenceContractError("M14.0a direction convention mismatch");
  }

  const report = buildMomentumFamilyDefinitionReport({
    generatedAt: input?.generatedAt ?? "1970-01-01T00:00:00.000Z",
  });

  const binding: MomentumFamilyDefinitionBinding = {
    familyDefinitionIdentity: report.familyDefinitionIdentityHash,
    familyId: EXPECTED_MOMENTUM_FAMILY_ID,
    subfamilyId: EXPECTED_MOMENTUM_SUBFAMILY_ID,
    hypothesisCount: EXPECTED_MOMENTUM_DISCOVERY_HYPOTHESIS_COUNT,
    direction: MOMENTUM_DIRECTION,
    lookbackWindowsMs: [...BACKWARD_WINDOWS_MS],
    thresholdsCents: [...RETURN_THRESHOLDS_CENTS],
    responseHorizonsMs: [...FORWARD_HORIZONS_MS],
  };
  assertFamilyUniverseMatchesContract(binding);

  // Neighboring 12-cell universes with the same count but different IDs fail closed.
  const familyHypotheses = report.searchUniverse.hypotheses;
  for (const cell of familyHypotheses) {
    if (cell.directionConvention !== MOMENTUM_DIRECTION) {
      throw new MomentumEvidenceContractError(
        `Canonical hypothesis direction must be ${MOMENTUM_DIRECTION}`,
      );
    }
    if (!cell.hypothesisId.endsWith(`|${MOMENTUM_DIRECTION}`)) {
      throw new MomentumEvidenceContractError(
        `Canonical hypothesis ID must use M14.0a continuation suffix: ${cell.hypothesisId}`,
      );
    }
    if (cell.hypothesisId.startsWith("mom-w")) {
      throw new MomentumEvidenceContractError(
        `Prep synthetic IDs are forbidden; got ${cell.hypothesisId}`,
      );
    }
  }

  if (
    input?.expectedIdentity
    && input.expectedIdentity !== binding.familyDefinitionIdentity
  ) {
    throw new MomentumEvidenceContractError(
      `M14.0a identity mismatch: expected ${input.expectedIdentity}, `
        + `got ${binding.familyDefinitionIdentity}`,
    );
  }

  return binding;
}
