/**
 * Fee helpers for M16.
 *
 * Scientific fee authority is UNRESOLVED in M16.0.
 * Standard-taker helpers below are PROVISIONAL / UTILITY ONLY for synthetic
 * mechanics tests — they are NOT the authoritative KXBTC15M schedule.
 */
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

export function assertM16FeeContractUnresolvedForOutcomeOpen(): M16FeeContractBinding {
  const bound = bindM16FeeContract();
  if (bound.feeContractStatus !== "fee-contract-unresolved-for-outcome-open") {
    throw new M16ReversalError(
      `M16.0 requires fee-contract-unresolved-for-outcome-open; got `
        + `${bound.feeContractStatus}`,
    );
  }
  if (bound.authoritativeScheduleBound !== false) {
    throw new M16ReversalError(
      "M16.0 must not claim an authoritative KXBTC15M fee schedule is bound",
    );
  }
  if (bound.feeContractIdentity !== computeM16FeeContractIdentity()) {
    throw new M16ReversalError(
      `M16 fee-contract identity mismatch: expected `
        + `${computeM16FeeContractIdentity()}, got ${bound.feeContractIdentity}`,
    );
  }
  return bound;
}

/**
 * @deprecated Prefer assertM16FeeContractUnresolvedForOutcomeOpen.
 * Kept as an alias so callers cannot silently treat fees as bound.
 */
export function assertM16FeeContractMatches(expectedIdentity: string): M16FeeContractBinding {
  const bound = assertM16FeeContractUnresolvedForOutcomeOpen();
  if (bound.feeContractIdentity !== expectedIdentity) {
    throw new M16ReversalError(
      `M16 fee-contract identity mismatch: expected ${expectedIdentity}, `
        + `got ${bound.feeContractIdentity}`,
    );
  }
  return bound;
}

/**
 * Provisional one-contract STANDARD-taker fee at an executable fill price (¢).
 * UTILITY / SYNTHETIC TESTS ONLY — not scientific fee authority for M16 outcomes.
 * Incidence mode must not emit fees/P&L.
 */
export function computeM16ProvisionalStandardTakerFeeCentsForUtility(
  priceCents: number,
): number {
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

/** @deprecated Use computeM16ProvisionalStandardTakerFeeCentsForUtility. */
export function computeM16OneContractTakerFeeCents(priceCents: number): number {
  return computeM16ProvisionalStandardTakerFeeCentsForUtility(priceCents);
}
