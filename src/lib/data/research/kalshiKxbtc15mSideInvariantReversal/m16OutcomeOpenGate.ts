/**
 * M16.0 fail-closed economic outcome-open gate.
 * Does NOT implement P&L evaluation — only authorization checks.
 */
import {
  M16_CONFIRMATORY_EVIDENCE_CONTRACT_STATUS,
  M16_DEPENDENCE_INFERENCE_PLAN_STATUS,
  M16_ECONOMIC_OUTCOME_OPEN_AUTHORIZED,
  M16_OUTCOME_OPEN_BLOCKER_COHORT_UNSEALED,
  M16_OUTCOME_OPEN_BLOCKER_DEPENDENCE_PLAN,
  M16_OUTCOME_OPEN_BLOCKER_EVIDENCE_CONTRACT,
  M16_OUTCOME_OPEN_BLOCKER_FEE_UNRESOLVED,
  M16_SUBFAMILY_ID,
  bindM16FeeContract,
  type M16FeeContractStatus,
} from "./m16Types";

export type M16OutcomeOpenAuthorization = {
  authorized: false;
  economicOutcomeOpenAuthorized: typeof M16_ECONOMIC_OUTCOME_OPEN_AUTHORIZED;
  subfamilyId: typeof M16_SUBFAMILY_ID;
  familyIdentityMatches: boolean;
  confirmatoryEvidenceContractStatus: typeof M16_CONFIRMATORY_EVIDENCE_CONTRACT_STATUS;
  dependenceInferencePlanStatus: typeof M16_DEPENDENCE_INFERENCE_PLAN_STATUS;
  feeContractStatus: M16FeeContractStatus;
  prospectiveOutcomeCohortSealed: false;
  pnlPreviouslyOpened: false;
  blockers: readonly [
    typeof M16_OUTCOME_OPEN_BLOCKER_EVIDENCE_CONTRACT,
    typeof M16_OUTCOME_OPEN_BLOCKER_DEPENDENCE_PLAN,
    typeof M16_OUTCOME_OPEN_BLOCKER_FEE_UNRESOLVED,
    typeof M16_OUTCOME_OPEN_BLOCKER_COHORT_UNSEALED,
  ];
  note: string;
};

/**
 * Evaluate whether economic outcome-open is authorized.
 * For M16.0 this always returns authorized=false with the sealed blockers.
 */
export function evaluateM16OutcomeOpenAuthorization(input?: {
  expectedSubfamilyId?: string;
}): M16OutcomeOpenAuthorization {
  const fee = bindM16FeeContract();
  const familyIdentityMatches =
    (input?.expectedSubfamilyId ?? M16_SUBFAMILY_ID) === M16_SUBFAMILY_ID;

  return {
    authorized: false,
    economicOutcomeOpenAuthorized: M16_ECONOMIC_OUTCOME_OPEN_AUTHORIZED,
    subfamilyId: M16_SUBFAMILY_ID,
    familyIdentityMatches,
    confirmatoryEvidenceContractStatus: M16_CONFIRMATORY_EVIDENCE_CONTRACT_STATUS,
    dependenceInferencePlanStatus: M16_DEPENDENCE_INFERENCE_PLAN_STATUS,
    feeContractStatus: fee.feeContractStatus,
    prospectiveOutcomeCohortSealed: false,
    pnlPreviouslyOpened: false,
    blockers: [
      M16_OUTCOME_OPEN_BLOCKER_EVIDENCE_CONTRACT,
      M16_OUTCOME_OPEN_BLOCKER_DEPENDENCE_PLAN,
      M16_OUTCOME_OPEN_BLOCKER_FEE_UNRESOLVED,
      M16_OUTCOME_OPEN_BLOCKER_COHORT_UNSEALED,
    ],
    note:
      "M16.0 seals the family + blind incidence only. M16.1 must seal the "
      + "confirmatory evidence contract, dependence/inference plan, and "
      + "authoritative KXBTC15M fee binding before any economic outcome-open.",
  };
}

export function assertM16EconomicOutcomeOpenUnauthorized(): void {
  const auth = evaluateM16OutcomeOpenAuthorization();
  if (auth.authorized || auth.economicOutcomeOpenAuthorized) {
    throw new Error(
      "M16.0 invariant violated: economic outcome-open must be unauthorized",
    );
  }
}
