import {
  RESPONSE_MATCH_TOLERANCE_MS,
  TIMESTAMP_POLICY,
  type MomentumQuoteInput,
  type ResponseMatchContract,
  type ResponseObservationResult,
} from "./momentumFamilyTypes";
import { midpointFromQuote, resolveComplementExecutablePrices } from "./midpointAndComplement";

export function buildResponseMatchContract(): ResponseMatchContract {
  return {
    timestampPolicy: TIMESTAMP_POLICY,
    responseMatchToleranceMs: RESPONSE_MATCH_TOLERANCE_MS,
    matchingRule: "first-eligible-quote-in-[t+H, t+H+tolerance]-strictly-after-t",
    missingResponseSemantics: "response-unobservable",
    missingResponseIsNotZeroMovement: true,
  };
}

/**
 * Response quote: first eligible quote in [t+H, t+H+250ms], strictly after t.
 * Missing → response-unobservable (never zero).
 */
export function matchResponseQuote(input: {
  eventTimestampMs: number;
  forwardHorizonMs: number;
  responseQuotes: readonly MomentumQuoteInput[];
  closeTimeMs?: number | null;
  toleranceMs?: number;
}): ResponseObservationResult {
  const toleranceMs = input.toleranceMs ?? RESPONSE_MATCH_TOLERANCE_MS;
  const targetMs = input.eventTimestampMs + input.forwardHorizonMs;
  if (!(targetMs > input.eventTimestampMs)) {
    return {
      status: "response-unobservable",
      reason: "response target must be strictly after event time",
    };
  }

  const upperBound =
    input.closeTimeMs != null
      ? Math.min(targetMs + toleranceMs, input.closeTimeMs)
      : targetMs + toleranceMs;

  const sorted = [...input.responseQuotes].sort((a, b) => a.timestampMs - b.timestampMs);
  let matched: MomentumQuoteInput | null = null;
  for (const quote of sorted) {
    if (quote.timestampMs <= input.eventTimestampMs) continue;
    if (quote.timestampMs < targetMs) continue;
    if (quote.timestampMs > upperBound) break;
    matched = quote;
    break;
  }

  if (matched == null) {
    // Quotes exist but beyond tolerance → unobservable (not zero).
    const beyond = sorted.find(
      (quote) =>
        quote.timestampMs > input.eventTimestampMs
        && quote.timestampMs > targetMs + toleranceMs,
    );
    return {
      status: "response-unobservable",
      reason: beyond
        ? `forward mismatch beyond +${toleranceMs}ms is unobservable (not zero)`
        : `no quote at-or-after ${targetMs} within +${toleranceMs}ms (missing is not zero)`,
    };
  }

  const executable = resolveComplementExecutablePrices({
    yesBestBidCents: matched.yesBestBidCents,
    noBestBidCents: matched.noBestBidCents,
  });

  return {
    status: "observed",
    matchedQuoteTimestampMs: matched.timestampMs,
    matchErrorMs: matched.timestampMs - targetMs,
    midpointCents: midpointFromQuote(matched),
    executableBuyYesCents: executable.executableBuyYesCents,
    executableSellYesCents: executable.executableSellYesCents,
  };
}
