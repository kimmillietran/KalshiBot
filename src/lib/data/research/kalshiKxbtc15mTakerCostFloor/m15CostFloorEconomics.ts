/**
 * Round-trip taker cost-floor economics under legacy-no-leg complement books.
 *
 * Canonical representation: YES taker round trip.
 * Under complement identity, NO round-trip friction is mathematically redundant
 * (same half-spreads / same mid); do not double-count as independent evidence.
 */
import {
  midpointFromQuote,
  resolveComplementExecutablePrices,
  type MomentumQuoteInput,
} from "@/lib/data/research/kalshiTobMomentumFamily";

import { computeM15OneContractTakerFeeCents } from "./m15FeeApplication";
import { M15CostFloorError } from "./m15CostFloorTypes";

export type M15RoundTripHurdle = {
  entryMidCents: number;
  exitMidCents: number;
  entryYesAskCents: number;
  exitYesBidCents: number;
  /** (ask_t − mid_t) + (mid_{t+H} − bid_{t+H}) */
  spreadOnlyHurdleCents: number;
  entryFeeCents: number;
  exitFeeCents: number;
  totalFeeCents: number;
  feeInclusiveHurdleCents: number;
  /**
   * Required favorable midpoint move (cents) to break even on the round trip
   * before requiring positive expected profit. Equals feeInclusiveHurdleCents.
   */
  requiredFavorableMidMoveCents: number;
};

/**
 * Prove YES/NO half-spread identity at a single quote under complement books.
 */
export function complementHalfSpreadCents(quote: MomentumQuoteInput): number | null {
  const mid = midpointFromQuote(quote);
  const exec = resolveComplementExecutablePrices({
    yesBestBidCents: quote.yesBestBidCents,
    noBestBidCents: quote.noBestBidCents,
  });
  if (
    mid == null
    || exec.executableBuyYesCents == null
    || exec.executableSellYesCents == null
    || exec.executableBuyNoCents == null
    || exec.executableSellNoCents == null
  ) {
    return null;
  }
  const yesHalf = exec.executableBuyYesCents - mid;
  const noHalf = exec.executableBuyNoCents - (100 - mid);
  // NO mid = 100 - YES mid; NO ask - NO mid should equal YES ask - YES mid.
  if (Math.abs(yesHalf - noHalf) > 1e-9) {
    throw new M15CostFloorError(
      `YES/NO half-spread asymmetry under complement books: yes=${yesHalf} no=${noHalf}`,
    );
  }
  return yesHalf;
}

/**
 * Spread-only + fee-inclusive YES taker round-trip hurdle.
 * Missing/invalid books → null (caller marks unobservable).
 */
export function computeYesTakerRoundTripHurdle(input: {
  entryQuote: MomentumQuoteInput;
  exitQuote: MomentumQuoteInput;
}): M15RoundTripHurdle | null {
  const entryMid = midpointFromQuote(input.entryQuote);
  const exitMid = midpointFromQuote(input.exitQuote);
  const entryExec = resolveComplementExecutablePrices({
    yesBestBidCents: input.entryQuote.yesBestBidCents,
    noBestBidCents: input.entryQuote.noBestBidCents,
  });
  const exitExec = resolveComplementExecutablePrices({
    yesBestBidCents: input.exitQuote.yesBestBidCents,
    noBestBidCents: input.exitQuote.noBestBidCents,
  });
  if (
    entryMid == null
    || exitMid == null
    || entryExec.executableBuyYesCents == null
    || exitExec.executableSellYesCents == null
  ) {
    return null;
  }

  const entryYesAskCents = entryExec.executableBuyYesCents;
  const exitYesBidCents = exitExec.executableSellYesCents;
  const spreadOnlyHurdleCents =
    (entryYesAskCents - entryMid) + (exitMid - exitYesBidCents);
  const entryFeeCents = computeM15OneContractTakerFeeCents(entryYesAskCents);
  const exitFeeCents = computeM15OneContractTakerFeeCents(exitYesBidCents);
  const totalFeeCents = entryFeeCents + exitFeeCents;
  const feeInclusiveHurdleCents = spreadOnlyHurdleCents + totalFeeCents;

  return {
    entryMidCents: entryMid,
    exitMidCents: exitMid,
    entryYesAskCents,
    exitYesBidCents,
    spreadOnlyHurdleCents,
    entryFeeCents,
    exitFeeCents,
    totalFeeCents,
    feeInclusiveHurdleCents,
    requiredFavorableMidMoveCents: feeInclusiveHurdleCents,
  };
}
