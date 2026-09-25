/**
 * Feature completeness on retained friction sample rows (schema-level).
 * Does not impute missing settlement-state or regime columns.
 */

import type { M17FeatureAvailability } from "./types";

/** Retained friction sample schema fields (subset). */
export type RetainedFrictionSampleRow = {
  marketTicker?: string;
  utcDayKey?: string;
  entryTimestampMs?: number;
  entryFrictionCents?: number;
  entryHalfSpreadCents?: number;
  entryFeeCents?: number;
  // Intentionally absent on retained friction samples:
  yesBidCents?: number;
  yesAskCents?: number;
  noAskCents?: number;
  yesMidpoint?: number;
  realizedVolatility?: number;
  timeRemainingMs?: number;
  bankedSampleCount?: number;
  bankedSampleSum?: number;
  remainingAverageThreshold?: number;
};

export function rowHasYesMidpoint(row: RetainedFrictionSampleRow): boolean {
  if (typeof row.yesMidpoint === "number" && Number.isFinite(row.yesMidpoint)) {
    return true;
  }
  if (
    typeof row.yesBidCents === "number"
    && typeof row.yesAskCents === "number"
    && Number.isFinite(row.yesBidCents)
    && Number.isFinite(row.yesAskCents)
  ) {
    return true;
  }
  return false;
}

export function rowHasVolatility(row: RetainedFrictionSampleRow): boolean {
  return typeof row.realizedVolatility === "number"
    && Number.isFinite(row.realizedVolatility);
}

export function rowHasTimeRemaining(row: RetainedFrictionSampleRow): boolean {
  return typeof row.timeRemainingMs === "number"
    && Number.isFinite(row.timeRemainingMs);
}

export function rowHasSettlementStatePath(row: RetainedFrictionSampleRow): boolean {
  return (
    typeof row.bankedSampleCount === "number"
    && Number.isFinite(row.bankedSampleCount)
    && typeof row.bankedSampleSum === "number"
    && Number.isFinite(row.bankedSampleSum)
  );
}

export function rowHasRemainingAverageThreshold(
  row: RetainedFrictionSampleRow,
): boolean {
  return typeof row.remainingAverageThreshold === "number"
    && Number.isFinite(row.remainingAverageThreshold);
}

export function summarizeFeatureAvailability(input: {
  samples: readonly RetainedFrictionSampleRow[];
  validOfficialSettlementJoin: number;
  incompleteTickerExcluded: number;
  nonNumericExpirationExcluded: number;
}): M17FeatureAvailability {
  let unambiguous = 0;
  let yesMid = 0;
  let vol = 0;
  let timeRem = 0;
  let statePath = 0;
  let threshold = 0;
  let complete = 0;

  for (const row of input.samples) {
    const hasTicker =
      typeof row.marketTicker === "string" && row.marketTicker.trim().length > 0;
    const hasTs = typeof row.entryTimestampMs === "number"
      && Number.isFinite(row.entryTimestampMs);
    if (hasTicker && hasTs) unambiguous += 1;

    const mid = rowHasYesMidpoint(row);
    const v = rowHasVolatility(row);
    const t = rowHasTimeRemaining(row);
    const s = rowHasSettlementStatePath(row);
    const r = rowHasRemainingAverageThreshold(row);
    if (mid) yesMid += 1;
    if (v) vol += 1;
    if (t) timeRem += 1;
    if (s) statePath += 1;
    if (r) threshold += 1;
    // Complete required features for M17 settlement-state entry:
    // executable identity + regime columns + settlement-state path + frozen mapping
    // (mapping is global; per-row completeness still requires path + regime).
    if (hasTicker && hasTs && mid && v && t && s && r) complete += 1;
  }

  return {
    executableBookSamples: input.samples.length,
    unambiguousMarketIdentity: unambiguous,
    validOfficialSettlementJoin: input.validOfficialSettlementJoin,
    incompleteTickerExcluded: input.incompleteTickerExcluded,
    nonNumericExpirationExcluded: input.nonNumericExpirationExcluded,
    yesMidpointPresent: yesMid,
    highVolatilityFeaturePresent: vol,
    timeRemainingFeaturePresent: timeRem,
    settlementStatePathPresent: statePath,
    remainingAverageThresholdPresent: threshold,
    completeRequiredFeaturesForEntry: complete,
  };
}
