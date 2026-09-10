import {
  MAX_EVENT_QUOTE_AGE_MS,
  type EligibilityGates,
  type TobImbalanceQuoteInput,
} from "./microstructureFamilyTypes";

export function buildEligibilityGates(): EligibilityGates {
  return {
    requireBookStateValid: true,
    requireEconomicallyValid: true,
    requireFinitePositiveSizesAndPrices: true,
    rejectAwaitingSnapshotResyncGap: true,
    maxEventQuoteAgeMs: MAX_EVENT_QUOTE_AGE_MS,
    quoteAgeIsFixedGateNotSearched: true,
  };
}

const INVALID_BOOK_STATES = new Set([
  "awaiting-snapshot",
  "gap-detected",
  "resyncing",
  "closed",
]);

export function isEligibleEventQuote(quote: TobImbalanceQuoteInput): {
  eligible: boolean;
  reasons: readonly string[];
} {
  const reasons: string[] = [];
  if (quote.bookState !== "valid") {
    reasons.push(`bookState=${quote.bookState ?? "null"} is not valid`);
  }
  if (quote.bookState != null && INVALID_BOOK_STATES.has(quote.bookState)) {
    reasons.push(`bookState=${quote.bookState} rejects awaiting-snapshot/resync/gap/closed`);
  }
  if (quote.isEconomicallyValid !== true) {
    reasons.push("isEconomicallyValid must be true");
  }
  const sizes = [quote.yesBestBidSize, quote.noBestBidSize];
  const prices = [quote.yesBestBidCents, quote.noBestBidCents];
  if (sizes.some((value) => value == null || !Number.isFinite(value) || value < 0)) {
    reasons.push("sizes must be finite and non-negative");
  }
  if (prices.some((value) => value == null || !Number.isFinite(value))) {
    reasons.push("prices must be finite");
  }
  if (
    quote.quoteAgeMs != null
    && Number.isFinite(quote.quoteAgeMs)
    && quote.quoteAgeMs > MAX_EVENT_QUOTE_AGE_MS
  ) {
    reasons.push(`quoteAgeMs=${quote.quoteAgeMs} exceeds fixed gate ${MAX_EVENT_QUOTE_AGE_MS}`);
  }
  if (quote.quoteAgeMs == null) {
    reasons.push("quoteAgeMs required to prove non-staleness under fixed age gate");
  }
  return { eligible: reasons.length === 0, reasons };
}
