import { resolveComplementExecutablePrices } from "./complementBookSemantics";
import {
  RESPONSE_MATCH_TOLERANCE_MS,
  TIMESTAMP_POLICY,
  type ResponseMatchContract,
  type ResponseObservationResult,
  type TobImbalanceQuoteInput,
} from "./microstructureFamilyTypes";

export function buildResponseMatchContract(): ResponseMatchContract {
  return {
    timestampPolicy: TIMESTAMP_POLICY,
    responseMatchToleranceMs: RESPONSE_MATCH_TOLERANCE_MS,
    matchingRule: "first-quote-at-or-after-target-within-tolerance",
    missingResponseSemantics: "response-unobservable",
    missingResponseIsNotZeroMovement: true,
    leadLagToleranceNotReused: true,
    rationale:
      "Lead-lag's 1500ms response tolerance exceeds the 1-second microstructure horizon and is "
      + "not reused. Matching uses the first quote at-or-after eventTime+H within a fixed 250ms "
      + "tolerance under kalshi-resolved-timestamp-ms. Missing matches are response-unobservable, "
      + "never zero movement.",
  };
}

export function midpointYesCents(quote: TobImbalanceQuoteInput): number | null {
  const ask =
    quote.noBestBidCents != null && Number.isFinite(quote.noBestBidCents)
      ? 100 - quote.noBestBidCents
      : null;
  if (
    quote.yesBestBidCents == null
    || ask == null
    || !Number.isFinite(quote.yesBestBidCents)
    || !Number.isFinite(ask)
  ) {
    return null;
  }
  return (quote.yesBestBidCents + ask) / 2;
}

/**
 * Deterministic short-horizon quote match for H ∈ {1s,5s,15s}.
 * Response quotes must be strictly after event time (target = event + H ≥ event + 1000).
 */
export function matchResponseQuote(input: {
  eventTimestampMs: number;
  responseHorizonMs: number;
  responseQuotes: readonly TobImbalanceQuoteInput[];
  closeTimeMs?: number | null;
  toleranceMs?: number;
}): ResponseObservationResult {
  const toleranceMs = input.toleranceMs ?? RESPONSE_MATCH_TOLERANCE_MS;
  const targetMs = input.eventTimestampMs + input.responseHorizonMs;
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
  let matched: TobImbalanceQuoteInput | null = null;
  for (const quote of sorted) {
    if (quote.timestampMs <= input.eventTimestampMs) {
      continue;
    }
    if (quote.timestampMs < targetMs) {
      continue;
    }
    if (quote.timestampMs > upperBound) {
      break;
    }
    matched = quote;
    break;
  }

  if (matched == null) {
    return {
      status: "response-unobservable",
      reason:
        `no quote at-or-after ${targetMs} within +${toleranceMs}ms `
        + `(missing is not zero movement)`,
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
    midpointResponseCents: midpointYesCents(matched),
    executableBuyYesCents: executable.executableBuyYesCents,
    executableSellYesCents: executable.executableSellYesCents,
  };
}

/**
 * Gross one-contract executable P&L under complement-book semantics.
 * Does not invent fees; fee-adjusted support must be defined before promotion.
 */
export function computeGrossExecutableOneContractPnlCents(input: {
  predictedYesRepricingSign: -1 | 1;
  entryBuyYesCents: number;
  entrySellYesCents: number;
  exitBuyYesCents: number;
  exitSellYesCents: number;
}): number {
  // Same-direction: positive imbalance → expect YES up → buy YES at entry ask, sell at exit bid.
  if (input.predictedYesRepricingSign > 0) {
    return input.exitSellYesCents - input.entryBuyYesCents;
  }
  // Negative imbalance → expect YES down → sell YES at entry bid, buy back at exit ask.
  return input.entrySellYesCents - input.exitBuyYesCents;
}
