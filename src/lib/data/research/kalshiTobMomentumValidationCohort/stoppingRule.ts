import {
  MOMENTUM_VALIDATION_MAX_CAPTURE_HOURS,
  MOMENTUM_VALIDATION_TARGET_ESS,
  MomentumValidationCohortError,
  type MomentumValidationStoppingDecision,
} from "./momentumValidationCohortTypes";

/**
 * Fixed-N cohort stopping. Evaluated only after a completed accepted segment.
 * Effect / P&L / p-value inputs are forbidden and cannot change status.
 *
 * Rule (v1.1):
 *   if cumulativeBlindEss >= 155 → ready-for-outcome-open
 *   else if cumulativeAcceptedCaptureHours >= 40 → underpowered-at-fixed-capture-budget
 *   else → continue-collection
 */
export function evaluateMomentumValidationStopping(input: {
  cumulativeBlindEss: number;
  cumulativeAcceptedCaptureHours: number;
  acceptedSegmentCount?: number;
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
    !Number.isFinite(input.cumulativeAcceptedCaptureHours)
    || input.cumulativeAcceptedCaptureHours < 0
  ) {
    throw new MomentumValidationCohortError(
      "cumulativeAcceptedCaptureHours must be a finite non-negative number",
    );
  }

  const acceptedSegmentCount = input.acceptedSegmentCount ?? 0;
  if (
    !Number.isFinite(acceptedSegmentCount)
    || acceptedSegmentCount < 0
    || !Number.isInteger(acceptedSegmentCount)
  ) {
    throw new MomentumValidationCohortError(
      "acceptedSegmentCount must be a non-negative integer",
    );
  }

  let status: MomentumValidationStoppingDecision["status"];
  if (input.cumulativeBlindEss >= MOMENTUM_VALIDATION_TARGET_ESS) {
    status = "ready-for-outcome-open";
  } else if (
    input.cumulativeAcceptedCaptureHours >= MOMENTUM_VALIDATION_MAX_CAPTURE_HOURS
  ) {
    status = "underpowered-at-fixed-capture-budget";
  } else {
    status = "continue-collection";
  }

  return {
    status,
    cumulativeBlindEss: input.cumulativeBlindEss,
    cumulativeAcceptedCaptureHours: input.cumulativeAcceptedCaptureHours,
    acceptedSegmentCount,
    targetEss: MOMENTUM_VALIDATION_TARGET_ESS,
    maxAcceptedCaptureHours: MOMENTUM_VALIDATION_MAX_CAPTURE_HOURS,
    remainingAcceptedCaptureHours: Math.max(
      0,
      MOMENTUM_VALIDATION_MAX_CAPTURE_HOURS - input.cumulativeAcceptedCaptureHours,
    ),
    effectPeekingForbidden: true,
    pValueStoppingForbidden: true,
    syntheticEffectIgnored: true,
  };
}

export function assertStoppingIgnoresSyntheticEffect(input: {
  cumulativeBlindEss: number;
  cumulativeAcceptedCaptureHours: number;
  favorableEffectCents: number;
  unfavorableEffectCents: number;
}): void {
  const base = evaluateMomentumValidationStopping({
    cumulativeBlindEss: input.cumulativeBlindEss,
    cumulativeAcceptedCaptureHours: input.cumulativeAcceptedCaptureHours,
  });

  expectThrow(() =>
    evaluateMomentumValidationStopping({
      cumulativeBlindEss: input.cumulativeBlindEss,
      cumulativeAcceptedCaptureHours: input.cumulativeAcceptedCaptureHours,
      syntheticEffectCents: input.favorableEffectCents,
    })
  );
  expectThrow(() =>
    evaluateMomentumValidationStopping({
      cumulativeBlindEss: input.cumulativeBlindEss,
      cumulativeAcceptedCaptureHours: input.cumulativeAcceptedCaptureHours,
      syntheticEffectCents: input.unfavorableEffectCents,
    })
  );

  if (
    base.status
      !== evaluateMomentumValidationStopping({
        cumulativeBlindEss: input.cumulativeBlindEss,
        cumulativeAcceptedCaptureHours: input.cumulativeAcceptedCaptureHours,
      }).status
  ) {
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
