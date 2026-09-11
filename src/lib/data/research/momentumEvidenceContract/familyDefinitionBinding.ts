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
 * Narrow adapter for the future authoritative M14.0a family definition.
 * Does not import or edit Agent 1's family-definition module.
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
