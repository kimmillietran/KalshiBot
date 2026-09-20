/**
 * M15 fee application — binds existing Kalshi schedule (standard taker), no invention.
 */
import {
  computeKalshiScheduleFeeCents,
  KALSHI_FEE_SCHEDULE_ROLE,
  KALSHI_FEE_SCHEDULE_VARIANT,
} from "@/lib/data/backtesting/costModel/computeKalshiScheduleFeeCents";

import {
  bindM15FeeContract,
  M15CostFloorError,
  type M15FeeContractBinding,
} from "./m15CostFloorTypes";

export function assertM15FeeContractMatches(expectedIdentity: string): M15FeeContractBinding {
  const bound = bindM15FeeContract();
  if (bound.feeContractIdentity !== expectedIdentity) {
    throw new M15CostFloorError(
      `M15 fee-contract identity mismatch: expected ${expectedIdentity}, `
        + `got ${bound.feeContractIdentity}`,
    );
  }
  return bound;
}

/**
 * One-contract Kalshi schedule fee at an executable fill price (cents).
 * Entry uses ask; exit uses bid for a YES taker round trip.
 */
export function computeM15OneContractTakerFeeCents(priceCents: number): number {
  if (!Number.isInteger(priceCents) || priceCents < 0 || priceCents > 100) {
    throw new M15CostFloorError(
      `fee priceCents must be integer in [0,100]; got ${priceCents}`,
    );
  }
  return computeKalshiScheduleFeeCents({
    quantity: 1,
    priceCents,
    role: KALSHI_FEE_SCHEDULE_ROLE.TAKER,
    schedule: KALSHI_FEE_SCHEDULE_VARIANT.STANDARD,
  });
}
