/**
 * One-taker-fee hold-to-settlement economics for M17 NO entries.
 * Used only when a frozen entry rule authorizes simulation.
 */

import { computeKalshiScheduleFeeCents } from "@/lib/data/backtesting/costModel/computeKalshiScheduleFeeCents";
import {
  KALSHI_FEE_SCHEDULE_ROLE,
  KALSHI_FEE_SCHEDULE_VARIANT,
} from "@/lib/data/backtesting/costModel/computeKalshiScheduleFeeCents";

export function computeOneStandardTakerFeeCents(entryPriceCents: number): number {
  return computeKalshiScheduleFeeCents({
    priceCents: entryPriceCents,
    quantity: 1,
    role: KALSHI_FEE_SCHEDULE_ROLE.TAKER,
    schedule: KALSHI_FEE_SCHEDULE_VARIANT.STANDARD,
  });
}

/**
 * Gross hold-to-settlement P&L for buying NO at executable ask.
 * Wins when official result is NO: (100 - entryAsk) ; else -entryAsk.
 */
export function computeNoHoldToSettlementGrossReturnCents(input: {
  noAskCents: number;
  settledOutcome: "yes" | "no";
}): number {
  if (!(input.noAskCents > 0) || !Number.isFinite(input.noAskCents)) {
    throw new Error("noAskCents must be a finite positive number");
  }
  return input.settledOutcome === "no"
    ? 100 - input.noAskCents
    : -input.noAskCents;
}

export function computeNoHoldToSettlementFeeAdjustedReturnCents(input: {
  noAskCents: number;
  settledOutcome: "yes" | "no";
}): {
  grossReturnCents: number;
  feeCents: number;
  feeAdjustedReturnCents: number;
} {
  const grossReturnCents = computeNoHoldToSettlementGrossReturnCents(input);
  const feeCents = computeOneStandardTakerFeeCents(input.noAskCents);
  return {
    grossReturnCents,
    feeCents,
    feeAdjustedReturnCents: grossReturnCents - feeCents,
  };
}
