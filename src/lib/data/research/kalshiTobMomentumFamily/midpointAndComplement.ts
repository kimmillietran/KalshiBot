import type { ComplementBookSemantics, MomentumQuoteInput } from "./momentumFamilyTypes";
import { MomentumFamilyError, MIDPOINT_FORMULA } from "./momentumFamilyTypes";

export function buildComplementBookSemantics(): ComplementBookSemantics {
  return {
    capturedFields: [
      "yesBestBidCents",
      "noBestBidCents",
      "yesBestBidSize",
      "noBestBidSize",
    ],
    derivedYesAskCentsRule: "100 - noBestBidCents",
    derivedNoAskCentsRule: "100 - yesBestBidCents",
    derivedYesAskSizeRule: "noBestBidSize",
    askSideIndependentlyCaptured: false,
    note:
      "Observed YES bid and NO bid only. YES ask = 100 - NO bid and NO ask = 100 - YES bid "
      + "are complement transformations, not independently captured exchange asks. "
      + "Do not infer cancel flow, trade flow, or true depth.",
  };
}

export function deriveYesBestAskCents(noBestBidCents: number): number {
  return 100 - noBestBidCents;
}

export function deriveNoBestAskCents(yesBestBidCents: number): number {
  return 100 - yesBestBidCents;
}

export function yesMidCents(input: {
  yesBestBidCents: number;
  noBestBidCents: number;
}): number {
  const yesAsk = deriveYesBestAskCents(input.noBestBidCents);
  const fromBidAsk = (input.yesBestBidCents + yesAsk) / 2;
  const equivalent = 50 + (input.yesBestBidCents - input.noBestBidCents) / 2;
  if (Math.abs(fromBidAsk - equivalent) > 1e-9) {
    throw new MomentumFamilyError(
      `Midpoint complement identity failed: ${fromBidAsk} vs ${equivalent} (${MIDPOINT_FORMULA})`,
    );
  }
  return fromBidAsk;
}

export function midpointFromQuote(quote: MomentumQuoteInput): number | null {
  if (
    quote.yesBestBidCents == null
    || quote.noBestBidCents == null
    || !Number.isFinite(quote.yesBestBidCents)
    || !Number.isFinite(quote.noBestBidCents)
  ) {
    return null;
  }
  return yesMidCents({
    yesBestBidCents: quote.yesBestBidCents,
    noBestBidCents: quote.noBestBidCents,
  });
}

export function resolveComplementExecutablePrices(input: {
  yesBestBidCents: number | null;
  noBestBidCents: number | null;
}): {
  yesBestAskCents: number | null;
  noBestAskCents: number | null;
  executableBuyYesCents: number | null;
  executableSellYesCents: number | null;
  executableBuyNoCents: number | null;
  executableSellNoCents: number | null;
} {
  const yesBestAskCents =
    input.noBestBidCents != null && Number.isFinite(input.noBestBidCents)
      ? deriveYesBestAskCents(input.noBestBidCents)
      : null;
  const noBestAskCents =
    input.yesBestBidCents != null && Number.isFinite(input.yesBestBidCents)
      ? deriveNoBestAskCents(input.yesBestBidCents)
      : null;
  return {
    yesBestAskCents,
    noBestAskCents,
    executableBuyYesCents: yesBestAskCents,
    executableSellYesCents: input.yesBestBidCents,
    executableBuyNoCents: noBestAskCents,
    executableSellNoCents: input.noBestBidCents,
  };
}

export function assertNoBtcFields(record: Record<string, unknown>): void {
  const forbidden = Object.keys(record).filter((key) => /btc/i.test(key));
  if (forbidden.length > 0) {
    throw new MomentumFamilyError(
      `BTC fields are forbidden in the Kalshi-native momentum family; found: ${forbidden.join(", ")}`,
    );
  }
}

export function assertBtcCannotEnterCandidateDefinition(
  candidate: Record<string, unknown>,
): void {
  assertNoBtcFields(candidate);
  for (const value of Object.values(candidate)) {
    if (typeof value === "string" && /btc/i.test(value) && !/kalshi/i.test(value)) {
      throw new MomentumFamilyError(
        `BTC cannot enter momentum candidate definition; found value=${value}`,
      );
    }
  }
}
