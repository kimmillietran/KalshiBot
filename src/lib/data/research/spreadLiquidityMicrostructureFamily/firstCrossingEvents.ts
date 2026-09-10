import { computeTobSizeImbalance, predictedYesRepricingSign } from "./imbalance";
import { isEligibleEventQuote } from "./eligibility";
import { classifyTimeRemainingBin } from "./enumerateUniverse";
import type {
  TobImbalanceQuoteInput,
} from "./microstructureFamilyTypes";

export type TobImbalanceCrossingEvent = {
  marketTicker: string;
  eventTimestampMs: number;
  imbalance: number;
  imbalanceSign: -1 | 1;
  predictedYesRepricingSign: -1 | 1;
  imbalanceThresholdAbs: number;
  timeRemainingBin: "under-5-minutes" | "5-to-15-minutes";
  timeRemainingMs: number;
  /** Event features only — never response-window fields. */
  eventFeatures: {
    yesBestBidSize: number;
    noBestBidSize: number;
    yesBestBidCents: number;
    noBestBidCents: number;
  };
};

/**
 * First-crossing detection uses only quote information at or before each quote's
 * own timestamp. Response quotes must not be supplied into this function.
 */
export function detectFirstImbalanceCrossings(input: {
  quotes: readonly TobImbalanceQuoteInput[];
  imbalanceThresholdAbs: number;
  /** Required for time-remaining classification; must be known at event time. */
  resolveTimeRemainingMs: (quote: TobImbalanceQuoteInput) => number | null;
}): {
  events: TobImbalanceCrossingEvent[];
  rejectedReasons: readonly { timestampMs: number; reasons: readonly string[] }[];
} {
  const sorted = [...input.quotes].sort((a, b) => {
    if (a.timestampMs !== b.timestampMs) {
      return a.timestampMs - b.timestampMs;
    }
    return a.marketTicker.localeCompare(b.marketTicker);
  });

  const events: TobImbalanceCrossingEvent[] = [];
  const rejectedReasons: { timestampMs: number; reasons: readonly string[] }[] = [];
  /** Per market: whether the prior eligible quote was already inside the threshold band. */
  const inThresholdByMarket = new Map<string, boolean>();

  for (const quote of sorted) {
    const eligibility = isEligibleEventQuote(quote);
    if (!eligibility.eligible) {
      rejectedReasons.push({ timestampMs: quote.timestampMs, reasons: eligibility.reasons });
      // Invalid/resync books do not update threshold state (cannot create events).
      continue;
    }

    const imbalanceResult = computeTobSizeImbalance({
      yesBestBidSize: quote.yesBestBidSize,
      noBestBidSize: quote.noBestBidSize,
    });
    if (!imbalanceResult.ok) {
      rejectedReasons.push({
        timestampMs: quote.timestampMs,
        reasons: [imbalanceResult.reason],
      });
      continue;
    }

    const absImbalance = Math.abs(imbalanceResult.imbalance);
    const currentlyInThreshold = absImbalance >= input.imbalanceThresholdAbs;
    const wasInThreshold = inThresholdByMarket.get(quote.marketTicker) ?? false;
    inThresholdByMarket.set(quote.marketTicker, currentlyInThreshold);

    if (!currentlyInThreshold || wasInThreshold) {
      continue;
    }

    if (imbalanceResult.sign === 0) {
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
    const timeRemainingBin = classifyTimeRemainingBin(timeRemainingMs);
    if (timeRemainingBin == null) {
      rejectedReasons.push({
        timestampMs: quote.timestampMs,
        reasons: [`time remaining ${timeRemainingMs}ms outside permitted bins`],
      });
      continue;
    }

    const predicted = predictedYesRepricingSign(imbalanceResult.sign);
    if (predicted === 0) {
      continue;
    }

    events.push({
      marketTicker: quote.marketTicker,
      eventTimestampMs: quote.timestampMs,
      imbalance: imbalanceResult.imbalance,
      imbalanceSign: imbalanceResult.sign,
      predictedYesRepricingSign: predicted,
      imbalanceThresholdAbs: input.imbalanceThresholdAbs,
      timeRemainingBin,
      timeRemainingMs,
      eventFeatures: {
        yesBestBidSize: quote.yesBestBidSize!,
        noBestBidSize: quote.noBestBidSize!,
        yesBestBidCents: quote.yesBestBidCents!,
        noBestBidCents: quote.noBestBidCents!,
      },
    });
  }

  return { events, rejectedReasons };
}
