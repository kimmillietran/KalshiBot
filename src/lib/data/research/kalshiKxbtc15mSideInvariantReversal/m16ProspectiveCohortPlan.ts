/**
 * M16.1a prospective validation cohort plan (v2) — supersedes M16.1 v1.
 * Fresh captures only. Outcome-blind stopping. No capture launch here.
 */
import { createHash } from "node:crypto";

import { stableStringify } from "@/lib/trading/config/hashConfig";

import { buildM16AuthoritativeFeeContract } from "./m16AuthoritativeFeeContract";
import { buildM16DependencePlan } from "./m16DependencePlan";
import { buildM16EvidenceContract } from "./m16EvidenceContract";
import {
  M16_1A_AMENDMENT_REASON,
  M16_1_PRIOR_COHORT_PLAN_IDENTITY,
} from "./m16PriorContractIdentities";
import {
  M16_FORBIDDEN_M14_EXCLUDED_RUN_ID,
  M16_FORBIDDEN_M14_VALIDATION_RUN_IDS,
  M16_FORBIDDEN_M15_COST_FLOOR_RUN_ID,
  M16_SUBFAMILY_ID,
} from "./m16Types";

export const M16_COHORT_PLAN_VERSION =
  "kalshi-kxbtc15m-side-invariant-exhaustion-reversal-cohort-plan-v2" as const;

export const M16_VALIDATION_ROLE = "m16-prospective-validation" as const;

/** Standard / max segment duration (minutes) — M16.1a 4h. */
export const M16_STANDARD_SEGMENT_DURATION_MINUTES = 240 as const;
export const M16_MAX_SEGMENT_DURATION_MINUTES = 240 as const;

/**
 * Fixed daily UTC window (operational regularity — not profitability).
 * Entire 240m interval lies inside one UTC calendar date.
 */
export const M16_FIXED_UTC_WINDOW_START_HHMM = "14:00" as const;
export const M16_FIXED_UTC_WINDOW_END_HHMM = "18:00" as const;
export const M16_FIXED_UTC_WINDOW =
  "14:00-18:00Z-daily-fixed-operational-regularity" as const;

export const M16_MAX_ACCEPTED_SEGMENTS_PER_UTC_DAY = 1 as const;
export const M16_ACCEPTED_SEGMENT_MUST_REMAIN_WITHIN_SINGLE_UTC_DAY = true as const;

/**
 * Max accepted capture hours. ~268/2.06 ≈ 130h expected; seal 140h slack.
 * Do not expand after seeing P&L.
 */
export const M16_MAX_ACCEPTED_CAPTURE_HOURS = 140 as const;

export const M16_BLIND_INCIDENCE_RATE_PER_HOUR = 2.0625339816796635 as const;

export const M16_FORBIDDEN_INCIDENCE_RUN_IDS = [
  "2026-08-03T03-21-26-351Z",
  "2026-08-04T10-33-33-601Z",
] as const;

export type M16ProspectiveCohortPlan = {
  planVersion: typeof M16_COHORT_PLAN_VERSION;
  subfamilyId: typeof M16_SUBFAMILY_ID;
  milestone: "m16.1a-prospective-validation-cohort-plan";
  supersedesCohortPlanIdentity: typeof M16_1_PRIOR_COHORT_PLAN_IDENTITY;
  amendmentReason: typeof M16_1A_AMENDMENT_REASON;
  economicOutcomesOpenedBeforeAmendment: false;
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
    fixedUtcWindow: typeof M16_FIXED_UTC_WINDOW;
    fixedUtcWindowStartHhmm: typeof M16_FIXED_UTC_WINDOW_START_HHMM;
    fixedUtcWindowEndHhmm: typeof M16_FIXED_UTC_WINDOW_END_HHMM;
    maximumAcceptedSegmentsPerUtcDay: typeof M16_MAX_ACCEPTED_SEGMENTS_PER_UTC_DAY;
    acceptedSegmentMustRemainWithinSingleUtcDay:
      typeof M16_ACCEPTED_SEGMENT_MUST_REMAIN_WITHIN_SINGLE_UTC_DAY;
    calendarDaySelection:
      "consecutive-operator-eligible-calendar-days-no-volatility-cherry-picking";
    preferDistinctUtcDays: true;
    note: string;
  };
  budget: {
    maxAcceptedCaptureHours: typeof M16_MAX_ACCEPTED_CAPTURE_HOURS;
    blindIncidenceRatePerHourUsedForPlanning: typeof M16_BLIND_INCIDENCE_RATE_PER_HOUR;
    estimatedHoursForTradeN: number;
    estimatedHoursForUtcDayClusters: number;
    bindingEstimatedHours: number;
    expectedCalendarDaysApproximate: number;
  };
  evidenceThresholds: {
    requiredTradeN: number;
    minimumUtcDayClusters: number;
    iidBaselineTradeN: number;
  };
  zeroSignalHealthyDay: {
    consumesAcceptedHours: true;
    incrementsEligibleTradeN: false;
    incrementsEligibleUtcDayClusterN: false;
    mayNotBeDiscardedToRecaptureForSignals: true;
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
    milestone: "m16.1a-prospective-validation-cohort-plan",
    supersedesCohortPlanIdentity: M16_1_PRIOR_COHORT_PLAN_IDENTITY,
    amendmentReason: M16_1A_AMENDMENT_REASON,
    economicOutcomesOpenedBeforeAmendment: false,
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
      fixedUtcWindow: M16_FIXED_UTC_WINDOW,
      fixedUtcWindowStartHhmm: M16_FIXED_UTC_WINDOW_START_HHMM,
      fixedUtcWindowEndHhmm: M16_FIXED_UTC_WINDOW_END_HHMM,
      maximumAcceptedSegmentsPerUtcDay: M16_MAX_ACCEPTED_SEGMENTS_PER_UTC_DAY,
      acceptedSegmentMustRemainWithinSingleUtcDay:
        M16_ACCEPTED_SEGMENT_MUST_REMAIN_WITHIN_SINGLE_UTC_DAY,
      calendarDaySelection:
        "consecutive-operator-eligible-calendar-days-no-volatility-cherry-picking",
      preferDistinctUtcDays: true,
      note:
        "Fixed 14:00–18:00 UTC daily window chosen for operational regularity "
        + "(full 4h inside one UTC day). Not selected from P&L or volatility. "
        + "At most one accepted normal segment per UTC day. Zero-signal healthy "
        + "days consume hours but do not increment G.",
    },
    budget: {
      maxAcceptedCaptureHours: M16_MAX_ACCEPTED_CAPTURE_HOURS,
      blindIncidenceRatePerHourUsedForPlanning: M16_BLIND_INCIDENCE_RATE_PER_HOUR,
      estimatedHoursForTradeN,
      estimatedHoursForUtcDayClusters,
      bindingEstimatedHours,
      expectedCalendarDaysApproximate:
        requiredTradeN / (M16_BLIND_INCIDENCE_RATE_PER_HOUR * 4),
    },
    evidenceThresholds: {
      requiredTradeN,
      minimumUtcDayClusters,
      iidBaselineTradeN: evidence.collectionTargets.iidBaselineTradeN,
    },
    zeroSignalHealthyDay: {
      consumesAcceptedHours: true,
      incrementsEligibleTradeN: false,
      incrementsEligibleUtcDayClusterN: false,
      mayNotBeDiscardedToRecaptureForSignals: true,
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
        + `${plan.evidenceThresholds.minimumUtcDayClusters}. `
        + "Economic outcomes remain sealed until a separate M16.3 executor.",
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

/** Assert a planned 240m window lies entirely inside one UTC day at the fixed clock. */
export function assertM16FixedUtcWindowInsideSingleDay(input: {
  plannedUtcDay: string;
  plannedStartIso: string;
  durationMinutes: number;
}): void {
  if (input.durationMinutes !== M16_STANDARD_SEGMENT_DURATION_MINUTES) {
    throw new Error(
      `M16.1a segment duration must be ${M16_STANDARD_SEGMENT_DURATION_MINUTES}m`,
    );
  }
  const expectedStart = `${input.plannedUtcDay}T${M16_FIXED_UTC_WINDOW_START_HHMM}:00.000Z`;
  if (input.plannedStartIso !== expectedStart) {
    throw new Error(
      `M16.1a fixed window start must be ${expectedStart}; got ${input.plannedStartIso}`,
    );
  }
  const endMs =
    Date.parse(input.plannedStartIso) + input.durationMinutes * 60_000;
  const endDay = new Date(endMs - 1).toISOString().slice(0, 10);
  if (endDay !== input.plannedUtcDay) {
    throw new Error("M16.1a accepted segment must not cross UTC midnight");
  }
}
