import { ANCHOR_MATCH_TOLERANCE_MS, type MomentumQuoteInput } from "./momentumFamilyTypes";
import { isEligibleEventQuote, isValidResearchBookState } from "./eligibility";
import { midpointFromQuote } from "./midpointAndComplement";

export type AnchorResolution =
  | {
      status: "anchored";
      anchor: MomentumQuoteInput;
      targetTimestampMs: number;
      matchErrorMs: number;
      backwardReturnCents: number;
      eventMidCents: number;
      anchorMidCents: number;
    }
  | { status: "fail-closed"; reason: string };

/**
 * Anchor = last eligible quote with timestamp <= t - W, and sufficiently close
 * to the target backward time (tolerance 250ms). Uses only <= t information.
 * No quote after t may affect predictor eligibility.
 */
export function resolveBackwardAnchor(input: {
  eventTimestampMs: number;
  backwardWindowMs: number;
  /** Quotes at or before event time only. */
  quotesAtOrBeforeEvent: readonly MomentumQuoteInput[];
}): AnchorResolution {
  const targetTimestampMs = input.eventTimestampMs - input.backwardWindowMs;
  const sorted = [...input.quotesAtOrBeforeEvent]
    .filter((quote) => quote.timestampMs <= input.eventTimestampMs)
    .sort((a, b) => a.timestampMs - b.timestampMs);

  if (sorted.some((quote) => quote.timestampMs > input.eventTimestampMs)) {
    return {
      status: "fail-closed",
      reason: "quotes after event time cannot affect predictor",
    };
  }

  let best: MomentumQuoteInput | null = null;
  for (const quote of sorted) {
    if (quote.timestampMs > targetTimestampMs) {
      break;
    }
    const eligibility = isEligibleEventQuote(quote);
    if (!eligibility.eligible) {
      continue;
    }
    if (midpointFromQuote(quote) == null) {
      continue;
    }
    best = quote;
  }

  if (best == null) {
    return { status: "fail-closed", reason: "missing eligible anchor fails closed" };
  }

  // Anchor after the target backward time cannot be used (already filtered by <= target).
  if (best.timestampMs > targetTimestampMs) {
    return {
      status: "fail-closed",
      reason: "anchor after target backward time cannot be used",
    };
  }

  const matchErrorMs = targetTimestampMs - best.timestampMs;
  if (matchErrorMs > ANCHOR_MATCH_TOLERANCE_MS) {
    return {
      status: "fail-closed",
      reason:
        `anchor mismatch ${matchErrorMs}ms exceeds tolerance ${ANCHOR_MATCH_TOLERANCE_MS}ms`,
    };
  }

  // Causal window continuity: quotes strictly after anchor and at/before event must be valid.
  for (const quote of sorted) {
    if (quote.timestampMs <= best.timestampMs) continue;
    if (quote.timestampMs > input.eventTimestampMs) continue;
    if (!isValidResearchBookState(quote.bookState)) {
      return {
        status: "fail-closed",
        reason:
          `invalid/gap/resync bookState=${quote.bookState ?? "null"} inside causal window `
          + `at ${quote.timestampMs}`,
      };
    }
    if (quote.isEconomicallyValid !== true) {
      return {
        status: "fail-closed",
        reason: `non-economic book inside causal window at ${quote.timestampMs}`,
      };
    }
  }

  const eventQuote = sorted[sorted.length - 1];
  if (eventQuote == null || eventQuote.timestampMs !== input.eventTimestampMs) {
    // Event mid must come from a quote exactly at t when provided in the series;
    // callers may also pass event mid separately via a dedicated event quote.
  }

  const eventMid =
    eventQuote != null && eventQuote.timestampMs === input.eventTimestampMs
      ? midpointFromQuote(eventQuote)
      : null;
  const anchorMid = midpointFromQuote(best);
  if (eventMid == null || anchorMid == null) {
    return { status: "fail-closed", reason: "event or anchor midpoint unresolvable" };
  }

  return {
    status: "anchored",
    anchor: best,
    targetTimestampMs,
    matchErrorMs,
    backwardReturnCents: eventMid - anchorMid,
    eventMidCents: eventMid,
    anchorMidCents: anchorMid,
  };
}

/**
 * Resolve anchor when the event quote is supplied separately (preferred API).
 */
export function resolveBackwardReturnForEvent(input: {
  eventQuote: MomentumQuoteInput;
  backwardWindowMs: number;
  priorQuotes: readonly MomentumQuoteInput[];
}): AnchorResolution {
  if (input.priorQuotes.some((quote) => quote.timestampMs > input.eventQuote.timestampMs)) {
    return {
      status: "fail-closed",
      reason: "no quote after t may affect predictor eligibility",
    };
  }
  const quotesAtOrBeforeEvent = [
    ...input.priorQuotes.filter((quote) => quote.timestampMs <= input.eventQuote.timestampMs),
    input.eventQuote,
  ];
  return resolveBackwardAnchor({
    eventTimestampMs: input.eventQuote.timestampMs,
    backwardWindowMs: input.backwardWindowMs,
    quotesAtOrBeforeEvent,
  });
}
