/**
 * M16.2 preflight checks — structured ok/blockers, no secrets printed.
 */
import {
  assertM16SeriesFeeMatchesAttestation,
  M16_KXBTC15M_FEE_ATTESTATION,
} from "./m16AuthoritativeFeeContract";
import {
  M16_1_PRIOR_COHORT_PLAN_IDENTITY,
  M16_1_PRIOR_DEPENDENCE_PLAN_IDENTITY,
  M16_1_PRIOR_EVIDENCE_CONTRACT_IDENTITY,
  M16_1A_PRIOR_COHORT_PLAN_IDENTITY,
  M16_1A_PRIOR_SCIENTIFIC_PROTOCOL_IDENTITY,
} from "./m16PriorContractIdentities";
import {
  buildM16ProspectiveCohortPlan,
  decideM16BlindCollectionStopping,
} from "./m16ProspectiveCohortPlan";
import {
  assertM16ValidationAuthorityMatchesSealed,
  buildM16ScientificProtocolIdentity,
  buildM16ValidationAuthorityBinding,
} from "./m16ValidationAuthority";
import type {
  M16ValidationAuthorityBinding,
  M16ValidationProgress,
  M16ValidationRegistry,
} from "./m16ValidationCohortTypes";
import { computeM16ValidationProgress } from "./m16ValidationRegistry";

/** Default minimum free disk for a 4h TOB capture campaign day. */
export const M16_VALIDATION_MIN_FREE_DISK_BYTES = 20 * 1024 * 1024 * 1024;

export type M16ValidationPreflightInput = {
  registry: M16ValidationRegistry;
  plannedUtcDay: string;
  /** Observed series fee metadata (injectable). */
  observeSeriesFee?: () => { feeType: string; feeMultiplier: number };
  /** Free disk bytes check (injectable). */
  getFreeDiskBytes?: () => number;
  /** Credentials present without printing values (injectable). */
  credentialsPresent?: () => boolean;
  /** Expected scientific protocol identity; defaults to current sealed. */
  expectedScientificProtocolIdentity?: string;
  minFreeDiskBytes?: number;
  authority?: M16ValidationAuthorityBinding;
};

export type M16ValidationPreflightResult = {
  ok: boolean;
  blockers: readonly string[];
  warnings: readonly string[];
  plannedUtcDay: string;
  progress: M16ValidationProgress;
  scientificProtocolIdentity: string;
  feeAttestationOk: boolean;
  outcomesOpened: false;
};

export function runM16ValidationPreflight(
  input: M16ValidationPreflightInput,
): M16ValidationPreflightResult {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const authority = input.authority ?? buildM16ValidationAuthorityBinding(null);
  const scientificProtocolIdentity =
    input.expectedScientificProtocolIdentity
    ?? buildM16ScientificProtocolIdentity();

  try {
    assertM16ValidationAuthorityMatchesSealed(authority);
  } catch (error) {
    blockers.push(
      error instanceof Error ? error.message : "authority seal mismatch",
    );
  }

  if (authority.scientificProtocolIdentity !== scientificProtocolIdentity) {
    blockers.push(
      `scientificProtocolIdentity incompatible: `
        + `expected ${scientificProtocolIdentity}, `
        + `got ${authority.scientificProtocolIdentity}`,
    );
  }

  // Reject superseded M16.1 identities if somehow bound.
  if (authority.evidenceContractIdentity === M16_1_PRIOR_EVIDENCE_CONTRACT_IDENTITY) {
    blockers.push("old M16.1 evidence contract rejected (superseded by M16.1a)");
  }
  if (authority.dependencePlanIdentity === M16_1_PRIOR_DEPENDENCE_PLAN_IDENTITY) {
    blockers.push("old M16.1 dependence plan rejected (superseded by M16.1a)");
  }
  if (authority.cohortPlanIdentity === M16_1_PRIOR_COHORT_PLAN_IDENTITY) {
    blockers.push("old M16.1 cohort plan rejected (superseded by M16.1a)");
  }
  if (authority.cohortPlanIdentity === M16_1A_PRIOR_COHORT_PLAN_IDENTITY) {
    blockers.push(
      "old M16.1a 14:00–18:00Z cohort plan rejected (superseded by M16.1b)",
    );
  }
  if (
    authority.scientificProtocolIdentity
    === M16_1A_PRIOR_SCIENTIFIC_PROTOCOL_IDENTITY
  ) {
    blockers.push(
      "old 14:00–18:00Z scientific protocol rejected (superseded by M16.1b)",
    );
  }

  let feeAttestationOk = false;
  const observe =
    input.observeSeriesFee
    ?? (() => ({
      feeType: M16_KXBTC15M_FEE_ATTESTATION.feeType,
      feeMultiplier: M16_KXBTC15M_FEE_ATTESTATION.feeMultiplier,
    }));
  try {
    const observed = observe();
    assertM16SeriesFeeMatchesAttestation(observed);
    feeAttestationOk = true;
  } catch (error) {
    feeAttestationOk = false;
    blockers.push(
      error instanceof Error
        ? `fee attestation failed: ${error.message}`
        : "fee attestation failed",
    );
  }

  const progress = computeM16ValidationProgress(input.registry);
  if (progress.disposition !== "continue-collection") {
    blockers.push(
      `stopping already terminal: ${progress.disposition} — READY disables further launches`,
    );
  }

  const hasAcceptedForDay = input.registry.accepted.some(
    (s) => s.plannedUtcDay === input.plannedUtcDay,
  );
  if (hasAcceptedForDay) {
    blockers.push(
      `UTC day ${input.plannedUtcDay} already has an accepted segment`,
    );
  }

  const minFree = input.minFreeDiskBytes ?? M16_VALIDATION_MIN_FREE_DISK_BYTES;
  if (input.getFreeDiskBytes) {
    const free = input.getFreeDiskBytes();
    if (!Number.isFinite(free) || free < minFree) {
      blockers.push(
        `insufficient free disk: have ${free} bytes, need >= ${minFree}`,
      );
    }
  } else {
    warnings.push("disk free-bytes check skipped (no getFreeDiskBytes injected)");
  }

  if (input.credentialsPresent) {
    if (!input.credentialsPresent()) {
      blockers.push("credentials missing (values not logged)");
    }
  } else {
    warnings.push("credentials check skipped (no credentialsPresent injected)");
  }

  // Cross-check sealed stopping thresholds still match plan.
  const plan = buildM16ProspectiveCohortPlan();
  const stopCheck = decideM16BlindCollectionStopping({
    acceptedCaptureHours: progress.acceptedHours,
    eligibleTradeCount: progress.eligibleTradeCount,
    utcDayClusterCount: progress.distinctEligibleUtcDayClusters,
    acceptedCaptureRunIds: input.registry.accepted.map((s) => s.runId),
  }, plan);
  if (stopCheck.disposition !== progress.disposition) {
    blockers.push("progress disposition inconsistent with sealed stopping rule");
  }

  return {
    ok: blockers.length === 0,
    blockers,
    warnings,
    plannedUtcDay: input.plannedUtcDay,
    progress,
    scientificProtocolIdentity,
    feeAttestationOk,
    outcomesOpened: false,
  };
}
