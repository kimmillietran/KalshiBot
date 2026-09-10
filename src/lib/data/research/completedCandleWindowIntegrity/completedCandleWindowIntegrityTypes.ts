/**
 * Completed-candle window contiguity integrity (M12.7b).
 *
 * Read-only assessment + opt-in strict primitives for future evidence contracts.
 * Does not modify frozen calibration-fade v2 selection or classification semantics.
 */

export const COMPLETED_CANDLE_WINDOW_INTEGRITY_VERSION =
  "completed-candle-window-integrity-v1" as const;

export const DEFAULT_COMPLETED_CANDLE_EXPECTED_INTERVAL_MS = 60_000 as const;

export type CandleWindowContiguityStatus =
  | "contiguous"
  | "insufficient-data"
  | "gap-detected"
  | "invalid-non-monotonic-timestamps";

export type CandleWindowGapLocation = {
  /** Index of the later candle in the ordered window (the edge after the gap). */
  afterIndex: number;
  earlierTimestampMs: number;
  laterTimestampMs: number;
  observedDeltaMs: number;
  excessGapMs: number;
};

export type CandleWindowContiguityAssessment = {
  integrityVersion: typeof COMPLETED_CANDLE_WINDOW_INTEGRITY_VERSION;
  status: CandleWindowContiguityStatus;
  expectedIntervalMs: number;
  /**
   * Canonical timestamps used for spacing checks.
   * For exchange-completed-1m-ohlc, openTimeMs is preferred; closeTimeMs has
   * identical adjacent deltas when closeOffset is constant.
   */
  timestampKind: "open-time" | "close-time" | "generic";
  selectedCandleCount: number;
  returnIntervalCount: number;
  contiguousIntervalCount: number;
  gapIntervalCount: number;
  maximumGapMs: number | null;
  maximumExcessGapMs: number | null;
  gapLocations: readonly CandleWindowGapLocation[];
  isContiguous: boolean;
  /** Informational only — never an eligibility/classification authority. */
  informationalOnly: true;
  note: string;
};

export type StrictContiguousWindowRejectionReason =
  | "insufficient-completed-minutes"
  | "timing-identity-conflict"
  | "gap-detected"
  | "invalid-non-monotonic-timestamps"
  | "volatility-estimate-unavailable";

export type StrictContiguousVolatilityWindowContract = {
  sourceRecordType: "exchange-completed-1m-ohlc";
  expectedBarIntervalMs: number;
  requireContiguousWindow: true;
  requiredCloseCount: number;
  lookbackBars: number;
};

export const DEFAULT_STRICT_CONTIGUOUS_1M_CONTRACT: StrictContiguousVolatilityWindowContract = {
  sourceRecordType: "exchange-completed-1m-ohlc",
  expectedBarIntervalMs: DEFAULT_COMPLETED_CANDLE_EXPECTED_INTERVAL_MS,
  requireContiguousWindow: true,
  requiredCloseCount: 11,
  lookbackBars: 10,
};
