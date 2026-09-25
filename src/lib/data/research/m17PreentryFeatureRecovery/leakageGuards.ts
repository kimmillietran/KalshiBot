/**
 * Leakage guards for M17 pre-entry feature recovery.
 * Features must not use settlement labels, post-close quotes, or future candles.
 */

export type PreentryLeakageReason =
  | "used-settlement-label"
  | "used-expiration-value"
  | "used-post-close-book"
  | "used-future-candle"
  | "used-in-progress-candle";

export type PreentryFeatureSource = {
  entryTimestampMs: number;
  closeTimeMs: number | null;
  bookTimestampMs: number | null;
  candleCloseTimeMs: readonly number[];
  usedSettlementLabel: boolean;
  usedExpirationValue: boolean;
};

export type PreentryLeakageResult = {
  safe: boolean;
  reasons: PreentryLeakageReason[];
};

export function assertPreentryFeaturesAreCausal(
  source: PreentryFeatureSource,
): PreentryLeakageResult {
  const reasons: PreentryLeakageReason[] = [];

  if (source.usedSettlementLabel) {
    reasons.push("used-settlement-label");
  }
  if (source.usedExpirationValue) {
    reasons.push("used-expiration-value");
  }

  if (
    source.bookTimestampMs != null
    && Number.isFinite(source.bookTimestampMs)
    && source.bookTimestampMs > source.entryTimestampMs
  ) {
    reasons.push("used-post-close-book");
  }

  if (
    source.closeTimeMs != null
    && Number.isFinite(source.closeTimeMs)
    && source.bookTimestampMs != null
    && Number.isFinite(source.bookTimestampMs)
    && source.bookTimestampMs > source.closeTimeMs
  ) {
    reasons.push("used-post-close-book");
  }

  for (const candleClose of source.candleCloseTimeMs) {
    if (!Number.isFinite(candleClose)) continue;
    if (candleClose > source.entryTimestampMs) {
      reasons.push("used-future-candle");
    } else if (candleClose === source.entryTimestampMs) {
      // Frozen v2 requires closeTimeMs < entry; equality is in-progress / non-eligible.
      reasons.push("used-in-progress-candle");
    }
  }

  return {
    safe: reasons.length === 0,
    reasons: [...new Set(reasons)],
  };
}
