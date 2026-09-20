import { createHash } from "node:crypto";

import { stableStringify } from "@/lib/trading/config/hashConfig";

import { buildM16FamilyDefinition } from "./buildM16FamilyDefinition";
import {
  M16_FORBIDDEN_INCIDENCE_FIELD_PATTERNS,
  M16_INCIDENCE_PLAN_VERSION,
  M16_MAX_FUTURE_CAPTURE_BUDGET_HOURS,
  M16_PLANNING_MEAN_EFFECTS_CENTS,
  M16_PLANNING_SD_SCENARIOS_CENTS,
  M16_PRIMARY_PLANNING_MEAN_EFFECT_CENTS,
  M16_PRIMARY_PLANNING_SD_CENTS,
  M16_SUBFAMILY_ID,
  M16_TARGET_INDEPENDENT_TRADE_N,
} from "./m16Types";
import { buildM16SampleSizePlan } from "./m16SampleSizePlanning";

export type M16IncidencePlan = {
  planVersion: typeof M16_INCIDENCE_PLAN_VERSION;
  subfamilyId: typeof M16_SUBFAMILY_ID;
  familyDefinitionIdentity: string;
  feeContractIdentity: string;
  mode: "pnl-blind-incidence-coverage-census";
  allowedCensusFields: readonly string[];
  forbiddenEconomicFieldPatterns: readonly string[];
  selectedCaptureRole: "m16-blind-incidence";
  maxFutureCaptureBudgetHours: typeof M16_MAX_FUTURE_CAPTURE_BUDGET_HOURS;
  sampleSizePlanning: ReturnType<typeof buildM16SampleSizePlan>;
  feasibilityRule:
    "incidence-feasible-iff-projected-hours-to-target-N-leq-max-budget";
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
    allowedCensusFields: [
      "captureRunIds",
      "captureHours",
      "marketsObserved",
      "prehistoryCompleteMarkets",
      "leftTruncatedCount",
      "downCrossSetupCount",
      "preConfirmationWaterfallAbortCount",
      "reversalConfirmedEntryCount",
      "timeGateEligibleCount",
      "structurallyCompletePostEntryPathCount",
      "terminalCoverageCount",
      "settlementCoverableCount",
      "clusterCount",
      "incidencePerHour",
      "projectedCaptureHoursForTargetN",
      "feasibilityDisposition",
      "missingnessReasons",
    ],
    forbiddenEconomicFieldPatterns: M16_FORBIDDEN_INCIDENCE_FIELD_PATTERNS.map(
      (re) => re.source,
    ),
    selectedCaptureRole: "m16-blind-incidence",
    maxFutureCaptureBudgetHours: M16_MAX_FUTURE_CAPTURE_BUDGET_HOURS,
    sampleSizePlanning: buildM16SampleSizePlan({
      planningMeanEffectsCents: M16_PLANNING_MEAN_EFFECTS_CENTS,
      planningSdScenariosCents: M16_PLANNING_SD_SCENARIOS_CENTS,
      primaryMeanEffectCents: M16_PRIMARY_PLANNING_MEAN_EFFECT_CENTS,
      primarySdCents: M16_PRIMARY_PLANNING_SD_CENTS,
      targetIndependentTradeN: M16_TARGET_INDEPENDENT_TRADE_N,
    }),
    feasibilityRule:
      "incidence-feasible-iff-projected-hours-to-target-N-leq-max-budget",
    outcomesOpened: false,
    economicExitsInspected: false,
  };

  const incidencePlanIdentity = createHash("sha256")
    .update(stableStringify(plan))
    .digest("hex");

  return { ...plan, incidencePlanIdentity };
}
