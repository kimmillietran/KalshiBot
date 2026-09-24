/**
 * Quote eligibility gates and cadence sampling (chronological, not raw file order).
 */

import { midpointFromQuote } from "@/lib/data/research/kalshiTobMomentumFamily";

import type { FrictionQuote } from "./costs";
import {
  SETTLEMENT_FRICTION_MAX_QUOTE_AGE_MS,
  SETTLEMENT_FRICTION_MIN_DISPLAYED_SIZE,
  SETTLEMENT_FRICTION_SAMPLE_CADENCE_MS,
  SettlementFrictionCoverageError,
} from "./types";

export type ExclusionReason =
  | "missing-prices"
  | "crossed-book"
  | "locked-book"
  | "insufficient-size"
  | "stale-quote"
  | "missing-quote-age"
  | "unresolvable-mid"
  | "outside-session"
  | "structural-gap";

export type GateResult = {
  eligible: boolean;
  reasons: ExclusionReason[];
};

export function cadenceBucket(
  timestampMs: number,
  cadenceMs: number = SETTLEMENT_FRICTION_SAMPLE_CADENCE_MS,
): number {
  return Math.floor(timestampMs / cadenceMs);
}

/**
 * Sort quotes by timestamp ascending, then by stable sequence index.
 * Fail closed on null/non-finite timestamps.
 */
export function sortQuotesChronologically<T extends { timestampMs: number }>(
  quotes: readonly T[],
): T[] {
  const indexed = quotes.map((q, sequence) => ({ q, sequence }));
  for (const row of indexed) {
    if (!Number.isFinite(row.q.timestampMs)) {
      throw new SettlementFrictionCoverageError(
        "quote timestampMs must be finite for chronological sort",
      );
    }
  }
  indexed.sort((a, b) => {
    if (a.q.timestampMs !== b.q.timestampMs) {
      return a.q.timestampMs - b.q.timestampMs;
    }
    return a.sequence - b.sequence;
  });
  return indexed.map((row) => row.q);
}

export function evaluateFrictionQuoteGates(
  quote: FrictionQuote,
  opts?: {
    maxQuoteAgeMs?: number;
    minDisplayedSize?: number;
    openTimeMs?: number | null;
    closeTimeMs?: number | null;
    structuralGap?: boolean;
  },
): GateResult {
  const reasons: ExclusionReason[] = [];
  const maxAge = opts?.maxQuoteAgeMs ?? SETTLEMENT_FRICTION_MAX_QUOTE_AGE_MS;
  const minSize = opts?.minDisplayedSize ?? SETTLEMENT_FRICTION_MIN_DISPLAYED_SIZE;

  if (opts?.structuralGap === true) {
    reasons.push("structural-gap");
  }

  if (
    quote.yesBestBidCents == null
    || quote.noBestBidCents == null
    || !Number.isFinite(quote.yesBestBidCents)
    || !Number.isFinite(quote.noBestBidCents)
  ) {
    reasons.push("missing-prices");
  }

  const yesAsk =
    quote.yesBestAskCents
    ?? (quote.noBestBidCents != null ? 100 - quote.noBestBidCents : null);
  if (
    quote.yesBestBidCents != null
    && yesAsk != null
    && quote.yesBestBidCents > yesAsk
  ) {
    reasons.push("crossed-book");
  }
  if (
    quote.yesBestBidCents != null
    && yesAsk != null
    && quote.yesBestBidCents === yesAsk
  ) {
    reasons.push("locked-book");
  }

  const yesBidSize = quote.yesBestBidSize;
  const yesAskSize = quote.yesBestAskSize ?? quote.noBestBidSize;
  if (
    yesBidSize == null
    || yesAskSize == null
    || yesBidSize < minSize
    || yesAskSize < minSize
  ) {
    reasons.push("insufficient-size");
  }

  if (quote.quoteAgeMs == null || !Number.isFinite(quote.quoteAgeMs)) {
    reasons.push("missing-quote-age");
  } else if (quote.quoteAgeMs > maxAge) {
    reasons.push("stale-quote");
  }

  if (midpointFromQuote(quote) == null) {
    reasons.push("unresolvable-mid");
  }

  if (
    opts?.openTimeMs != null
    && Number.isFinite(opts.openTimeMs)
    && quote.timestampMs < opts.openTimeMs
  ) {
    reasons.push("outside-session");
  }
  if (
    opts?.closeTimeMs != null
    && Number.isFinite(opts.closeTimeMs)
    && quote.timestampMs > opts.closeTimeMs
  ) {
    reasons.push("outside-session");
  }

  return { eligible: reasons.length === 0, reasons };
}

/**
 * First eligible quote in each cadence bucket (on a chronologically sorted stream).
 */
export function selectCadenceSamples<T extends { timestampMs: number }>(input: {
  sortedEligibleQuotes: readonly T[];
  cadenceMs?: number;
}): T[] {
  const cadenceMs = input.cadenceMs ?? SETTLEMENT_FRICTION_SAMPLE_CADENCE_MS;
  const selected: T[] = [];
  let lastBucket = Number.NEGATIVE_INFINITY;
  for (const quote of input.sortedEligibleQuotes) {
    const bucket = cadenceBucket(quote.timestampMs, cadenceMs);
    if (bucket <= lastBucket) continue;
    lastBucket = bucket;
    selected.push(quote);
  }
  return selected;
}

/**
 * First eligible response in [t+H, t+H+tolerance], strictly after t.
 * Does not allow future quotes to mutate earlier entry state.
 */
export function matchResponseQuote<T extends { timestampMs: number }>(input: {
  entryTimestampMs: number;
  horizonMs: number;
  toleranceMs: number;
  sortedCandidates: readonly T[];
  isEligible: (quote: T) => boolean;
}): T | null {
  const targetMs = input.entryTimestampMs + input.horizonMs;
  const upperBoundMs = targetMs + input.toleranceMs;
  for (const quote of input.sortedCandidates) {
    if (quote.timestampMs <= input.entryTimestampMs) continue;
    if (quote.timestampMs < targetMs) continue;
    if (quote.timestampMs > upperBoundMs) break;
    if (input.isEligible(quote)) return quote;
  }
  return null;
}
