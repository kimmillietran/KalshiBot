import {
  MarketLifecycle,
  type EvaluationMarketSnapshot,
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
