import type { ComplementBookSemantics, TobImbalanceQuoteInput } from "./microstructureFamilyTypes";

export function buildComplementBookSemantics(): ComplementBookSemantics {
  return {
    capturedFields: [
      "yesBestBidCents",
      "noBestBidCents",
      "yesBestBidSize",
      "noBestBidSize",
    ],
    derivedYesAskCentsRule: "100 - noBestBidCents",
    derivedYesAskSizeRule: "noBestBidSize",
    askSideIndependentlyCaptured: false,
    sizeDecreaseIsNotCancellationOrTradeOrWithdrawal: true,
    note:
      "KalshiBot captures a legacy bid-only complement representation. "
      + "yesBestAskCents = 100 - noBestBidCents and yesBestAskSize = noBestBidSize are "
      + "complement transformations of the opposite bid ladder, not independently captured "
      + "exchange asks. TOB size decreases must not be described as cancellations, trade flow, "
      + "or true liquidity withdrawal.",
  };
}

export function deriveYesBestAskCents(noBestBidCents: number): number {
  return 100 - noBestBidCents;
}

export function deriveYesBestAskSize(noBestBidSize: number): number {
  return noBestBidSize;
}

export function resolveComplementExecutablePrices(input: {
  yesBestBidCents: number | null;
  noBestBidCents: number | null;
}): {
  executableBuyYesCents: number | null;
  executableSellYesCents: number | null;
  yesBestAskCents: number | null;
} {
  const yesBestAskCents =
    input.noBestBidCents != null && Number.isFinite(input.noBestBidCents)
      ? deriveYesBestAskCents(input.noBestBidCents)
      : null;
  return {
    yesBestAskCents,
    // Buy YES at the complement-derived ask; sell YES at the captured yes bid.
    executableBuyYesCents: yesBestAskCents,
    executableSellYesCents: input.yesBestBidCents,
  };
}

export function assertNoBtcFields(record: Record<string, unknown>): void {
  const forbidden = Object.keys(record).filter((key) => /btc/i.test(key));
  if (forbidden.length > 0) {
    throw new Error(
      `BTC fields are forbidden in the microstructure family; found: ${forbidden.join(", ")}`,
    );
  }
}

export function quoteHasForbiddenBtcShape(quote: TobImbalanceQuoteInput & Record<string, unknown>): boolean {
  return Object.keys(quote).some((key) => /btc/i.test(key));
}
