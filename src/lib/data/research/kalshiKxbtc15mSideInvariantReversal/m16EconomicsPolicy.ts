/**
 * Frozen eventual trade policy for M16 — DEFINE NOW, DO NOT EVALUATE in incidence.
 *
 * Scientific null (mean ≤ 0) is sealed conceptually.
 * Confirmatory decision procedure is UNSEALED — M16.1 required before outcome-open.
 */
import {
  deriveNoBestAskCents,
  deriveYesBestAskCents,
  resolveComplementExecutablePrices,
} from "@/lib/data/research/kalshiTobMomentumFamily";

import {
  M16_TARGET_BID_CENTS,
  M16ReversalError,
  type M16CandidateSide,
  type M16ConfirmatoryDecisionProcedureStatus,
  type M16ScientificEconomicNull,
} from "./m16Types";

export type M16TradePolicySpec = {
  entry: "one-contract-candidate-side-executable-ask-at-confirmation";
  upsideTargetBidCents: typeof M16_TARGET_BID_CENTS;
  structuralStop: "first-eligible-candidate-bid-strictly-below-setup-low-L";
  terminalFlatten: "last-eligible-candidate-bid-at-or-before-close";
  settlementFallback:
    "repository-forwardSettlementJoin-only-when-terminal-flatten-unavailable";
  primaryEventualEstimand: "mean-one-contract-fee-adjusted-executable-pnl";
  /** Conceptual null / non-edge region. Not an operable confirmatory test. */
  scientificEconomicNull: M16ScientificEconomicNull;
  /** Decision procedure intentionally unsealed in M16.0. */
  confirmatoryDecisionProcedureStatus: M16ConfirmatoryDecisionProcedureStatus;
  midpointNeverUsedAsFill: true;
  noSearchedStopBuffer: true;
  noAbsolute15CentStop: true;
};

export function buildM16TradePolicySpec(): M16TradePolicySpec {
  return {
    entry: "one-contract-candidate-side-executable-ask-at-confirmation",
    upsideTargetBidCents: M16_TARGET_BID_CENTS,
    structuralStop: "first-eligible-candidate-bid-strictly-below-setup-low-L",
    terminalFlatten: "last-eligible-candidate-bid-at-or-before-close",
    settlementFallback:
      "repository-forwardSettlementJoin-only-when-terminal-flatten-unavailable",
    primaryEventualEstimand: "mean-one-contract-fee-adjusted-executable-pnl",
    scientificEconomicNull: "mean-fee-adjusted-executable-pnl-leq-0-is-non-edge",
    confirmatoryDecisionProcedureStatus:
      "UNSEALED-M16.1-REQUIRED-BEFORE-OUTCOME-OPEN",
    midpointNeverUsedAsFill: true,
    noSearchedStopBuffer: true,
    noAbsolute15CentStop: true,
  };
}

export function candidateSideExecutableAskCents(input: {
  side: M16CandidateSide;
  yesBestBidCents: number;
  noBestBidCents: number;
}): number {
  const exec = resolveComplementExecutablePrices({
    yesBestBidCents: input.yesBestBidCents,
    noBestBidCents: input.noBestBidCents,
  });
  if (input.side === "YES") {
    if (exec.executableBuyYesCents == null) {
      throw new M16ReversalError("YES executable ask unresolvable");
    }
    return exec.executableBuyYesCents;
  }
  if (exec.executableBuyNoCents == null) {
    throw new M16ReversalError("NO executable ask unresolvable");
  }
  return exec.executableBuyNoCents;
}

export function candidateSideExecutableBidCents(input: {
  side: M16CandidateSide;
  yesBestBidCents: number;
  noBestBidCents: number;
}): number {
  if (input.side === "YES") {
    return input.yesBestBidCents;
  }
  return input.noBestBidCents;
}

/** Target: first eligible candidate bid >= 55. */
export function isM16TargetBid(bidCents: number): boolean {
  return bidCents >= M16_TARGET_BID_CENTS;
}

/** Structural stop: candidate bid strictly below setup low L. bid == L does NOT stop. */
export function isM16StructuralStop(input: {
  bidCents: number;
  setupLowLCents: number;
}): boolean {
  return input.bidCents < input.setupLowLCents;
}

export function assertYesAskDerivation(noBestBidCents: number): number {
  return deriveYesBestAskCents(noBestBidCents);
}

export function assertNoAskDerivation(yesBestBidCents: number): number {
  return deriveNoBestAskCents(yesBestBidCents);
}

export type M16SettlementFallbackSpec = {
  modulePath: "src/lib/data/research/forwardSettlementJoin";
  joinKey: "marketTicker";
  plannedPrimaryExit: false;
  missingFlattenWithoutSettlement: "terminal-unobservable";
  neverFabricatePayoffFromLastMidpoint: true;
  note: string;
};

export function buildM16SettlementFallbackSpec(): M16SettlementFallbackSpec {
  return {
    modulePath: "src/lib/data/research/forwardSettlementJoin",
    joinKey: "marketTicker",
    plannedPrimaryExit: false,
    missingFlattenWithoutSettlement: "terminal-unobservable",
    neverFabricatePayoffFromLastMidpoint: true,
    note:
      "Settlement is NOT the planned primary exit. Bind forwardSettlementJoin "
      + "only when terminal flatten cannot be evaluated and governance permits.",
  };
}
