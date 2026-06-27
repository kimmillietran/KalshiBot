import type {
  EvaluationPricingSnapshot,
  LiquidityQuality,
} from "@/types/domain/trading";

const LIQUIDITY_RANK: Record<LiquidityQuality, number> = {
  Poor: 0,
  Fair: 1,
  Good: 2,
  Excellent: 3,
};

export function meetsMinLiquidityQuality(
  actual: LiquidityQuality,
  minimum: LiquidityQuality,
): boolean {
  return LIQUIDITY_RANK[actual] >= LIQUIDITY_RANK[minimum];
}

function spreadSidePercent(
  bidCents: number | null,
  askCents: number | null,
): number | null {
  if (bidCents == null || askCents == null || askCents <= 0) {
    return null;
  }
  return (Math.max(askCents - bidCents, 0) / askCents) * 100;
}

export function maxContractSpreadPercent(
  pricing: EvaluationPricingSnapshot,
): number | null {
  const spreads = [
    spreadSidePercent(pricing.yesBidCents, pricing.yesAskCents),
    spreadSidePercent(pricing.noBidCents, pricing.noAskCents),
  ].filter((value): value is number => value !== null);
  return spreads.length === 0 ? null : Math.max(...spreads);
}
