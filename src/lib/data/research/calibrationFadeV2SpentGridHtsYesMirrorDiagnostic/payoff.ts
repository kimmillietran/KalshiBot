import {
  computeEntryTakerFeeCents,
  computeHoldToSettlementPnl,
} from "../calibrationFadeV2SpentGridHtsExploratory/payoff";

/**
 * YES hold-to-settlement gross/net at observed yesAskCents.
 * Payout 100 if result=="yes", else 0 → gross = 100-yesAsk or -yesAsk.
 */
export function computeYesHoldToSettlementPnl(input: {
  yesAskCents: number;
  settlementResult: "yes" | "no";
  entryFeeCents: number;
}): { grossPnlCents: number; netPnlCents: number } {
  const grossPnlCents =
    input.settlementResult === "yes"
      ? 100 - input.yesAskCents
      : -input.yesAskCents;
  return {
    grossPnlCents,
    netPnlCents: grossPnlCents - input.entryFeeCents,
  };
}

/**
 * Paired identity (exact cents):
 * yesNet + noNet = -(yesAsk - yesBid) - yesFee - noFee
 * when noAsk == 100 - yesBid and both sides share the same binary settlement.
 */
export function pairedSideIdentityResidualCents(input: {
  yesBidCents: number;
  yesAskCents: number;
  noAskCents: number;
  yesFeeCents: number;
  noFeeCents: number;
  yesNetPnlCents: number;
  noNetPnlCents: number;
}): number {
  if (input.noAskCents !== 100 - input.yesBidCents) {
    return Number.NaN;
  }
  const lhs = input.yesNetPnlCents + input.noNetPnlCents;
  const rhs =
    -(input.yesAskCents - input.yesBidCents)
    - input.yesFeeCents
    - input.noFeeCents;
  return lhs - rhs;
}

export function verifyNoSideTradeConsistent(input: {
  noAskCents: number;
  settlementResult: "yes" | "no";
  entryFeeCents: number;
  grossPnlCents: number;
  netPnlCents: number;
}): boolean {
  const fee = computeEntryTakerFeeCents(input.noAskCents);
  if (fee !== input.entryFeeCents) return false;
  const pnl = computeHoldToSettlementPnl({
    noAskCents: input.noAskCents,
    settlementResult: input.settlementResult,
    entryFeeCents: fee,
  });
  return (
    pnl.grossPnlCents === input.grossPnlCents
    && pnl.netPnlCents === input.netPnlCents
  );
}

export function classifyYesAskSize(
  yesAskSize: number | null | undefined,
): "ok-ge-1" | "known-insufficient" | "missing" {
  if (yesAskSize == null || !Number.isFinite(yesAskSize)) return "missing";
  if (yesAskSize >= 1) return "ok-ge-1";
  return "known-insufficient";
}
