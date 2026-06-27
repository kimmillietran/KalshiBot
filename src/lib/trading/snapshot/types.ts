import {
  MarketLifecycle,
  type EvaluationBtcSnapshot,
  type EvaluationMarketSnapshot,
  type EvaluationPricingSnapshot,
  type EvaluationSnapshot,
} from "@/types/domain/trading";

export { MarketLifecycle };
export type { EvaluationMarketSnapshot, EvaluationSnapshot };

export function hasMarket(
  snapshot: EvaluationSnapshot,
): snapshot is EvaluationSnapshot & {
  market: EvaluationMarketSnapshot;
} {
  return snapshot.market !== null;
}

export function isActiveLifecycle(lifecycle: MarketLifecycle): boolean {
  return lifecycle === MarketLifecycle.ACTIVE;
}

export function hasStrike(market: EvaluationMarketSnapshot): boolean {
  return (
    market.strikePrice !== null &&
    Number.isFinite(market.strikePrice) &&
    market.strikePrice > 0
  );
}

export function hasBtcSpot(
  snapshot: EvaluationSnapshot,
): snapshot is EvaluationSnapshot & { btc: EvaluationBtcSnapshot } {
  return (
    snapshot.btc !== null &&
    Number.isFinite(snapshot.btc.price) &&
    snapshot.btc.price > 0
  );
}

export function hasContractPricing(
  snapshot: EvaluationSnapshot,
): snapshot is EvaluationSnapshot & { pricing: EvaluationPricingSnapshot } {
  if (snapshot.pricing === null) {
    return false;
  }

  const { yesMidCents, noMidCents, yesBidCents, yesAskCents } =
    snapshot.pricing;

  return (
    yesMidCents !== null ||
    noMidCents !== null ||
    (yesBidCents !== null && yesAskCents !== null)
  );
}
