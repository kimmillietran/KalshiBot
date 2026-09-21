/**
 * M16.2 authority binding — seals M16.0/M16.1a identities into collection protocol.
 */
import { createHash } from "node:crypto";

import { stableStringify } from "@/lib/trading/config/hashConfig";

import { buildM16AuthoritativeFeeContract } from "./m16AuthoritativeFeeContract";
import { buildM16FamilyDefinition } from "./buildM16FamilyDefinition";
import { M16_CR2_INFERENCE_METHOD } from "./m16Cr2ClusterMean";
import { buildM16DependencePlan } from "./m16DependencePlan";
import { buildM16EvidenceContract } from "./m16EvidenceContract";
import {
  buildM16ProspectiveCohortPlan,
  M16_FIXED_UTC_WINDOW,
  M16_FIXED_UTC_WINDOW_END_HHMM,
  M16_FIXED_UTC_WINDOW_START_HHMM,
  M16_MAX_ACCEPTED_CAPTURE_HOURS,
  M16_STANDARD_SEGMENT_DURATION_MINUTES,
} from "./m16ProspectiveCohortPlan";
import {
  M16_VALIDATION_PROTOCOL_VERSION,
  M16ValidationCollectionError,
  type M16ValidationAuthorityBinding,
} from "./m16ValidationCohortTypes";

export const M16_EXPECTED_FAMILY_DEFINITION_IDENTITY =
  "e98e6180b1edc468d544cbc41a624b8201535b2e9e58121d7669079fcf5cbce0" as const;
export const M16_EXPECTED_EVIDENCE_CONTRACT_IDENTITY =
  "2a06820dab24aea4a253d886460bfc1267d7bd438d0bce817cbb999fd934beb7" as const;
export const M16_EXPECTED_DEPENDENCE_PLAN_IDENTITY =
  "df947284e5ee7678280dafd6ba5c4456281ca894b10b793a5a05f584d7d2630d" as const;
export const M16_EXPECTED_FEE_CONTRACT_IDENTITY =
  "86f5f152308096fb365bb4ef41dca8beb488a302f038a915c8b228c0b645b44d" as const;
export const M16_EXPECTED_COHORT_PLAN_IDENTITY =
  "294aa283c8b99269e7c5fd36282b826ffc6a601ee9d1b7b88af62b8bfc2e71f8" as const;
export const M16_EXPECTED_CODE_AUTHORITY_SHA =
  "94a3bcfb628c30938127216f7ac9a24a9318a656" as const;

/**
 * Scientific protocol identity — hashes the sealed scientific surface only.
 * Does NOT include codeAuthoritySha / git SHAs (those are recorded per run).
 */
export function buildM16ScientificProtocolIdentity(input?: {
  familyDefinitionIdentity?: string;
  evidenceContractIdentity?: string;
  dependencePlanIdentity?: string;
  feeContractIdentity?: string;
  cohortPlanIdentity?: string;
}): string {
  const family = buildM16FamilyDefinition();
  const evidence = buildM16EvidenceContract();
  const dependence = buildM16DependencePlan();
  const fee = buildM16AuthoritativeFeeContract();
  const cohort = buildM16ProspectiveCohortPlan();

  return createHash("sha256")
    .update(
      stableStringify({
        protocolVersion: M16_VALIDATION_PROTOCOL_VERSION,
        familyDefinitionIdentity:
          input?.familyDefinitionIdentity ?? family.familyDefinitionIdentity,
        evidenceContractIdentity:
          input?.evidenceContractIdentity ?? evidence.evidenceContractIdentity,
        dependencePlanIdentity:
          input?.dependencePlanIdentity ?? dependence.dependencePlanIdentity,
        feeContractIdentity:
          input?.feeContractIdentity ?? fee.feeContractIdentity,
        cohortPlanIdentity:
          input?.cohortPlanIdentity ?? cohort.cohortPlanIdentity,
        fixedUtcWindow: M16_FIXED_UTC_WINDOW,
        fixedUtcWindowStartHhmm: M16_FIXED_UTC_WINDOW_START_HHMM,
        fixedUtcWindowEndHhmm: M16_FIXED_UTC_WINDOW_END_HHMM,
        standardSegmentDurationMinutes: M16_STANDARD_SEGMENT_DURATION_MINUTES,
        requiredTradeN: evidence.collectionTargets.requiredTradeN,
        minimumUtcDayClusters: evidence.collectionTargets.minimumUtcDayClusters,
        maxAcceptedCaptureHours: M16_MAX_ACCEPTED_CAPTURE_HOURS,
        primaryInferenceMethod: M16_CR2_INFERENCE_METHOD,
      }),
    )
    .digest("hex");
}

export function buildM16ValidationAuthorityBinding(
  codeAuthoritySha: string | null = null,
): M16ValidationAuthorityBinding {
  const family = buildM16FamilyDefinition();
  const evidence = buildM16EvidenceContract();
  const dependence = buildM16DependencePlan();
  const fee = buildM16AuthoritativeFeeContract();
  const cohort = buildM16ProspectiveCohortPlan();
  const scientificProtocolIdentity = buildM16ScientificProtocolIdentity({
    familyDefinitionIdentity: family.familyDefinitionIdentity,
    evidenceContractIdentity: evidence.evidenceContractIdentity,
    dependencePlanIdentity: dependence.dependencePlanIdentity,
    feeContractIdentity: fee.feeContractIdentity,
    cohortPlanIdentity: cohort.cohortPlanIdentity,
  });
  return {
    protocolVersion: M16_VALIDATION_PROTOCOL_VERSION,
    familyDefinitionIdentity: family.familyDefinitionIdentity,
    evidenceContractIdentity: evidence.evidenceContractIdentity,
    dependencePlanIdentity: dependence.dependencePlanIdentity,
    feeContractIdentity: fee.feeContractIdentity,
    cohortPlanIdentity: cohort.cohortPlanIdentity,
    scientificProtocolIdentity,
    codeAuthoritySha,
  };
}

export function hashM16ValidationArtifact(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

/**
 * Compare sealed scientific identities. codeAuthoritySha is recorded separately
 * and intentionally ignored here so unrelated SHA drift does not block collection
 * when the scientific protocol is unchanged.
 */
export function assertM16ValidationAuthorityMatches(
  expected: M16ValidationAuthorityBinding,
  observed: M16ValidationAuthorityBinding,
): void {
  const keys: (keyof M16ValidationAuthorityBinding)[] = [
    "protocolVersion",
    "familyDefinitionIdentity",
    "evidenceContractIdentity",
    "dependencePlanIdentity",
    "feeContractIdentity",
    "cohortPlanIdentity",
    "scientificProtocolIdentity",
  ];
  for (const key of keys) {
    if (expected[key] !== observed[key]) {
      throw new M16ValidationCollectionError(
        `M16.2 authority mismatch on ${key}: expected ${String(expected[key])}, `
          + `got ${String(observed[key])}`,
      );
    }
  }
}

export function assertM16ValidationAuthorityMatchesSealed(
  observed: M16ValidationAuthorityBinding,
): void {
  const expected = buildM16ValidationAuthorityBinding(null);
  assertM16ValidationAuthorityMatches(
    { ...expected, codeAuthoritySha: null },
    { ...observed, codeAuthoritySha: null },
  );
  if (observed.familyDefinitionIdentity !== M16_EXPECTED_FAMILY_DEFINITION_IDENTITY) {
    throw new M16ValidationCollectionError(
      `family identity != sealed ${M16_EXPECTED_FAMILY_DEFINITION_IDENTITY}`,
    );
  }
  if (observed.evidenceContractIdentity !== M16_EXPECTED_EVIDENCE_CONTRACT_IDENTITY) {
    throw new M16ValidationCollectionError(
      `evidence identity != sealed ${M16_EXPECTED_EVIDENCE_CONTRACT_IDENTITY}`,
    );
  }
  if (observed.dependencePlanIdentity !== M16_EXPECTED_DEPENDENCE_PLAN_IDENTITY) {
    throw new M16ValidationCollectionError(
      `dependence identity != sealed ${M16_EXPECTED_DEPENDENCE_PLAN_IDENTITY}`,
    );
  }
  if (observed.feeContractIdentity !== M16_EXPECTED_FEE_CONTRACT_IDENTITY) {
    throw new M16ValidationCollectionError(
      `fee identity != sealed ${M16_EXPECTED_FEE_CONTRACT_IDENTITY}`,
    );
  }
  if (observed.cohortPlanIdentity !== M16_EXPECTED_COHORT_PLAN_IDENTITY) {
    throw new M16ValidationCollectionError(
      `cohort identity != sealed ${M16_EXPECTED_COHORT_PLAN_IDENTITY}`,
    );
  }
}
