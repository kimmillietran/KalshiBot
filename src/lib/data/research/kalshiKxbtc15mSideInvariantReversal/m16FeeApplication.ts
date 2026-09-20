import {
  computeKalshiScheduleFeeCents,
  KALSHI_FEE_SCHEDULE_ROLE,
  KALSHI_FEE_SCHEDULE_VARIANT,
} from "@/lib/data/backtesting/costModel/computeKalshiScheduleFeeCents";

import {
  bindM16FeeContract,
  computeM16FeeContractIdentity,
  M16ReversalError,
  type M16FeeContractBinding,
} from "./m16Types";

export function assertM16FeeContractMatches(expectedIdentity: string): M16FeeContractBinding {
  const bound = bindM16FeeContract();
  if (bound.feeContractIdentity !== expectedIdentity) {
    throw new M16ReversalError(
      `M16 fee-contract identity mismatch: expected ${expectedIdentity}, `
        + `got ${bound.feeContractIdentity}`,
    );
  }
  if (bound.schedule !== KALSHI_FEE_SCHEDULE_VARIANT.STANDARD) {
    throw new M16ReversalError(
      `M16 rejects non-standard fee schedule ${bound.schedule} `
        + `(standard-vs-series mismatch fail-closed)`,
    );
  }
  return bound;
}

export function assertM16RejectsReducedIndexForBoundContract(): void {
  const id = computeM16FeeContractIdentity();
  const bound = assertM16FeeContractMatches(id);
  if (bound.schedule === KALSHI_FEE_SCHEDULE_VARIANT.REDUCED_INDEX) {
    throw new M16ReversalError("M16 bound contract must not be reduced-index");
  }
}

/**
 * One-contract standard-taker fee at an executable fill price (cents).
 * Used by future outcome-open only — incidence mode must not emit fees/P&L.
 */
export function computeM16OneContractTakerFeeCents(priceCents: number): number {
  if (!Number.isInteger(priceCents) || priceCents < 0 || priceCents > 100) {
    throw new M16ReversalError(
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
