import { computeEffectiveSampleSizeEstimate } from "../oosPowerCorrection/oosPowerCorrectionMath";

import type { LeadLagStatisticalUnitContract } from "./leadLagEvidenceContractTypes";

export function buildLeadLagStatisticalUnitContract(): LeadLagStatisticalUnitContract {
  return {
    primaryIndependentUnit: "market-day-block",
    notIndependent: [
      "raw quote records",
      "multiple response windows on the same BTC trigger / market-trigger pair",
      "parameter cells / lag horizons examined on the same events",
      "many quotes around one BTC impulse within the same market-day",
    ],
    dependenceModel:
      "Lead-lag rows are nested: quotes ⊂ market-trigger events ⊂ markets ⊂ market-days ⊂ capture runs. "
      + "Multiple Kalshi markets can share one BTC impulse. Inference treats market-day blocks as the "
      + "primary independent unit (conservative; aligned with oosPowerCorrection).",
    clusteringRule:
      "Cluster by `${marketTicker}:${utcTradingDay}`. Repeated response windows from the same "
      + "market-trigger pair contribute at most one observation after selecting the locked window.",
    multiMarketSameTriggerPolicy:
      "When one BTC trigger touches multiple markets, each market may contribute at most one "
      + "locked-window observation, but ESS is further capped by unique BTC triggers and market-days "
      + "(min across limits) so shared-impulse dependence is not ignored.",
    effectiveSampleSizeRule:
      "ESS = min(raw locked-window observations, independent markets, market-day blocks, unique BTC triggers).",
  };
}

export function computeLeadLagEffectiveSampleSize(input: {
  rawObservationCount: number;
  independentMarketCount: number;
  marketDayCount: number;
  uniqueBtcTriggerCount: number;
}): number {
  const base = computeEffectiveSampleSizeEstimate({
    rawObservationCount: input.rawObservationCount,
    independentMarketCount: input.independentMarketCount,
    marketDayCount: input.marketDayCount,
  });
  if (input.rawObservationCount === 0) {
    return 0;
  }
  const triggerCap = Math.max(1, input.uniqueBtcTriggerCount);
  return Math.max(1, Math.min(base, triggerCap));
}

export function countIndependentLockedWindowObservations(input: {
  /** One row per locked response window observation (already de-duplicated windows). */
  observations: readonly {
    marketTicker: string;
    tradingDayUtc: string;
    btcTriggerId: string;
    responseWindowMs: number;
  }[];
  lockedResponseWindowMs: number;
}): {
  rawLockedWindowCount: number;
  rejectedAlternateWindowCount: number;
  independentMarketCount: number;
  marketDayCount: number;
  uniqueBtcTriggerCount: number;
} {
  const locked = input.observations.filter(
    (row) => row.responseWindowMs === input.lockedResponseWindowMs,
  );
  const rejectedAlternateWindowCount = input.observations.length - locked.length;
  const markets = new Set(locked.map((row) => row.marketTicker));
  const marketDays = new Set(locked.map((row) => `${row.marketTicker}:${row.tradingDayUtc}`));
  const triggers = new Set(locked.map((row) => row.btcTriggerId));
  return {
    rawLockedWindowCount: locked.length,
    rejectedAlternateWindowCount,
    independentMarketCount: markets.size,
    marketDayCount: marketDays.size,
    uniqueBtcTriggerCount: triggers.size,
  };
}
