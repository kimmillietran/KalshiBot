import { createHash } from "node:crypto";

import { stableStringify } from "@/lib/trading/config/hashConfig";

import { buildM16FamilyDefinition } from "./buildM16FamilyDefinition";
import {
  M16_CONFIRMATORY_EVIDENCE_CONTRACT_STATUS,
  M16_DEPENDENCE_INFERENCE_PLAN_STATUS,
  M16_ECONOMIC_OUTCOME_OPEN_AUTHORIZED,
  M16_FORBIDDEN_INCIDENCE_FIELD_PATTERNS,
  M16_INCIDENCE_PLAN_VERSION,
  M16_SUBFAMILY_ID,
} from "./m16Types";

export type M16IncidencePlan = {
  planVersion: typeof M16_INCIDENCE_PLAN_VERSION;
  subfamilyId: typeof M16_SUBFAMILY_ID;
  familyDefinitionIdentity: string;
  feeContractIdentity: string;
  mode: "pnl-blind-incidence-coverage-census";
  milestoneScope: "m16.0-blind-incidence-characterization-only";
  allowedCensusFields: readonly string[];
  forbiddenEconomicFieldPatterns: readonly string[];
  selectedCaptureRole: "m16-blind-incidence";
  dispositionRule:
    "incidence-characterized-iff-positive-time-gate-eligible-rate-observed";
  confirmatoryEvidenceContractStatus: typeof M16_CONFIRMATORY_EVIDENCE_CONTRACT_STATUS;
  dependenceInferencePlanStatus: typeof M16_DEPENDENCE_INFERENCE_PLAN_STATUS;
  economicOutcomeOpenAuthorized: typeof M16_ECONOMIC_OUTCOME_OPEN_AUTHORIZED;
  outcomesOpened: false;
  economicExitsInspected: false;
  incidencePlanIdentity: string;
};

export function buildM16IncidencePlan(): M16IncidencePlan {
  const family = buildM16FamilyDefinition();
  const plan: Omit<M16IncidencePlan, "incidencePlanIdentity"> = {
    planVersion: M16_INCIDENCE_PLAN_VERSION,
    subfamilyId: M16_SUBFAMILY_ID,
    familyDefinitionIdentity: family.familyDefinitionIdentity,
    feeContractIdentity: family.feeContract.feeContractIdentity,
    mode: "pnl-blind-incidence-coverage-census",
    milestoneScope: "m16.0-blind-incidence-characterization-only",
    allowedCensusFields: [
      "captureRunIds",
      "captureHours",
      "marketsObserved",
      "prehistoryCompleteMarkets",
      "leftTruncatedSideEventCount",
      "downCrossSetupSideEventCount",
      "preConfirmationWaterfallAbortSideEventCount",
      "reversalConfirmedEntryCount",
      "timeGateEligibleCount",
      "structurallyCompletePostEntryPathCount",
      "terminalCoverageCount",
      "settlementCoverableCount",
      "descriptiveCaptureSessionCount",
      "descriptiveUtcDayCount",
      "incidencePerHour",
      "incidenceDisposition",
      "missingnessReasons",
    ],
    forbiddenEconomicFieldPatterns: M16_FORBIDDEN_INCIDENCE_FIELD_PATTERNS.map(
      (re) => re.source,
    ),
    selectedCaptureRole: "m16-blind-incidence",
    dispositionRule:
      "incidence-characterized-iff-positive-time-gate-eligible-rate-observed",
    confirmatoryEvidenceContractStatus: M16_CONFIRMATORY_EVIDENCE_CONTRACT_STATUS,
    dependenceInferencePlanStatus: M16_DEPENDENCE_INFERENCE_PLAN_STATUS,
    economicOutcomeOpenAuthorized: M16_ECONOMIC_OUTCOME_OPEN_AUTHORIZED,
    outcomesOpened: false,
    economicExitsInspected: false,
  };

  const incidencePlanIdentity = createHash("sha256")
    .update(stableStringify(plan))
    .digest("hex");

  return { ...plan, incidencePlanIdentity };
}
