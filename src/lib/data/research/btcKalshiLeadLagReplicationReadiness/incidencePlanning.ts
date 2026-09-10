import { computeLeadLagEffectiveSampleSize } from "../btcKalshiLeadLagEvidenceContract/statisticalUnit";

import type {
  LeadLagCaptureHourScenario,
  LeadLagHistoricalIncidenceByRun,
  LeadLagIncidenceRateScenario,
  LeadLagProjectedHoursToRequiredN,
  LeadLagProjectionDetail,
} from "./leadLagReplicationReadinessTypes";
import { DEFAULT_CAPTURE_HOUR_SCENARIOS } from "./leadLagReplicationReadinessTypes";

export function computeCandidateEss(input: {
  eligibleCandidateEvents: number;
  uniqueMarkets: number;
  uniqueMarketDays: number;
  uniqueBtcTriggers: number;
}): number {
  if (input.eligibleCandidateEvents <= 0) {
    return 0;
  }
  return computeLeadLagEffectiveSampleSize({
    rawObservationCount: input.eligibleCandidateEvents,
    independentMarketCount: input.uniqueMarkets,
    marketDayCount: input.uniqueMarketDays,
    uniqueBtcTriggerCount: input.uniqueBtcTriggers,
  });
}

export function ratePerHour(numerator: number, captureHours: number): number | null {
  if (!(captureHours > 0) || !Number.isFinite(captureHours)) {
    return null;
  }
  if (!Number.isFinite(numerator)) {
    return null;
  }
  return numerator / captureHours;
}

export function buildIncidenceRow(input: {
  runLabel: LeadLagHistoricalIncidenceByRun["runLabel"];
  runId: string;
  role: LeadLagHistoricalIncidenceByRun["role"];
  captureHours: number;
  eligibleCandidateEvents: number;
  uniqueMarkets: number;
  uniqueMarketDays: number;
  uniqueBtcTriggers: number;
  /** When provided (e.g. holdout artifact), prefer bound ESS over recomputation. */
  effectiveSampleSizeOverride?: number;
  observedPrimaryEffectCents?: number | null;
}): LeadLagHistoricalIncidenceByRun {
  const effectiveSampleSize =
    input.effectiveSampleSizeOverride
    ?? computeCandidateEss({
      eligibleCandidateEvents: input.eligibleCandidateEvents,
      uniqueMarkets: input.uniqueMarkets,
      uniqueMarketDays: input.uniqueMarketDays,
      uniqueBtcTriggers: input.uniqueBtcTriggers,
    });

  const eventsPerHour = ratePerHour(input.eligibleCandidateEvents, input.captureHours) ?? 0;
  const marketsPerHour = ratePerHour(input.uniqueMarkets, input.captureHours) ?? 0;
  const essPerHour = ratePerHour(effectiveSampleSize, input.captureHours) ?? 0;

  return {
    runLabel: input.runLabel,
    runId: input.runId,
    role: input.role,
    captureHours: input.captureHours,
    eligibleCandidateEvents: input.eligibleCandidateEvents,
    uniqueMarkets: input.uniqueMarkets,
    uniqueMarketDays: input.uniqueMarketDays,
    uniqueBtcTriggers: input.uniqueBtcTriggers,
    effectiveSampleSize,
    eventsPerHour,
    marketsPerHour,
    essPerHour,
    observedPrimaryEffectCents: input.observedPrimaryEffectCents ?? null,
    countsTowardFreshProspectiveN: false,
  };
}

export function buildIncidenceRateScenarios(
  rows: readonly LeadLagHistoricalIncidenceByRun[],
): readonly LeadLagIncidenceRateScenario[] {
  const rates = rows.map((row) => row.essPerHour).filter((rate) => Number.isFinite(rate) && rate >= 0);
  const totalHours = rows.reduce((sum, row) => sum + row.captureHours, 0);
  const totalEss = rows.reduce((sum, row) => sum + row.effectiveSampleSize, 0);
  const pooled = ratePerHour(totalEss, totalHours);
  const low = rates.length > 0 ? Math.min(...rates) : null;
  const high = rates.length > 0 ? Math.max(...rates) : null;

  return [
    {
      scenarioId: "low-historical-observed-rate",
      rationale:
        "Minimum observed candidate-specific ESS/hour across historical Runs 1–3 "
        + "(transparent low-rate scenario; not a claim that the worst run is stationary).",
      essPerHour: low,
    },
    {
      scenarioId: "pooled-observed-rate",
      rationale:
        "Pooled ESS / pooled capture hours across Runs 1–3 (design incidence only; not confirmatory N).",
      essPerHour: pooled,
    },
    {
      scenarioId: "high-historical-observed-rate",
      rationale:
        "Maximum observed candidate-specific ESS/hour across historical Runs 1–3 "
        + "(optimistic planning bound; three runs do not establish a precise arrival process).",
      essPerHour: high,
    },
  ];
}

export function projectHoursToRequiredN(input: {
  requiredFreshEffectiveN: number;
  essPerHour: number | null;
}): LeadLagProjectionDetail {
  if (input.essPerHour == null || !Number.isFinite(input.essPerHour)) {
    return {
      essPerHour: null,
      projectedCaptureHours: null,
      projectedFourHourRuns: null,
      projectedEightHourRuns: null,
      unavailableReason: "ESS/hour unavailable",
    };
  }
  if (input.essPerHour <= 0) {
    return {
      essPerHour: input.essPerHour,
      projectedCaptureHours: null,
      projectedFourHourRuns: null,
      projectedEightHourRuns: null,
      unavailableReason: "zero incidence produces unavailable projected duration",
    };
  }
  const hours = input.requiredFreshEffectiveN / input.essPerHour;
  return {
    essPerHour: input.essPerHour,
    projectedCaptureHours: hours,
    projectedFourHourRuns: hours / 4,
    projectedEightHourRuns: hours / 8,
    unavailableReason: null,
  };
}

export function buildProjectedHoursToRequiredN(input: {
  requiredFreshEffectiveN: number;
  scenarios: readonly LeadLagIncidenceRateScenario[];
}): LeadLagProjectedHoursToRequiredN {
  const byId = new Map(input.scenarios.map((scenario) => [scenario.scenarioId, scenario]));
  return {
    requiredFreshEffectiveN: input.requiredFreshEffectiveN,
    lowRate: projectHoursToRequiredN({
      requiredFreshEffectiveN: input.requiredFreshEffectiveN,
      essPerHour: byId.get("low-historical-observed-rate")?.essPerHour ?? null,
    }),
    pooledRate: projectHoursToRequiredN({
      requiredFreshEffectiveN: input.requiredFreshEffectiveN,
      essPerHour: byId.get("pooled-observed-rate")?.essPerHour ?? null,
    }),
    highRate: projectHoursToRequiredN({
      requiredFreshEffectiveN: input.requiredFreshEffectiveN,
      essPerHour: byId.get("high-historical-observed-rate")?.essPerHour ?? null,
    }),
  };
}

export function buildCaptureHourScenarios(input: {
  scenarios: readonly LeadLagIncidenceRateScenario[];
  hours?: readonly number[];
}): readonly LeadLagCaptureHourScenario[] {
  const byId = new Map(input.scenarios.map((scenario) => [scenario.scenarioId, scenario]));
  const low = byId.get("low-historical-observed-rate")?.essPerHour ?? null;
  const pooled = byId.get("pooled-observed-rate")?.essPerHour ?? null;
  const high = byId.get("high-historical-observed-rate")?.essPerHour ?? null;
  const hours = input.hours ?? DEFAULT_CAPTURE_HOUR_SCENARIOS;

  return hours.map((captureHours) => ({
    captureHours,
    expectedEssLow: low != null && low > 0 ? captureHours * low : low === 0 ? 0 : null,
    expectedEssPooled:
      pooled != null && pooled > 0 ? captureHours * pooled : pooled === 0 ? 0 : null,
    expectedEssHigh: high != null && high > 0 ? captureHours * high : high === 0 ? 0 : null,
  }));
}

/** Fail closed: raw quote counts are never statistical N. */
export function rejectRawQuoteCountAsStatisticalN(rawQuoteCount: number): never {
  throw new Error(
    `raw quote count (${rawQuoteCount}) cannot be statistical N; use ESS under market-day-block unit`,
  );
}
