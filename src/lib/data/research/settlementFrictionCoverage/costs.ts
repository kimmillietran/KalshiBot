/**
 * Entry and round-trip displayed-book friction (spread components + fees).
 * Does not include mid drift between entry and exit (not a return / PnL).
 */

import {
  computeKalshiScheduleFeeCents,
  KALSHI_FEE_SCHEDULE_ROLE,
  KALSHI_FEE_SCHEDULE_VARIANT,
} from "@/lib/data/backtesting/costModel/computeKalshiScheduleFeeCents";
import {
  midpointFromQuote,
  resolveComplementExecutablePrices,
  type MomentumQuoteInput,
} from "@/lib/data/research/kalshiTobMomentumFamily";

import { SettlementFrictionCoverageError } from "./types";

export type FrictionQuote = MomentumQuoteInput & {
  yesBestAskCents?: number | null;
  yesBestAskSize?: number | null;
  complementDerivedAsk?: boolean;
};

export type EntryFriction = {
  entryMidCents: number;
  entryYesAskCents: number;
  entryHalfSpreadCents: number;
  entryFeeCents: number;
  entryFrictionCents: number;
  complementDerivedAsk: boolean;
};

export type RoundTripFriction = {
  entry: EntryFriction;
  exitMidCents: number;
  exitYesBidCents: number;
  responseHalfSpreadCents: number;
  exitFeeCents: number;
  /** entryHalf + responseHalf + entryFee + exitFee (excludes mid drift). */
  roundTripFrictionCents: number;
};

export function computeOneContractStandardTakerFeeCents(priceCents: number): number {
  if (!Number.isInteger(priceCents) || priceCents < 0 || priceCents > 100) {
    throw new SettlementFrictionCoverageError(
      `fee priceCents must be integer in [0,100]; got ${priceCents}`,
    );
  }
  return computeKalshiScheduleFeeCents({
    quantity: 1,
    priceCents,
    role: KALSHI_FEE_SCHEDULE_ROLE.TAKER,
    schedule: KALSHI_FEE_SCHEDULE_VARIANT.STANDARD,
  });
}

function resolveYesAsk(quote: FrictionQuote): {
  askCents: number;
  complementDerivedAsk: boolean;
} | null {
  if (
    quote.yesBestAskCents != null
    && Number.isFinite(quote.yesBestAskCents)
  ) {
    return {
      askCents: quote.yesBestAskCents,
      complementDerivedAsk: quote.complementDerivedAsk === true,
    };
  }
  const exec = resolveComplementExecutablePrices({
    yesBestBidCents: quote.yesBestBidCents,
    noBestBidCents: quote.noBestBidCents,
  });
  if (exec.executableBuyYesCents == null) return null;
  return {
    askCents: exec.executableBuyYesCents,
    complementDerivedAsk: true,
  };
}

export function computeEntryFriction(quote: FrictionQuote): EntryFriction | null {
  const mid = midpointFromQuote(quote);
  const ask = resolveYesAsk(quote);
  if (mid == null || ask == null) return null;
  const entryHalfSpreadCents = ask.askCents - mid;
  if (!(entryHalfSpreadCents >= 0)) return null;
  const entryFeeCents = computeOneContractStandardTakerFeeCents(ask.askCents);
  return {
    entryMidCents: mid,
    entryYesAskCents: ask.askCents,
    entryHalfSpreadCents,
    entryFeeCents,
    entryFrictionCents: entryHalfSpreadCents + entryFeeCents,
    complementDerivedAsk: ask.complementDerivedAsk,
  };
}

export function computeRoundTripFriction(input: {
  entryQuote: FrictionQuote;
  exitQuote: FrictionQuote;
}): RoundTripFriction | null {
  const entry = computeEntryFriction(input.entryQuote);
  const exitMid = midpointFromQuote(input.exitQuote);
  const exitExec = resolveComplementExecutablePrices({
    yesBestBidCents: input.exitQuote.yesBestBidCents,
    noBestBidCents: input.exitQuote.noBestBidCents,
  });
  if (
    entry == null
    || exitMid == null
    || exitExec.executableSellYesCents == null
  ) {
    return null;
  }
  const exitYesBidCents = exitExec.executableSellYesCents;
  const responseHalfSpreadCents = exitMid - exitYesBidCents;
  if (!(responseHalfSpreadCents >= 0)) return null;
  const exitFeeCents = computeOneContractStandardTakerFeeCents(exitYesBidCents);
  return {
    entry,
    exitMidCents: exitMid,
    exitYesBidCents,
    responseHalfSpreadCents,
    exitFeeCents,
    roundTripFrictionCents:
      entry.entryHalfSpreadCents
      + responseHalfSpreadCents
      + entry.entryFeeCents
      + exitFeeCents,
  };
}
