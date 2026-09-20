/**
 * Prospective sample-size / precision sensitivity — theoretical planning only.
 * Do NOT estimate SD or edge from hidden economic outcomes during census.
 */
import {
  M16_MAX_FUTURE_CAPTURE_BUDGET_HOURS,
  M16_PLANNING_MEAN_EFFECTS_CENTS,
  M16_PLANNING_SD_SCENARIOS_CENTS,
  M16_PRIMARY_PLANNING_MEAN_EFFECT_CENTS,
  M16_PRIMARY_PLANNING_SD_CENTS,
  M16_TARGET_INDEPENDENT_TRADE_N,
  type M16IncidenceFeasibility,
} from "./m16Types";

export type M16SampleSizePlan = {
  method:
    "approximate-n-equals-square-z-times-sd-over-mean-with-z-1.96";
  zApprox: 1.96;
  planningMeanEffectsCents: readonly number[];
  planningSdScenariosCents: readonly number[];
  primaryMeanEffectCents: number;
  primarySdCents: number;
  targetIndependentTradeN: number;
  sensitivityTable: readonly {
    meanEffectCents: number;
    sdCents: number;
    approximateN: number;
  }[];
  maxFutureCaptureBudgetHours: typeof M16_MAX_FUTURE_CAPTURE_BUDGET_HOURS;
  clusterUnit: "capture-session";
  note: string;
};

export function approximateNForMeanDetectability(input: {
  meanEffectCents: number;
  sdCents: number;
  zApprox?: number;
}): number {
  const z = input.zApprox ?? 1.96;
  if (input.meanEffectCents <= 0 || input.sdCents <= 0) {
    return Number.POSITIVE_INFINITY;
  }
  const n = (z * input.sdCents) / input.meanEffectCents;
  return Math.ceil(n * n);
}

export function buildM16SampleSizePlan(input?: {
  planningMeanEffectsCents?: readonly number[];
  planningSdScenariosCents?: readonly number[];
  primaryMeanEffectCents?: number;
  primarySdCents?: number;
  targetIndependentTradeN?: number;
}): M16SampleSizePlan {
  const means = input?.planningMeanEffectsCents ?? M16_PLANNING_MEAN_EFFECTS_CENTS;
  const sds = input?.planningSdScenariosCents ?? M16_PLANNING_SD_SCENARIOS_CENTS;
  const primaryMean =
    input?.primaryMeanEffectCents ?? M16_PRIMARY_PLANNING_MEAN_EFFECT_CENTS;
  const primarySd = input?.primarySdCents ?? M16_PRIMARY_PLANNING_SD_CENTS;
  const sensitivityTable = [];
  for (const meanEffectCents of means) {
    for (const sdCents of sds) {
      sensitivityTable.push({
        meanEffectCents,
        sdCents,
        approximateN: approximateNForMeanDetectability({
          meanEffectCents,
          sdCents,
        }),
      });
    }
  }
  const computedPrimary = approximateNForMeanDetectability({
    meanEffectCents: primaryMean,
    sdCents: primarySd,
  });
  const targetIndependentTradeN =
    input?.targetIndependentTradeN ?? Math.max(
      M16_TARGET_INDEPENDENT_TRADE_N,
      computedPrimary,
    );

  return {
    method: "approximate-n-equals-square-z-times-sd-over-mean-with-z-1.96",
    zApprox: 1.96,
    planningMeanEffectsCents: [...means],
    planningSdScenariosCents: [...sds],
    primaryMeanEffectCents: primaryMean,
    primarySdCents: primarySd,
    targetIndependentTradeN,
    sensitivityTable,
    maxFutureCaptureBudgetHours: M16_MAX_FUTURE_CAPTURE_BUDGET_HOURS,
    clusterUnit: "capture-session",
    note:
      "Do not reuse M14 ESS=155 / SD=10¢ / MDE=2¢. M16 has wider asymmetric "
      + "trade distribution. Values are theoretical planning assumptions only.",
  };
}

export function decideM16IncidenceFeasibility(input: {
  projectedCaptureHoursForTargetN: number | null;
  maxBudgetHours?: number;
  usableEntryCount: number;
}): { disposition: M16IncidenceFeasibility; rationale: string } {
  const maxBudget = input.maxBudgetHours ?? M16_MAX_FUTURE_CAPTURE_BUDGET_HOURS;
  if (input.usableEntryCount <= 0 || input.projectedCaptureHoursForTargetN == null) {
    return {
      disposition: "insufficient-census-observability",
      rationale:
        "Census produced no usable future-analysis entries; cannot project hours.",
    };
  }
  if (input.projectedCaptureHoursForTargetN <= maxBudget) {
    return {
      disposition: "incidence-feasible",
      rationale:
        `Projected ${input.projectedCaptureHoursForTargetN.toFixed(1)}h `
        + `≤ max budget ${maxBudget}h for target N.`,
    };
  }
  return {
    disposition: "incidence-infeasible",
    rationale:
      `Projected ${input.projectedCaptureHoursForTargetN.toFixed(1)}h `
      + `> max budget ${maxBudget}h — family may die without opening P&L.`,
  };
}
