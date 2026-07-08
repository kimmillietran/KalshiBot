import {
  maxSpreadSidePercent,
} from "@/lib/features/contractPricing";
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

export function maxContractSpreadPercent(
  pricing: EvaluationPricingSnapshot,
): number | null {
  return maxSpreadSidePercent(pricing);
}
