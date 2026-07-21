import type { ForwardCapturePriceRepresentation } from "../forwardQuoteCaptureTypes";

/**
 * The one canonical capture profile for eight-hour Hypothesis #3 runs.
 *
 * The restart smoke must exercise the exact workload that the eight-hour
 * capture will run — same series, BTC spot, top-of-book throttle, market
 * count, watchdog, and price representation. The only documented exception
 * is duration: a smoke runs 15-30 minutes, an eight-hour capture runs 480.
 *
 * This constant is the single source of truth. The restart gate verifies a
 * smoke run's recorded native-health config against it, and the PowerShell
 * wrapper reads it via `--print-canonical-profile` instead of duplicating
 * the values in shell scripts.
 */
export type CanonicalCaptureProfile = {
  series: string;
  captureBtcSpot: true;
  topOfBookThrottleMs: number;
  maxMarkets: number;
  wsWatchdogEnabled: true;
  priceRepresentation: ForwardCapturePriceRepresentation;
  /** Duration of a production eight-hour capture, in minutes. */
  eightHourDurationMinutes: number;
  /** Documented smoke exception: allowed smoke duration window, in minutes. */
  smokeDurationMinutesMin: number;
  smokeDurationMinutesMax: number;
};

export const CANONICAL_EIGHT_HOUR_CAPTURE_PROFILE: CanonicalCaptureProfile = {
  series: "KXBTC15M",
  captureBtcSpot: true,
  topOfBookThrottleMs: 1_000,
  maxMarkets: 5,
  wsWatchdogEnabled: true,
  priceRepresentation: "legacy-no-leg",
  eightHourDurationMinutes: 480,
  smokeDurationMinutesMin: 15,
  smokeDurationMinutesMax: 30,
};

export type CanonicalProfileMismatch = {
  field: string;
  expected: string;
  actual: string;
};

/**
 * Verifies a capture run's recorded config (from the native health artifact)
 * against the canonical eight-hour profile. Missing config fields fail
 * closed. Duration is validated against the smoke window, the documented
 * exception to the eight-hour value.
 */
export function verifyCanonicalCaptureProfile(
  config: Record<string, unknown> | null,
  profile: CanonicalCaptureProfile = CANONICAL_EIGHT_HOUR_CAPTURE_PROFILE,
): CanonicalProfileMismatch[] {
  if (config === null) {
    return [
      {
        field: "config",
        expected: "recorded capture config in native health",
        actual: "missing",
      },
    ];
  }

  const mismatches: CanonicalProfileMismatch[] = [];
  const exactFields: Array<[string, unknown]> = [
    ["series", profile.series],
    ["captureBtcSpot", profile.captureBtcSpot],
    ["topOfBookThrottleMs", profile.topOfBookThrottleMs],
    ["maxMarkets", profile.maxMarkets],
    ["wsWatchdogEnabled", profile.wsWatchdogEnabled],
    ["priceRepresentation", profile.priceRepresentation],
  ];
  for (const [field, expected] of exactFields) {
    if (config[field] !== expected) {
      mismatches.push({
        field,
        expected: String(expected),
        actual: config[field] === undefined ? "missing" : String(config[field]),
      });
    }
  }

  const durationMinutes = config.durationMinutes;
  if (
    typeof durationMinutes !== "number"
    || !Number.isFinite(durationMinutes)
    || durationMinutes < profile.smokeDurationMinutesMin
    || durationMinutes > profile.smokeDurationMinutesMax
  ) {
    mismatches.push({
      field: "durationMinutes",
      expected: `${profile.smokeDurationMinutesMin}-${profile.smokeDurationMinutesMax} (documented smoke exception to ${profile.eightHourDurationMinutes})`,
      actual:
        durationMinutes === undefined ? "missing" : String(durationMinutes),
    });
  }

  return mismatches;
}
