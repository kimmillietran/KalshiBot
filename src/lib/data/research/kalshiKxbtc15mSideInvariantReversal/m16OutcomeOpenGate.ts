/**
 * M16.1a economic outcome-open governance gate.
 * Never computes P&L — only structural/governance authorization.
 * Old M16.1 identities alone MUST NOT authorize.
 */
import { buildM16FamilyDefinition } from "./buildM16FamilyDefinition";
import { buildM16AuthoritativeFeeContract } from "./m16AuthoritativeFeeContract";
import { M16_CR2_INFERENCE_METHOD } from "./m16Cr2ClusterMean";
import { buildM16DependencePlan } from "./m16DependencePlan";
import { buildM16EvidenceContract } from "./m16EvidenceContract";
import {
  M16_1_PRIOR_COHORT_PLAN_IDENTITY,
  M16_1_PRIOR_DEPENDENCE_PLAN_IDENTITY,
  M16_1_PRIOR_EVIDENCE_CONTRACT_IDENTITY,
  M16_AUTHORITATIVE_FEE_CONTRACT_IDENTITY,
  M16_FAMILY_DEFINITION_IDENTITY,
} from "./m16PriorContractIdentities";
import {
  buildM16ProspectiveCohortPlan,
  decideM16BlindCollectionStopping,
  M16_FORBIDDEN_INCIDENCE_RUN_IDS,
  M16_VALIDATION_ROLE,
  type M16BlindCollectionProgress,
} from "./m16ProspectiveCohortPlan";
import {
  M16_FORBIDDEN_M14_EXCLUDED_RUN_ID,
  M16_FORBIDDEN_M14_VALIDATION_RUN_IDS,
  M16_FORBIDDEN_M15_COST_FLOOR_RUN_ID,
  M16_SUBFAMILY_ID,
  M16ReversalError,
} from "./m16Types";

export const M16_OUTCOME_OPEN_BLOCKERS = {
  FAMILY_IDENTITY_MISMATCH: "m16-family-definition-identity-mismatch",
  EVIDENCE_IDENTITY_MISMATCH: "m16-evidence-contract-identity-mismatch",
  DEPENDENCE_IDENTITY_MISMATCH: "m16-dependence-plan-identity-mismatch",
  FEE_IDENTITY_MISMATCH: "m16-fee-contract-identity-mismatch",
  COHORT_IDENTITY_MISMATCH: "m16-cohort-plan-identity-mismatch",
  SUPERSEDED_EVIDENCE_IDENTITY: "m16-1-evidence-contract-superseded-by-m16-1a",
  SUPERSEDED_DEPENDENCE_IDENTITY: "m16-1-dependence-plan-superseded-by-m16-1a",
  SUPERSEDED_COHORT_IDENTITY: "m16-1-cohort-plan-superseded-by-m16-1a",
  FEE_SCHEDULE_DIVERGED: "m16-series-fee-attestation-diverged",
  REGISTRY_EMPTY: "m16-accepted-capture-registry-empty",
  TRADE_N_SHORT: "m16-validation-trade-n-below-target",
  CLUSTER_N_SHORT: "m16-validation-utc-day-clusters-below-minimum",
  CONTAMINATION: "m16-confirmatory-cohort-contamination",
  PNL_ALREADY_OPENED: "m16-pnl-previously-opened",
  STOPPING_NOT_READY: "m16-blind-stopping-not-ready-for-outcome-open",
  OLD_N155_THRESHOLD: "m16-old-n155-threshold-does-not-authorize",
} as const;

export type M16OutcomeOpenEvaluationInput = {
  expectedFamilyDefinitionIdentity?: string;
  expectedEvidenceContractIdentity?: string;
  expectedDependencePlanIdentity?: string;
  expectedFeeContractIdentity?: string;
  expectedCohortPlanIdentity?: string;
  observedSeriesFee?: { feeType: string; feeMultiplier: number };
  progress?: M16BlindCollectionProgress;
  pnlPreviouslyOpened?: boolean;
  researchRolesByRunId?: Readonly<Record<string, string>>;
};

export type M16OutcomeOpenAuthorization = {
  authorized: boolean;
  economicOutcomeOpenAuthorized: boolean;
  subfamilyId: typeof M16_SUBFAMILY_ID;
  primaryInferenceMethod: typeof M16_CR2_INFERENCE_METHOD;
  sealedIdentities: {
    familyDefinitionIdentity: string;
    evidenceContractIdentity: string;
    dependencePlanIdentity: string;
    feeContractIdentity: string;
    cohortPlanIdentity: string;
  };
  progress: M16BlindCollectionProgress;
  blockers: readonly string[];
  note: string;
};

const EMPTY_PROGRESS: M16BlindCollectionProgress = {
  acceptedCaptureHours: 0,
  eligibleTradeCount: 0,
  utcDayClusterCount: 0,
  acceptedCaptureRunIds: [],
};

function detectContamination(
  runIds: readonly string[],
  researchRolesByRunId?: Readonly<Record<string, string>>,
): string | null {
  const forbidden = new Set<string>([
    ...M16_FORBIDDEN_INCIDENCE_RUN_IDS,
    ...M16_FORBIDDEN_M14_VALIDATION_RUN_IDS,
    M16_FORBIDDEN_M14_EXCLUDED_RUN_ID,
    M16_FORBIDDEN_M15_COST_FLOOR_RUN_ID,
  ]);
  for (const runId of runIds) {
    if (forbidden.has(runId)) {
      return `forbidden runId ${runId}`;
    }
    const role = researchRolesByRunId?.[runId];
    if (role != null && role !== M16_VALIDATION_ROLE) {
      return `runId ${runId} has role=${role}; required ${M16_VALIDATION_ROLE}`;
    }
  }
  return null;
}

export function evaluateM16OutcomeOpenAuthorization(
  input: M16OutcomeOpenEvaluationInput = {},
): M16OutcomeOpenAuthorization {
  const family = buildM16FamilyDefinition();
  const evidence = buildM16EvidenceContract();
  const dependence = buildM16DependencePlan();
  const fee = buildM16AuthoritativeFeeContract();
  const cohort = buildM16ProspectiveCohortPlan();
  const progress = input.progress ?? EMPTY_PROGRESS;
  const blockers: string[] = [];

  if (family.familyDefinitionIdentity !== M16_FAMILY_DEFINITION_IDENTITY) {
    blockers.push(M16_OUTCOME_OPEN_BLOCKERS.FAMILY_IDENTITY_MISMATCH);
  }
  if (fee.feeContractIdentity !== M16_AUTHORITATIVE_FEE_CONTRACT_IDENTITY) {
    blockers.push(M16_OUTCOME_OPEN_BLOCKERS.FEE_IDENTITY_MISMATCH);
  }

  if (
    input.expectedFamilyDefinitionIdentity != null
    && input.expectedFamilyDefinitionIdentity !== family.familyDefinitionIdentity
  ) {
    blockers.push(M16_OUTCOME_OPEN_BLOCKERS.FAMILY_IDENTITY_MISMATCH);
  }
  if (
    input.expectedEvidenceContractIdentity
    === M16_1_PRIOR_EVIDENCE_CONTRACT_IDENTITY
  ) {
    blockers.push(M16_OUTCOME_OPEN_BLOCKERS.SUPERSEDED_EVIDENCE_IDENTITY);
  } else if (
    input.expectedEvidenceContractIdentity != null
    && input.expectedEvidenceContractIdentity !== evidence.evidenceContractIdentity
  ) {
    blockers.push(M16_OUTCOME_OPEN_BLOCKERS.EVIDENCE_IDENTITY_MISMATCH);
  }
  if (
    input.expectedDependencePlanIdentity
    === M16_1_PRIOR_DEPENDENCE_PLAN_IDENTITY
  ) {
    blockers.push(M16_OUTCOME_OPEN_BLOCKERS.SUPERSEDED_DEPENDENCE_IDENTITY);
  } else if (
    input.expectedDependencePlanIdentity != null
    && input.expectedDependencePlanIdentity !== dependence.dependencePlanIdentity
  ) {
    blockers.push(M16_OUTCOME_OPEN_BLOCKERS.DEPENDENCE_IDENTITY_MISMATCH);
  }
  if (
    input.expectedFeeContractIdentity != null
    && input.expectedFeeContractIdentity !== fee.feeContractIdentity
  ) {
    blockers.push(M16_OUTCOME_OPEN_BLOCKERS.FEE_IDENTITY_MISMATCH);
  }
  if (
    input.expectedCohortPlanIdentity === M16_1_PRIOR_COHORT_PLAN_IDENTITY
  ) {
    blockers.push(M16_OUTCOME_OPEN_BLOCKERS.SUPERSEDED_COHORT_IDENTITY);
  } else if (
    input.expectedCohortPlanIdentity != null
    && input.expectedCohortPlanIdentity !== cohort.cohortPlanIdentity
  ) {
    blockers.push(M16_OUTCOME_OPEN_BLOCKERS.COHORT_IDENTITY_MISMATCH);
  }

  if (input.observedSeriesFee != null) {
    if (
      input.observedSeriesFee.feeType !== fee.attestation.feeType
      || input.observedSeriesFee.feeMultiplier !== fee.attestation.feeMultiplier
    ) {
      blockers.push(M16_OUTCOME_OPEN_BLOCKERS.FEE_SCHEDULE_DIVERGED);
    }
  }

  if (input.pnlPreviouslyOpened === true) {
    blockers.push(M16_OUTCOME_OPEN_BLOCKERS.PNL_ALREADY_OPENED);
  }

  if (progress.acceptedCaptureRunIds.length === 0) {
    blockers.push(M16_OUTCOME_OPEN_BLOCKERS.REGISTRY_EMPTY);
  }

  const contamination = detectContamination(
    progress.acceptedCaptureRunIds,
    input.researchRolesByRunId,
  );
  if (contamination != null) {
    blockers.push(M16_OUTCOME_OPEN_BLOCKERS.CONTAMINATION);
  }

  // Old N=155 alone never authorizes under M16.1a
  if (
    progress.eligibleTradeCount >= 155
    && progress.eligibleTradeCount < cohort.evidenceThresholds.requiredTradeN
    && progress.utcDayClusterCount >= cohort.evidenceThresholds.minimumUtcDayClusters
  ) {
    blockers.push(M16_OUTCOME_OPEN_BLOCKERS.OLD_N155_THRESHOLD);
  }

  if (progress.eligibleTradeCount < cohort.evidenceThresholds.requiredTradeN) {
    blockers.push(M16_OUTCOME_OPEN_BLOCKERS.TRADE_N_SHORT);
  }
  if (
    progress.utcDayClusterCount < cohort.evidenceThresholds.minimumUtcDayClusters
  ) {
    blockers.push(M16_OUTCOME_OPEN_BLOCKERS.CLUSTER_N_SHORT);
  }

  const stopping = decideM16BlindCollectionStopping(progress, cohort);
  if (stopping.disposition !== "ready-for-outcome-open") {
    blockers.push(M16_OUTCOME_OPEN_BLOCKERS.STOPPING_NOT_READY);
  }

  const uniqueBlockers = [...new Set(blockers)];
  const authorized = uniqueBlockers.length === 0;

  return {
    authorized,
    economicOutcomeOpenAuthorized: authorized,
    subfamilyId: M16_SUBFAMILY_ID,
    primaryInferenceMethod: M16_CR2_INFERENCE_METHOD,
    sealedIdentities: {
      familyDefinitionIdentity: family.familyDefinitionIdentity,
      evidenceContractIdentity: evidence.evidenceContractIdentity,
      dependencePlanIdentity: dependence.dependencePlanIdentity,
      feeContractIdentity: fee.feeContractIdentity,
      cohortPlanIdentity: cohort.cohortPlanIdentity,
    },
    progress,
    blockers: uniqueBlockers,
    note: authorized
      ? "All sealed M16.1a governance criteria satisfied for outcome-open."
      : "Economic outcome-open blocked. M16.1a contracts required; old M16.1 "
        + "identities / N=155 threshold do not authorize. Blockers: "
        + uniqueBlockers.join(", "),
  };
}

export function assertM16EconomicOutcomeOpenUnauthorized(
  input?: M16OutcomeOpenEvaluationInput,
): void {
  const auth = evaluateM16OutcomeOpenAuthorization(input);
  if (auth.authorized || auth.economicOutcomeOpenAuthorized) {
    throw new M16ReversalError(
      "M16 outcome-open unexpectedly authorized; refusing silent open",
    );
  }
}

export function assertM16ConfirmatoryCaptureAllowed(runId: string): void {
  const forbidden = new Set<string>([
    ...M16_FORBIDDEN_INCIDENCE_RUN_IDS,
    ...M16_FORBIDDEN_M14_VALIDATION_RUN_IDS,
    M16_FORBIDDEN_M14_EXCLUDED_RUN_ID,
    M16_FORBIDDEN_M15_COST_FLOOR_RUN_ID,
  ]);
  if (forbidden.has(runId)) {
    throw new M16ReversalError(
      `confirmatory cohort rejects forbidden capture runId=${runId}`,
    );
  }
  if (runId.includes("latest")) {
    throw new M16ReversalError(`mutable latest path forbidden: ${runId}`);
  }
}
