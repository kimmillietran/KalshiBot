import {
  computeKalshiScheduleFeeCents,
  KALSHI_FEE_SCHEDULE_ROLE,
  KALSHI_FEE_SCHEDULE_VARIANT,
} from "@/lib/data/backtesting/costModel/computeKalshiScheduleFeeCents";

import type { FeeSmokeCheckSummary } from "./quoteFidelityGateTypes";

export function computeFeeSmokeCheck(): FeeSmokeCheckSummary {
  const sampleYesAskCents = 50;
  const sampleNoAskCents = 50;
  const sampleContractPriceCents = sampleYesAskCents;

  const sampleYesFeeCents = computeKalshiScheduleFeeCents({
    quantity: 1,
    priceCents: sampleYesAskCents,
    role: KALSHI_FEE_SCHEDULE_ROLE.TAKER,
    schedule: KALSHI_FEE_SCHEDULE_VARIANT.STANDARD,
  });
  const sampleNoFeeCents = computeKalshiScheduleFeeCents({
    quantity: 1,
    priceCents: sampleNoAskCents,
    role: KALSHI_FEE_SCHEDULE_ROLE.TAKER,
    schedule: KALSHI_FEE_SCHEDULE_VARIANT.STANDARD,
  });

  const grossCostCents = sampleYesAskCents + sampleNoAskCents;
  const totalFeesCents = sampleYesFeeCents + sampleNoFeeCents;
  const zeroSpreadParityNetEdgeCents = 100 - grossCostCents - totalFeesCents;

  return {
    feeHelperPath: "src/lib/data/backtesting/costModel/computeKalshiScheduleFeeCents.ts",
    feeSchedule: KALSHI_FEE_SCHEDULE_VARIANT.STANDARD,
    sampleContractPriceCents,
    sampleYesAskCents,
    sampleNoAskCents,
    sampleYesFeeCents,
    sampleNoFeeCents,
    zeroSpreadParityNetEdgeCents,
    buyBothParityProfitableAfterFees: zeroSpreadParityNetEdgeCents > 0,
  };
}
