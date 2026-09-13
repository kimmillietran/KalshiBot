import {
  MOMENTUM_VALIDATION_MAX_ACCEPTED_SEGMENTS,
  MOMENTUM_VALIDATION_TARGET_ESS,
  MomentumValidationCohortError,
  type MomentumValidationStoppingDecision,
} from "./momentumValidationCohortTypes";

/**
 * Fixed-N cohort stopping. Evaluated only after a completed segment.
 * Effect / P&L / p-value inputs are forbidden and cannot change status.
 */
export function evaluateMomentumValidationStopping(input: {
  cumulativeBlindEss: number;
  acceptedSegmentCount: number;
  /** Must not be provided — presence throws (synthetic effect cannot drive stopping). */
  syntheticEffectCents?: number | null;
  syntheticPValue?: number | null;
  proposedStopReason?: string | null;
}): MomentumValidationStoppingDecision {
  if (
    input.syntheticEffectCents != null
    || input.syntheticPValue != null
    || input.proposedStopReason === "effect-looks-great"
    || input.proposedStopReason === "effect-looks-bad"
    || input.proposedStopReason === "p-value-threshold"
  ) {
    throw new MomentumValidationCohortError(
      "synthetic effect/p-value cannot affect validation cohort stopping",
    );
  }

  if (!Number.isFinite(input.cumulativeBlindEss) || input.cumulativeBlindEss < 0) {
    throw new MomentumValidationCohortError("cumulativeBlindEss must be a finite non-negative number");
  }
  if (
    !Number.isFinite(input.acceptedSegmentCount)
    || input.acceptedSegmentCount < 0
    || !Number.isInteger(input.acceptedSegmentCount)
  ) {
    throw new MomentumValidationCohortError(
      "acceptedSegmentCount must be a non-negative integer",
    );
  }

  let status: MomentumValidationStoppingDecision["status"];
  if (input.cumulativeBlindEss >= MOMENTUM_VALIDATION_TARGET_ESS) {
    status = "ready-for-outcome-open";
  } else if (input.acceptedSegmentCount >= MOMENTUM_VALIDATION_MAX_ACCEPTED_SEGMENTS) {
    status = "underpowered-at-fixed-capture-budget";
  } else {
    status = "continue-collection";
  }

  return {
    status,
    cumulativeBlindEss: input.cumulativeBlindEss,
    acceptedSegmentCount: input.acceptedSegmentCount,
    targetEss: MOMENTUM_VALIDATION_TARGET_ESS,
    maxAcceptedSegments: MOMENTUM_VALIDATION_MAX_ACCEPTED_SEGMENTS,
    effectPeekingForbidden: true,
    pValueStoppingForbidden: true,
    syntheticEffectIgnored: true,
  };
}

export function assertStoppingIgnoresSyntheticEffect(input: {
  cumulativeBlindEss: number;
  acceptedSegmentCount: number;
  favorableEffectCents: number;
  unfavorableEffectCents: number;
}): void {
  const base = evaluateMomentumValidationStopping({
    cumulativeBlindEss: input.cumulativeBlindEss,
    acceptedSegmentCount: input.acceptedSegmentCount,
  });

  expectThrow(() =>
    evaluateMomentumValidationStopping({
      cumulativeBlindEss: input.cumulativeBlindEss,
      acceptedSegmentCount: input.acceptedSegmentCount,
      syntheticEffectCents: input.favorableEffectCents,
    })
  );
  expectThrow(() =>
    evaluateMomentumValidationStopping({
      cumulativeBlindEss: input.cumulativeBlindEss,
      acceptedSegmentCount: input.acceptedSegmentCount,
      syntheticEffectCents: input.unfavorableEffectCents,
    })
  );

  // Status depends only on ESS + accepted count.
  if (base.status !== evaluateMomentumValidationStopping({
    cumulativeBlindEss: input.cumulativeBlindEss,
    acceptedSegmentCount: input.acceptedSegmentCount,
  }).status) {
    throw new MomentumValidationCohortError("stopping status must be deterministic without effect");
  }
}

function expectThrow(fn: () => unknown): void {
  try {
    fn();
  } catch (error) {
    if (error instanceof MomentumValidationCohortError) {
      return;
    }
    throw error;
  }
  throw new MomentumValidationCohortError(
    "expected synthetic effect to be rejected from stopping path",
  );
}
