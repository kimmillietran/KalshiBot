import {
  COMPLETED_CANDLE_WINDOW_INTEGRITY_VERSION,
  DEFAULT_COMPLETED_CANDLE_EXPECTED_INTERVAL_MS,
  type CandleWindowContiguityAssessment,
  type CandleWindowGapLocation,
} from "./completedCandleWindowIntegrityTypes";

function isFiniteNumber(value: number): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Read-only contiguity assessment for an ordered completed-candle timestamp series.
 *
 * Prefer openTimeMs for exchange-completed-1m-ohlc windows: adjacent open times
 * must equal expectedIntervalMs (typically 60_000). Does not mutate inputs and
 * does not change volatility estimates or eligibility.
 */
export function assessCandleWindowContiguity(input: {
  timestampsMs: readonly number[];
  expectedIntervalMs?: number;
  timestampKind?: CandleWindowContiguityAssessment["timestampKind"];
  minimumCandleCount?: number;
}): CandleWindowContiguityAssessment {
  const expectedIntervalMs =
    input.expectedIntervalMs ?? DEFAULT_COMPLETED_CANDLE_EXPECTED_INTERVAL_MS;
  const timestampKind = input.timestampKind ?? "generic";
  const minimumCandleCount = input.minimumCandleCount ?? 2;
  const timestamps = input.timestampsMs;
  const selectedCandleCount = timestamps.length;
  const returnIntervalCount = Math.max(0, selectedCandleCount - 1);

  const baseNote =
    "Informational contiguity diagnostic only. Does not alter frozen v2 eligibility, "
    + "annualizedVolatility, candidate membership, or classification.";

  if (!Number.isFinite(expectedIntervalMs) || expectedIntervalMs <= 0) {
    return {
      integrityVersion: COMPLETED_CANDLE_WINDOW_INTEGRITY_VERSION,
      status: "invalid-non-monotonic-timestamps",
      expectedIntervalMs,
      timestampKind,
      selectedCandleCount,
      returnIntervalCount,
      contiguousIntervalCount: 0,
      gapIntervalCount: 0,
      maximumGapMs: null,
      maximumExcessGapMs: null,
      gapLocations: [],
      isContiguous: false,
      informationalOnly: true,
      note: `${baseNote} expectedIntervalMs must be a positive finite number.`,
    };
  }

  if (selectedCandleCount < minimumCandleCount) {
    return {
      integrityVersion: COMPLETED_CANDLE_WINDOW_INTEGRITY_VERSION,
      status: "insufficient-data",
      expectedIntervalMs,
      timestampKind,
      selectedCandleCount,
      returnIntervalCount,
      contiguousIntervalCount: 0,
      gapIntervalCount: 0,
      maximumGapMs: null,
      maximumExcessGapMs: null,
      gapLocations: [],
      isContiguous: false,
      informationalOnly: true,
      note: `${baseNote} Need at least ${minimumCandleCount} timestamps.`,
    };
  }

  for (const timestamp of timestamps) {
    if (!isFiniteNumber(timestamp)) {
      return {
        integrityVersion: COMPLETED_CANDLE_WINDOW_INTEGRITY_VERSION,
        status: "invalid-non-monotonic-timestamps",
        expectedIntervalMs,
        timestampKind,
        selectedCandleCount,
        returnIntervalCount,
        contiguousIntervalCount: 0,
        gapIntervalCount: 0,
        maximumGapMs: null,
        maximumExcessGapMs: null,
        gapLocations: [],
        isContiguous: false,
        informationalOnly: true,
        note: `${baseNote} Non-finite timestamp detected.`,
      };
    }
  }

  const gapLocations: CandleWindowGapLocation[] = [];
  let contiguousIntervalCount = 0;
  let maximumGapMs: number | null = null;
  let maximumExcessGapMs: number | null = null;
  let invalid = false;

  for (let index = 1; index < timestamps.length; index += 1) {
    const earlier = timestamps[index - 1]!;
    const later = timestamps[index]!;
    const delta = later - earlier;

    if (delta <= 0) {
      invalid = true;
      break;
    }

    if (maximumGapMs === null || delta > maximumGapMs) {
      maximumGapMs = delta;
    }

    if (delta === expectedIntervalMs) {
      contiguousIntervalCount += 1;
      continue;
    }

    const excessGapMs = delta - expectedIntervalMs;
    if (maximumExcessGapMs === null || excessGapMs > maximumExcessGapMs) {
      maximumExcessGapMs = excessGapMs;
    }
    gapLocations.push({
      afterIndex: index,
      earlierTimestampMs: earlier,
      laterTimestampMs: later,
      observedDeltaMs: delta,
      excessGapMs,
    });
  }

  if (invalid) {
    return {
      integrityVersion: COMPLETED_CANDLE_WINDOW_INTEGRITY_VERSION,
      status: "invalid-non-monotonic-timestamps",
      expectedIntervalMs,
      timestampKind,
      selectedCandleCount,
      returnIntervalCount,
      contiguousIntervalCount: 0,
      gapIntervalCount: 0,
      maximumGapMs,
      maximumExcessGapMs: null,
      gapLocations: [],
      isContiguous: false,
      informationalOnly: true,
      note:
        `${baseNote} Timestamps must be strictly increasing; duplicates or reversals are invalid.`,
    };
  }

  const gapIntervalCount = gapLocations.length;
  if (gapIntervalCount > 0) {
    return {
      integrityVersion: COMPLETED_CANDLE_WINDOW_INTEGRITY_VERSION,
      status: "gap-detected",
      expectedIntervalMs,
      timestampKind,
      selectedCandleCount,
      returnIntervalCount,
      contiguousIntervalCount,
      gapIntervalCount,
      maximumGapMs,
      maximumExcessGapMs,
      gapLocations,
      isContiguous: false,
      informationalOnly: true,
      note:
        `${baseNote} One or more adjacent intervals differ from expectedIntervalMs=`
        + `${expectedIntervalMs}. Final-pair adjacency alone is not sufficient.`,
    };
  }

  return {
    integrityVersion: COMPLETED_CANDLE_WINDOW_INTEGRITY_VERSION,
    status: "contiguous",
    expectedIntervalMs,
    timestampKind,
    selectedCandleCount,
    returnIntervalCount,
    contiguousIntervalCount,
    gapIntervalCount: 0,
    maximumGapMs,
    maximumExcessGapMs: 0,
    gapLocations: [],
    isContiguous: true,
    informationalOnly: true,
    note: `${baseNote} All adjacent intervals equal expectedIntervalMs.`,
  };
}
