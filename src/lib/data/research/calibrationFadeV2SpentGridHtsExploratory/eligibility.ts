import {
  CF_V2_SPENT_GRID_ELIGIBILITY,
  type EligibilityFailureReason,
  type PreentryFeatureRow,
} from "./types";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

/**
 * Pre-entry eligibility for the spent-grid HTS variant.
 * Uses recovered feature fields only (no settlement labels).
 */
export function evaluatePreentryEligibility(
  row: PreentryFeatureRow,
): { ok: true } | { ok: false; reason: EligibilityFailureReason } {
  if (
    typeof row.marketTicker !== "string"
    || row.marketTicker.trim().length === 0
    || !isFiniteNumber(row.entryTimestampMs)
  ) {
    return { ok: false, reason: "missing-market-or-timestamp" };
  }

  if (row.bookFeatureStatus !== "ok") {
    return { ok: false, reason: "book-feature-not-ok" };
  }

  if (row.citedHighVolRegime !== true) {
    return { ok: false, reason: "cited-high-vol-false-or-missing" };
  }

  // Consistency with frozen vol contract when the numeric is present.
  if (
    isFiniteNumber(row.annualizedRealizedVolatility)
    && row.annualizedRealizedVolatility
      < CF_V2_SPENT_GRID_ELIGIBILITY.volatilityMinInclusive
  ) {
    return { ok: false, reason: "cited-high-vol-false-or-missing" };
  }

  if (
    !isFiniteNumber(row.yesMidpoint)
    || row.yesMidpoint < CF_V2_SPENT_GRID_ELIGIBILITY.yesMidpointMinInclusive
    || row.yesMidpoint >= CF_V2_SPENT_GRID_ELIGIBILITY.yesMidpointMaxExclusive
  ) {
    return { ok: false, reason: "yes-midpoint-out-of-range" };
  }

  if (
    !isFiniteNumber(row.timeRemainingMs)
    || row.timeRemainingMs
      <= CF_V2_SPENT_GRID_ELIGIBILITY.timeRemainingMsMinExclusive
    || row.timeRemainingMs
      >= CF_V2_SPENT_GRID_ELIGIBILITY.timeRemainingMsMaxExclusive
  ) {
    return { ok: false, reason: "time-remaining-out-of-range" };
  }

  if (row.crossed === true) {
    return { ok: false, reason: "crossed-book" };
  }
  if (row.locked === true) {
    return { ok: false, reason: "locked-book" };
  }

  if (
    !isInteger(row.yesBidCents)
    || !isInteger(row.yesAskCents)
    || row.yesBidCents < 0
    || row.yesBidCents > 100
    || row.yesAskCents < 0
    || row.yesAskCents > 100
  ) {
    return { ok: false, reason: "invalid-bbo" };
  }

  if (
    !isInteger(row.noAskCents)
    || row.noAskCents
      <= CF_V2_SPENT_GRID_ELIGIBILITY.noAskCentsMinExclusive
    || row.noAskCents
      >= CF_V2_SPENT_GRID_ELIGIBILITY.noAskCentsMaxExclusive
  ) {
    return { ok: false, reason: "no-ask-out-of-range" };
  }

  if (row.noAskCents !== 100 - row.yesBidCents) {
    return { ok: false, reason: "no-ask-complement-mismatch" };
  }

  return { ok: true };
}
