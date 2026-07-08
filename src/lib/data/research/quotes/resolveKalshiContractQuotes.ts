export type KalshiContractQuoteStatus =
  | "complete"
  | "derived-no-side"
  | "invalid-yes-spread"
  | "invalid-no-spread"
  | "missing-yes-quotes";

export type ResolvedKalshiContractQuotes = {
  yesBidCents: number;
  yesAskCents: number;
  noBidCents: number;
  noAskCents: number;
  noSideDerived: boolean;
  quoteStatus: KalshiContractQuoteStatus;
  validationFlags: readonly string[];
};

function isValidCents(value: number | undefined): value is number {
  return (
    typeof value === "number"
    && Number.isFinite(value)
    && Number.isInteger(value)
    && value >= 0
    && value <= 100
  );
}

/** Resolves YES/NO contract quotes with Kalshi complement derivation when needed. */
export function resolveKalshiContractQuotes(input: {
  yesBidCents?: number;
  yesAskCents?: number;
  noBidCents?: number;
  noAskCents?: number;
}): ResolvedKalshiContractQuotes | null {
  if (!isValidCents(input.yesBidCents) || !isValidCents(input.yesAskCents)) {
    return null;
  }

  const flags: string[] = [];
  const noSideDerived =
    input.noBidCents === undefined || input.noAskCents === undefined;
  const noBidCents = input.noBidCents ?? 100 - input.yesAskCents;
  const noAskCents = input.noAskCents ?? 100 - input.yesBidCents;

  if (noSideDerived) {
    flags.push("no-side-derived-from-yes-complement");
  }

  let quoteStatus: KalshiContractQuoteStatus = "complete";
  if (input.yesBidCents > input.yesAskCents) {
    quoteStatus = "invalid-yes-spread";
    flags.push("yes-bid-greater-than-yes-ask");
  } else if (!isValidCents(noBidCents) || !isValidCents(noAskCents)) {
    quoteStatus = "missing-yes-quotes";
    flags.push("derived-no-quotes-invalid");
  } else if (noBidCents > noAskCents) {
    quoteStatus = "invalid-no-spread";
    flags.push("no-bid-greater-than-no-ask");
  } else if (noSideDerived) {
    quoteStatus = "derived-no-side";
  }

  return {
    yesBidCents: input.yesBidCents,
    yesAskCents: input.yesAskCents,
    noBidCents,
    noAskCents,
    noSideDerived,
    quoteStatus,
    validationFlags: flags,
  };
}
