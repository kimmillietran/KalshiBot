import { resolveBackwardReturnForEvent } from "./backwardAnchor";
import { eventPassesFixedGates, isEligibleEventQuote } from "./eligibility";
import { midpointFromQuote } from "./midpointAndComplement";
import type { MomentumQuoteInput } from "./momentumFamilyTypes";

export type MomentumCrossingEvent = {
  marketTicker: string;
  eventTimestampMs: number;
  backwardWindowMs: number;
  returnThresholdCents: number;
  forwardHorizonMs: number;
  backwardReturnCents: number;
  continuationSign: -1 | 1;
  eventMidCents: number;
  timeRemainingMs: number;
  eventFeatures: {
    yesBestBidCents: number;
    noBestBidCents: number;
  };
};

/**
 * First-crossing episode per market × (W,X) state (forward horizon is structural
 * but does not change the predictor crossing). Outside threshold → first transition
 * inside → fire. Remaining continuously above threshold does not re-fire.
 * Leaving then re-entering re-arms (subject to later refractory).
 */
export function detectFirstMomentumCrossings(input: {
  quotes: readonly MomentumQuoteInput[];
  backwardWindowMs: number;
  returnThresholdCents: number;
  forwardHorizonMs: number;
  resolveTimeRemainingMs: (quote: MomentumQuoteInput) => number | null;
  resolveCloseTimeMs?: (quote: MomentumQuoteInput) => number | null;
}): {
  events: MomentumCrossingEvent[];
  rejectedReasons: readonly { timestampMs: number; reasons: readonly string[] }[];
} {
  const sorted = [...input.quotes].sort((a, b) => {
    if (a.timestampMs !== b.timestampMs) return a.timestampMs - b.timestampMs;
    return a.marketTicker.localeCompare(b.marketTicker);
  });

  const events: MomentumCrossingEvent[] = [];
  const rejectedReasons: { timestampMs: number; reasons: readonly string[] }[] = [];
  const inThresholdByMarket = new Map<string, boolean>();
  const historyByMarket = new Map<string, MomentumQuoteInput[]>();

  for (const quote of sorted) {
    const history = historyByMarket.get(quote.marketTicker) ?? [];
    // Deterministic duplicate timestamp handling: keep last quote at a timestamp.
    if (history.length > 0 && history[history.length - 1]!.timestampMs === quote.timestampMs) {
      history[history.length - 1] = quote;
    } else {
      history.push(quote);
    }
    historyByMarket.set(quote.marketTicker, history);

    const eligibility = isEligibleEventQuote(quote);
    if (!eligibility.eligible) {
      rejectedReasons.push({ timestampMs: quote.timestampMs, reasons: eligibility.reasons });
      // Invalid books do not update threshold state.
      continue;
    }

    const priorQuotes = history.slice(0, -1);
    const anchor = resolveBackwardReturnForEvent({
      eventQuote: quote,
      backwardWindowMs: input.backwardWindowMs,
      priorQuotes,
    });
    if (anchor.status === "fail-closed") {
      rejectedReasons.push({ timestampMs: quote.timestampMs, reasons: [anchor.reason] });
      continue;
    }

    const absReturn = Math.abs(anchor.backwardReturnCents);
    const currentlyInThreshold = absReturn >= input.returnThresholdCents;
    const wasInThreshold = inThresholdByMarket.get(quote.marketTicker) ?? false;
    inThresholdByMarket.set(quote.marketTicker, currentlyInThreshold);

    if (!currentlyInThreshold || wasInThreshold) {
      continue;
    }

    if (anchor.backwardReturnCents === 0) {
      continue;
    }

    const timeRemainingMs = input.resolveTimeRemainingMs(quote);
    if (timeRemainingMs == null) {
      rejectedReasons.push({
        timestampMs: quote.timestampMs,
        reasons: ["time remaining unresolvable at event time"],
      });
      continue;
    }

    const closeTimeMs = input.resolveCloseTimeMs?.(quote) ?? null;
    if (closeTimeMs != null && quote.timestampMs >= closeTimeMs) {
      rejectedReasons.push({
        timestampMs: quote.timestampMs,
        reasons: ["close-time crossing forbidden"],
      });
      continue;
    }
    if (
      closeTimeMs != null
      && quote.timestampMs + input.forwardHorizonMs >= closeTimeMs
    ) {
      rejectedReasons.push({
        timestampMs: quote.timestampMs,
        reasons: ["response would cross close time"],
      });
      continue;
    }

    const gates = eventPassesFixedGates({
      quote,
      timeRemainingMs,
      forwardHorizonMs: input.forwardHorizonMs,
    });
    if (!gates.ok) {
      rejectedReasons.push({ timestampMs: quote.timestampMs, reasons: gates.reasons });
      continue;
    }

    const continuationSign: -1 | 1 = anchor.backwardReturnCents > 0 ? 1 : -1;
    const mid = midpointFromQuote(quote);
    if (mid == null) continue;

    events.push({
      marketTicker: quote.marketTicker,
      eventTimestampMs: quote.timestampMs,
      backwardWindowMs: input.backwardWindowMs,
      returnThresholdCents: input.returnThresholdCents,
      forwardHorizonMs: input.forwardHorizonMs,
      backwardReturnCents: anchor.backwardReturnCents,
      continuationSign,
      eventMidCents: mid,
      timeRemainingMs,
      eventFeatures: {
        yesBestBidCents: quote.yesBestBidCents!,
        noBestBidCents: quote.noBestBidCents!,
      },
    });
  }

  return { events, rejectedReasons };
}
