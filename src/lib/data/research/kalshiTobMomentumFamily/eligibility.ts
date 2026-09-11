import {
  MAX_EVENT_QUOTE_AGE_MS,
  PROBABILITY_GATE_MAX_MID_CENTS,
  PROBABILITY_GATE_MIN_MID_CENTS,
  TIME_REMAINING_MAX_MS,
  TIME_REMAINING_RESPONSE_ROOM_BUFFER_MS,
  type EligibilityGates,
  type MomentumQuoteInput,
} from "./momentumFamilyTypes";
import { midpointFromQuote } from "./midpointAndComplement";

export function buildEligibilityGates(): EligibilityGates {
  return {
    requireBookStateValid: true,
    requireEconomicallyValid: true,
    rejectAwaitingSnapshotResyncGap: true,
    maxEventQuoteAgeMs: MAX_EVENT_QUOTE_AGE_MS,
    quoteAgeIsFixedGateNotSearched: true,
    probabilityGateMinMidCents: PROBABILITY_GATE_MIN_MID_CENTS,
    probabilityGateMaxMidCents: PROBABILITY_GATE_MAX_MID_CENTS,
    timeRemainingMaxMs: TIME_REMAINING_MAX_MS,
    timeRemainingRequiresHorizonPlusBufferMs: TIME_REMAINING_RESPONSE_ROOM_BUFFER_MS,
    probabilityAndTimeAreGatesNotSearchAxes: true,
  };
}

const INVALID_BOOK_STATES = new Set([
  "awaiting-snapshot",
  "gap-detected",
  "resyncing",
  "closed",
]);

export function isValidResearchBookState(bookState: string | null): boolean {
  return bookState === "valid";
}

export function isEligibleEventQuote(quote: MomentumQuoteInput): {
  eligible: boolean;
  reasons: readonly string[];
} {
  const reasons: string[] = [];
  if (!isValidResearchBookState(quote.bookState)) {
    reasons.push(`bookState=${quote.bookState ?? "null"} is not valid`);
  }
  if (quote.bookState != null && INVALID_BOOK_STATES.has(quote.bookState)) {
    reasons.push(`bookState=${quote.bookState} rejects awaiting-snapshot/resync/gap/closed`);
  }
  if (quote.isEconomicallyValid !== true) {
    reasons.push("isEconomicallyValid must be true");
  }
  const prices = [quote.yesBestBidCents, quote.noBestBidCents];
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

export function passesProbabilityGate(yesMidCents: number): boolean {
  return (
    yesMidCents >= PROBABILITY_GATE_MIN_MID_CENTS
    && yesMidCents <= PROBABILITY_GATE_MAX_MID_CENTS
  );
}

export function passesTimeRemainingGate(input: {
  timeRemainingMs: number;
  forwardHorizonMs: number;
}): boolean {
  if (!Number.isFinite(input.timeRemainingMs)) return false;
  if (input.timeRemainingMs >= TIME_REMAINING_MAX_MS) return false;
  if (input.timeRemainingMs < input.forwardHorizonMs + TIME_REMAINING_RESPONSE_ROOM_BUFFER_MS) {
    return false;
  }
  return true;
}

export function eventPassesFixedGates(input: {
  quote: MomentumQuoteInput;
  timeRemainingMs: number;
  forwardHorizonMs: number;
}): { ok: boolean; reasons: readonly string[] } {
  const reasons: string[] = [];
  const eligibility = isEligibleEventQuote(input.quote);
  if (!eligibility.eligible) {
    reasons.push(...eligibility.reasons);
  }
  const mid = midpointFromQuote(input.quote);
  if (mid == null) {
    reasons.push("midpoint unresolvable");
  } else if (!passesProbabilityGate(mid)) {
    reasons.push(
      `yesMidCents=${mid} outside fixed gate [${PROBABILITY_GATE_MIN_MID_CENTS},${PROBABILITY_GATE_MAX_MID_CENTS}]`,
    );
  }
  if (!passesTimeRemainingGate({
    timeRemainingMs: input.timeRemainingMs,
    forwardHorizonMs: input.forwardHorizonMs,
  })) {
    reasons.push(
      `timeRemainingMs=${input.timeRemainingMs} fails <${TIME_REMAINING_MAX_MS}ms and `
        + `>= H+${TIME_REMAINING_RESPONSE_ROOM_BUFFER_MS}ms room`,
    );
  }
  return { ok: reasons.length === 0, reasons };
}
