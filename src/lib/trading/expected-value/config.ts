/** Tunable parameters for deterministic expected-value calculations. */
export type ExpectedValueConfig = {
  /** Fee in cents deducted from each side's gross EV (simplified Kalshi fee). */
  feeCentsPerContract: number;
  /** Spread percent above which confidence is linearly penalized. */
  maxSpreadForFullConfidence: number;
  /** Hard cap on absolute per-contract EV magnitude (cents). */
  maxAbsEvCents: number;
};

export const DEFAULT_EXPECTED_VALUE_CONFIG: ExpectedValueConfig = {
  feeCentsPerContract: 0,
  maxSpreadForFullConfidence: 15,
  maxAbsEvCents: 100,
};

export const EXPECTED_VALUE_MODEL_VERSION = "5.5.0";
