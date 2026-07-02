import {
  ExecutionCostModelError,
  ExecutionCostModelErrorCode,
} from "./executionCostModelErrors";
import type {
  KalshiFeeScheduleRole,
  KalshiFeeScheduleVariant,
} from "./executionCostModelTypes";

export const KALSHI_FEE_SCHEDULE_ROLE = {
  TAKER: "taker",
  MAKER: "maker",
} as const;

export const KALSHI_FEE_SCHEDULE_VARIANT = {
  STANDARD: "standard",
  REDUCED_INDEX: "reduced-index",
} as const;

export const KALSHI_FEE_MULTIPLIER_BY_VARIANT = {
  [KALSHI_FEE_SCHEDULE_VARIANT.STANDARD]: {
    [KALSHI_FEE_SCHEDULE_ROLE.TAKER]: { numerator: 7, denominator: 100 },
    [KALSHI_FEE_SCHEDULE_ROLE.MAKER]: { numerator: 175, denominator: 10_000 },
  },
  [KALSHI_FEE_SCHEDULE_VARIANT.REDUCED_INDEX]: {
    [KALSHI_FEE_SCHEDULE_ROLE.TAKER]: { numerator: 35, denominator: 1_000 },
    [KALSHI_FEE_SCHEDULE_ROLE.MAKER]: { numerator: 875, denominator: 100_000 },
  },
} as const;

function assertValidQuantity(quantity: number): void {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new ExecutionCostModelError(
      "quantity must be a positive integer",
      ExecutionCostModelErrorCode.INVALID_QUANTITY,
    );
  }
}

function assertValidPriceCents(priceCents: number): void {
  if (!Number.isInteger(priceCents) || priceCents < 0 || priceCents > 100) {
    throw new ExecutionCostModelError(
      "priceCents must be an integer between 0 and 100",
      ExecutionCostModelErrorCode.INVALID_PRICE,
    );
  }
}

/** Computes Kalshi schedule fees using round-up-to-next-cent semantics. */
export function computeKalshiScheduleFeeCents(input: {
  quantity: number;
  priceCents: number;
  role: KalshiFeeScheduleRole;
  schedule?: KalshiFeeScheduleVariant;
}): number {
  assertValidQuantity(input.quantity);
  assertValidPriceCents(input.priceCents);

  const schedule = input.schedule ?? KALSHI_FEE_SCHEDULE_VARIANT.STANDARD;
  const multiplier = KALSHI_FEE_MULTIPLIER_BY_VARIANT[schedule][input.role];
  const feeNumerator =
    multiplier.numerator
    * input.quantity
    * input.priceCents
    * (100 - input.priceCents);
  const feeDenominator = multiplier.denominator * 100;

  return Math.ceil(feeNumerator / feeDenominator);
}
