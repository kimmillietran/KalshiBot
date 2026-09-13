import {
  MOMENTUM_VALIDATION_MAX_SEGMENT_DURATION_MINUTES,
  MomentumValidationCohortError,
} from "./momentumValidationCohortTypes";

/**
 * Accepted segment duration must be prospectively declared, finite, > 0,
 * and ≤ max segment duration (480 minutes).
 */
export function assertValidMomentumValidationSegmentDuration(
  durationMinutes: number,
): void {
  if (!Number.isFinite(durationMinutes)) {
    throw new MomentumValidationCohortError(
      "segment durationMinutes must be a finite number",
    );
  }
  if (durationMinutes <= 0) {
    throw new MomentumValidationCohortError(
      "segment durationMinutes must be > 0",
    );
  }
  if (durationMinutes > MOMENTUM_VALIDATION_MAX_SEGMENT_DURATION_MINUTES) {
    throw new MomentumValidationCohortError(
      `segment durationMinutes must be <= ${MOMENTUM_VALIDATION_MAX_SEGMENT_DURATION_MINUTES}`,
    );
  }
}

export function isValidMomentumValidationSegmentDuration(
  durationMinutes: number,
): boolean {
  try {
    assertValidMomentumValidationSegmentDuration(durationMinutes);
    return true;
  } catch (error) {
    if (error instanceof MomentumValidationCohortError) {
      return false;
    }
    throw error;
  }
}

/**
 * Sum accepted capture hours from accepted segments only.
 * Failed/excluded segments must not be passed here.
 */
export function sumAcceptedCaptureHours(
  acceptedSegments: readonly { durationMinutes: number | null }[],
): number {
  let minutes = 0;
  for (const segment of acceptedSegments) {
    if (segment.durationMinutes == null || !Number.isFinite(segment.durationMinutes)) {
      throw new MomentumValidationCohortError(
        "accepted segment requires finite durationMinutes for capture-hour budget",
      );
    }
    if (segment.durationMinutes <= 0) {
      throw new MomentumValidationCohortError(
        "accepted segment durationMinutes must be > 0",
      );
    }
    minutes += segment.durationMinutes;
  }
  return minutes / 60;
}
