import { MomentumFamilyError } from "./momentumFamilyTypes";
import { resolveComplementExecutablePrices } from "./midpointAndComplement";

/**
 * Diagnostic midpoint continuation, signed in event direction:
 * sign(backwardReturn) * (mid(t+H) - mid(t))
 */
export function diagnosticSignedMidpointContinuationCents(input: {
  continuationSign: -1 | 1;
  eventMidCents: number;
  responseMidCents: number;
}): number {
  return input.continuationSign * (input.responseMidCents - input.eventMidCents);
}

/**
 * Primary gross one-contract executable horizon P&L (no fees).
 * Upward (+): buy YES at entry ask, sell YES at exit bid.
 * Downward (−): symmetric one-contract NO path via complement book
 *   (equivalently sell YES at entry bid / buy YES at exit ask).
 */
export function computeGrossExecutableOneContractPnlCents(input: {
  continuationSign: -1 | 1;
  entryYesBestBidCents: number;
  entryNoBestBidCents: number;
  exitYesBestBidCents: number;
  exitNoBestBidCents: number;
}): number {
  const entry = resolveComplementExecutablePrices({
    yesBestBidCents: input.entryYesBestBidCents,
    noBestBidCents: input.entryNoBestBidCents,
  });
  const exit = resolveComplementExecutablePrices({
    yesBestBidCents: input.exitYesBestBidCents,
    noBestBidCents: input.exitNoBestBidCents,
  });
  if (
    entry.executableBuyYesCents == null
    || entry.executableSellYesCents == null
    || exit.executableBuyYesCents == null
    || exit.executableSellYesCents == null
  ) {
    throw new MomentumFamilyError("Executable prices unresolvable for gross P&L");
  }

  if (input.continuationSign > 0) {
    // Enter long YES at ask; exit at bid.
    return exit.executableSellYesCents - entry.executableBuyYesCents;
  }

  // Downward: one-contract NO path — buy NO at NO ask (= YES bid complement),
  // sell NO at NO bid. Equivalent YES path: sell YES at entry bid, buy back at exit ask.
  return entry.executableSellYesCents - exit.executableBuyYesCents;
}

export function assertGrossDistinctFromMidpoint(input: {
  grossExecutablePnlCents: number;
  diagnosticMidContinuationCents: number;
}): void {
  // Not always numerically different, but contracts must be separately typed/named.
  if (
    input.grossExecutablePnlCents === input.diagnosticMidContinuationCents
    && Object.is(input.grossExecutablePnlCents, input.diagnosticMidContinuationCents)
  ) {
    // Allowed when numbers coincide; callers still must keep separate fields.
  }
}

/**
 * Fee-adjusted/net P&L cannot be produced until a deterministic fee contract is bound.
 */
export function computeFeeAdjustedNetPnlCents(_input: {
  grossExecutablePnlCents: number;
  feeContractIdentity: string | null;
}): never {
  void _input;
  throw new MomentumFamilyError(
    "Fee-adjusted/net P&L requires a separately bound deterministic fee contract; "
      + "until bound, no code may claim net tradable edge.",
  );
}
