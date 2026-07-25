import type { CanonicalCaptureProfile } from "@/lib/data/live/forwardQuoteCapture";
import { CANONICAL_EIGHT_HOUR_CAPTURE_PROFILE } from "@/lib/data/live/forwardQuoteCapture";

import { OperatorCliError } from "./argv";

export type ValidatedCanonicalProfile = CanonicalCaptureProfile;

function assertNonEmptyString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new OperatorCliError(
      `Canonical capture profile is invalid; ${name} must be a non-empty string.`,
    );
  }
  return value;
}

function assertNumber(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new OperatorCliError(
      `Canonical capture profile is invalid; ${name} must be a number.`,
    );
  }
  return value;
}

function assertBoolean(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") {
    throw new OperatorCliError(
      `Canonical capture profile is invalid; ${name} must be a boolean.`,
    );
  }
  return value;
}

/**
 * Load and shape-validate the canonical eight-hour profile from TypeScript SSoT.
 * Shell wrappers must not duplicate workload literals.
 */
export function loadCanonicalCaptureProfile(
  profile: CanonicalCaptureProfile = CANONICAL_EIGHT_HOUR_CAPTURE_PROFILE,
): ValidatedCanonicalProfile {
  assertNonEmptyString(profile.series, "series");
  assertNumber(profile.maxMarkets, "maxMarkets");
  assertNumber(profile.topOfBookThrottleMs, "topOfBookThrottleMs");
  assertBoolean(profile.captureBtcSpot, "captureBtcSpot");
  assertBoolean(profile.wsWatchdogEnabled, "wsWatchdogEnabled");
  assertNonEmptyString(profile.priceRepresentation, "priceRepresentation");
  assertNumber(profile.smokeDurationMinutesMin, "smokeDurationMinutesMin");
  assertNumber(profile.smokeDurationMinutesMax, "smokeDurationMinutesMax");
  assertNumber(profile.eightHourDurationMinutes, "eightHourDurationMinutes");

  if (profile.captureBtcSpot !== true) {
    throw new OperatorCliError(
      "Canonical capture profile must have captureBtcSpot=true.",
    );
  }
  if (profile.wsWatchdogEnabled !== true) {
    throw new OperatorCliError(
      "Canonical capture profile must have wsWatchdogEnabled=true.",
    );
  }

  return profile;
}

export function buildCanonicalCaptureArgv(
  profile: ValidatedCanonicalProfile,
  durationMinutes: number,
): string[] {
  const argv = [
    "--series",
    profile.series,
    "--duration-minutes",
    String(durationMinutes),
    "--max-markets",
    String(profile.maxMarkets),
    "--top-of-book-throttle-ms",
    String(profile.topOfBookThrottleMs),
  ];
  if (profile.captureBtcSpot) {
    argv.push("--capture-btc-spot");
  }
  return argv;
}
