import type { StaticParityFrictionConfig } from "../staticParityScan/staticParityScanTypes";

export type ParityShortfallResult = {
  observedGrossEdgeCents: number | null;
  estimatedNetEdgeCents: number | null;
  grossDistanceToQualification: number | null;
  feeAdjustedDistanceToQualification: number | null;
  bufferAdjustedDistanceToQualification: number | null;
};

// The fee gate passes on estimated net edge > 0; with integer-cent inputs,
// one cent is the first qualifying net edge.
export const MINIMUM_FEE_PASS_NET_EDGE_CENTS = 1;

/** Observed bid-only gross edge in integer cents; not clamped to non-negative. */
export function computeObservedGrossEdgeCents(
  yesBidCents: number | null,
  noBidCents: number | null,
): number | null {
  if (yesBidCents === null || noBidCents === null) {
    return null;
  }

  return yesBidCents + noBidCents - 100;
}

function shortfallDistance(threshold: number, value: number | null): number | null {
  if (value === null) {
    return null;
  }

  return threshold - value;
}

/** Computes frozen-rule shortfalls using the sign convention: positive = below qualification. */
export function computeParityShortfalls(
  yesBidCents: number | null,
  noBidCents: number | null,
  friction: StaticParityFrictionConfig,
): ParityShortfallResult {
  const observedGrossEdgeCents = computeObservedGrossEdgeCents(yesBidCents, noBidCents);
  if (observedGrossEdgeCents === null) {
    return {
      observedGrossEdgeCents: null,
      estimatedNetEdgeCents: null,
      grossDistanceToQualification: null,
      feeAdjustedDistanceToQualification: null,
      bufferAdjustedDistanceToQualification: null,
    };
  }

  const estimatedNetEdgeCents = observedGrossEdgeCents - friction.feeBufferCents;

  return {
    observedGrossEdgeCents,
    estimatedNetEdgeCents,
    grossDistanceToQualification: shortfallDistance(
      friction.minGrossEdgeCents,
      observedGrossEdgeCents,
    ),
    feeAdjustedDistanceToQualification: shortfallDistance(
      MINIMUM_FEE_PASS_NET_EDGE_CENTS,
      estimatedNetEdgeCents,
    ),
    bufferAdjustedDistanceToQualification: shortfallDistance(
      friction.minBidOnlyEdgeCents,
      estimatedNetEdgeCents,
    ),
  };
}

export function isDistanceEvaluable(
  yesBidCents: number | null,
  noBidCents: number | null,
): boolean {
  return yesBidCents !== null && noBidCents !== null;
}
