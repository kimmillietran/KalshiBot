/**
 * M16.1 prospective validation cohort plan — sealed prospectively.
 * Fresh captures only. Outcome-blind stopping. No capture launch here.
 */
import { createHash } from "node:crypto";

import { stableStringify } from "@/lib/trading/config/hashConfig";

import { buildM16AuthoritativeFeeContract } from "./m16AuthoritativeFeeContract";
import { buildM16DependencePlan } from "./m16DependencePlan";
import { buildM16EvidenceContract } from "./m16EvidenceContract";
import {
  M16_FORBIDDEN_M14_EXCLUDED_RUN_ID,
  M16_FORBIDDEN_M14_VALIDATION_RUN_IDS,
  M16_FORBIDDEN_M15_COST_FLOOR_RUN_ID,
  M16_SUBFAMILY_ID,
} from "./m16Types";

export const M16_COHORT_PLAN_VERSION =
  "kalshi-kxbtc15m-side-invariant-exhaustion-reversal-cohort-plan-v1" as const;

export const M16_VALIDATION_ROLE = "m16-prospective-validation" as const;

/** Standard / max segment duration (minutes) — M14-style 8h. */
export const M16_STANDARD_SEGMENT_DURATION_MINUTES = 480 as const;
export const M16_MAX_SEGMENT_DURATION_MINUTES = 480 as const;

/**
 * Max accepted capture hours. Binding constraint is ≥24 distinct UTC-day
 * clusters at one 8h segment/day ⇒ 192h; seal 200h with operational slack.
 * Blind incidence ~2.06/h ⇒ 155 trades ≈ 75h (not binding vs day floor).
 */
export const M16_MAX_ACCEPTED_CAPTURE_HOURS = 200 as const;

export const M16_BLIND_INCIDENCE_RATE_PER_HOUR = 2.0625339816796635 as const;

/** August M16.0 blind-incidence captures — structurally seen; excluded from P&L. */
export const M16_FORBIDDEN_INCIDENCE_RUN_IDS = [
  "2026-08-03T03-21-26-351Z",
  "2026-08-04T10-33-33-601Z",
] as const;

export type M16ProspectiveCohortPlan = {
  planVersion: typeof M16_COHORT_PLAN_VERSION;
  subfamilyId: typeof M16_SUBFAMILY_ID;
  milestone: "m16.1-prospective-validation-cohort-plan";
  validationRole: typeof M16_VALIDATION_ROLE;
  terminology: {
    thisCohort: "M16 prospective validation";
    ifSupported: "eligible-for-fresh-holdout";
    ifFailed: "stop-lineage";
    holdout: "not-part-of-this-plan-design-separately-later";
    noTrain: true;
  };
  linkedIdentities: {
    evidenceContractIdentity: string;
    dependencePlanIdentity: string;
    feeContractIdentity: string;
  };
  segment: {
    standardDurationMinutes: typeof M16_STANDARD_SEGMENT_DURATION_MINUTES;
    maxDurationMinutes: typeof M16_MAX_SEGMENT_DURATION_MINUTES;
    preferDistinctUtcDays: true;
    note: string;
  };
  budget: {
    maxAcceptedCaptureHours: typeof M16_MAX_ACCEPTED_CAPTURE_HOURS;
    blindIncidenceRatePerHourUsedForPlanning: typeof M16_BLIND_INCIDENCE_RATE_PER_HOUR;
    estimatedHoursForTradeN: number;
    estimatedHoursForUtcDayClusters: number;
    bindingEstimatedHours: number;
  };
  evidenceThresholds: {
    requiredTradeN: number;
    minimumUtcDayClusters: number;
  };
  stopping: {
    mode: "outcome-blind-counts-and-hours-only";
    afterEachCompletedAcceptedCapture: readonly string[];
    failedSegmentsConsumeAcceptedHourBudget: false;
    failedSegmentsGoToExcludedLineage: true;
    outcomePeekingForbidden: true;
    pnlPeekingForbidden: true;
    targetHitPeekingForbidden: true;
  };
  exclusions: {
    forbiddenIncidenceRunIds: typeof M16_FORBIDDEN_INCIDENCE_RUN_IDS;
    forbiddenM14ValidationRunIds: typeof M16_FORBIDDEN_M14_VALIDATION_RUN_IDS;
    forbiddenM14ExcludedRunId: typeof M16_FORBIDDEN_M14_EXCLUDED_RUN_ID;
    forbiddenM15CostFloorRunId: typeof M16_FORBIDDEN_M15_COST_FLOOR_RUN_ID;
    rejectTrainHoldoutPriorRoles: true;
  };
  cohortPlanIdentity: string;
};

export function buildM16ProspectiveCohortPlan(): M16ProspectiveCohortPlan {
  const evidence = buildM16EvidenceContract();
  const dependence = buildM16DependencePlan();
  const fee = buildM16AuthoritativeFeeContract();

  const requiredTradeN = evidence.collectionTargets.requiredTradeN;
  const minimumUtcDayClusters = dependence.minimumUtcDayClusters;
  const estimatedHoursForTradeN =
    requiredTradeN / M16_BLIND_INCIDENCE_RATE_PER_HOUR;
  const estimatedHoursForUtcDayClusters =
    minimumUtcDayClusters * (M16_STANDARD_SEGMENT_DURATION_MINUTES / 60);
  const bindingEstimatedHours = Math.max(
    estimatedHoursForTradeN,
    estimatedHoursForUtcDayClusters,
  );

  const plan: Omit<M16ProspectiveCohortPlan, "cohortPlanIdentity"> = {
    planVersion: M16_COHORT_PLAN_VERSION,
    subfamilyId: M16_SUBFAMILY_ID,
    milestone: "m16.1-prospective-validation-cohort-plan",
    validationRole: M16_VALIDATION_ROLE,
    terminology: {
      thisCohort: "M16 prospective validation",
      ifSupported: "eligible-for-fresh-holdout",
      ifFailed: "stop-lineage",
      holdout: "not-part-of-this-plan-design-separately-later",
      noTrain: true,
    },
    linkedIdentities: {
      evidenceContractIdentity: evidence.evidenceContractIdentity,
      dependencePlanIdentity: dependence.dependencePlanIdentity,
      feeContractIdentity: fee.feeContractIdentity,
    },
    segment: {
      standardDurationMinutes: M16_STANDARD_SEGMENT_DURATION_MINUTES,
      maxDurationMinutes: M16_MAX_SEGMENT_DURATION_MINUTES,
      preferDistinctUtcDays: true,
      note:
        "Prefer one ≤8h accepted segment per UTC day to accumulate distinct "
        + "UTC-day clusters. Do not solve diversity with one giant multi-day "
        + "logical session.",
    },
    budget: {
      maxAcceptedCaptureHours: M16_MAX_ACCEPTED_CAPTURE_HOURS,
      blindIncidenceRatePerHourUsedForPlanning: M16_BLIND_INCIDENCE_RATE_PER_HOUR,
      estimatedHoursForTradeN,
      estimatedHoursForUtcDayClusters,
      bindingEstimatedHours,
    },
    evidenceThresholds: {
      requiredTradeN,
      minimumUtcDayClusters,
    },
    stopping: {
      mode: "outcome-blind-counts-and-hours-only",
      afterEachCompletedAcceptedCapture: [
        "update-blind-trade-incidence-and-utc-day-cluster-coverage",
        "if-tradeN-and-utcDayClusters-met → ready-for-outcome-open",
        "else-if-accepted-hours-exhausted → validation-underpowered",
        "else → continue-collection",
      ],
      failedSegmentsConsumeAcceptedHourBudget: false,
      failedSegmentsGoToExcludedLineage: true,
      outcomePeekingForbidden: true,
      pnlPeekingForbidden: true,
      targetHitPeekingForbidden: true,
    },
    exclusions: {
      forbiddenIncidenceRunIds: M16_FORBIDDEN_INCIDENCE_RUN_IDS,
      forbiddenM14ValidationRunIds: M16_FORBIDDEN_M14_VALIDATION_RUN_IDS,
      forbiddenM14ExcludedRunId: M16_FORBIDDEN_M14_EXCLUDED_RUN_ID,
      forbiddenM15CostFloorRunId: M16_FORBIDDEN_M15_COST_FLOOR_RUN_ID,
      rejectTrainHoldoutPriorRoles: true,
    },
  };

  const cohortPlanIdentity = createHash("sha256")
    .update(stableStringify(plan))
    .digest("hex");

  return { ...plan, cohortPlanIdentity };
}

export type M16BlindCollectionProgress = {
  acceptedCaptureHours: number;
  eligibleTradeCount: number;
  utcDayClusterCount: number;
  acceptedCaptureRunIds: readonly string[];
};

export type M16CollectionStoppingDisposition =
  | "ready-for-outcome-open"
  | "continue-collection"
  | "validation-underpowered";

export function decideM16BlindCollectionStopping(
  progress: M16BlindCollectionProgress,
  plan: M16ProspectiveCohortPlan = buildM16ProspectiveCohortPlan(),
): { disposition: M16CollectionStoppingDisposition; rationale: string } {
  const tradeOk =
    progress.eligibleTradeCount >= plan.evidenceThresholds.requiredTradeN;
  const clustersOk =
    progress.utcDayClusterCount >= plan.evidenceThresholds.minimumUtcDayClusters;
  if (tradeOk && clustersOk) {
    return {
      disposition: "ready-for-outcome-open",
      rationale:
        `Blind counts met: trades=${progress.eligibleTradeCount}/`
        + `${plan.evidenceThresholds.requiredTradeN}, utcDays=`
        + `${progress.utcDayClusterCount}/`
        + `${plan.evidenceThresholds.minimumUtcDayClusters}.`,
    };
  }
  if (progress.acceptedCaptureHours >= plan.budget.maxAcceptedCaptureHours) {
    return {
      disposition: "validation-underpowered",
      rationale:
        `Accepted hours ${progress.acceptedCaptureHours} ≥ budget `
        + `${plan.budget.maxAcceptedCaptureHours} before joint evidence `
        + `thresholds (trades=${progress.eligibleTradeCount}/`
        + `${plan.evidenceThresholds.requiredTradeN}, utcDays=`
        + `${progress.utcDayClusterCount}/`
        + `${plan.evidenceThresholds.minimumUtcDayClusters}).`,
    };
  }
  return {
    disposition: "continue-collection",
    rationale:
      `Need trades ${progress.eligibleTradeCount}/`
      + `${plan.evidenceThresholds.requiredTradeN} and utcDays `
      + `${progress.utcDayClusterCount}/`
      + `${plan.evidenceThresholds.minimumUtcDayClusters}; hours `
      + `${progress.acceptedCaptureHours}/`
      + `${plan.budget.maxAcceptedCaptureHours}.`,
  };
}
