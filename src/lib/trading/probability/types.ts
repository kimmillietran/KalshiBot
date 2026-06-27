/**
 * Tunable weights for the deterministic heuristic probability model (v1).
 * Same vector + config always yields the same `ProbabilityEstimate`.
 */
export type ProbabilityModelConfig = {
  /** Log-odds scale for percent distance from strike (per 1% of strike). */
  distanceWeight: number;
  /** Max absolute percent move used to normalize momentum contribution. */
  momentumNormalizePercent: number;
  /** Log-odds scale for normalized momentum. */
  momentumWeight: number;
  /** Log-odds scale for trend score in [-1, 1]. */
  trendWeight: number;
  /** Log-odds bump when price recently crossed the strike upward. */
  crossUpWeight: number;
  /** Log-odds bump when price recently crossed the strike downward. */
  crossDownWeight: number;
  /** Higher values dampen log-odds more when volatility is elevated. */
  volatilityDampenFactor: number;
  /** Minutes at which time-urgency amplification reaches maximum. */
  timeUrgencyMinutes: number;
  /** Max multiplier applied to distance log-odds as expiry approaches. */
  timeUrgencyMaxAmplify: number;
  /** Minimum bars required for full confidence from candle depth. */
  confidenceMinBars: number;
};

export const DEFAULT_PROBABILITY_MODEL_CONFIG: ProbabilityModelConfig = {
  distanceWeight: 0.35,
  momentumNormalizePercent: 2,
  momentumWeight: 0.4,
  trendWeight: 0.55,
  crossUpWeight: 0.25,
  crossDownWeight: -0.25,
  volatilityDampenFactor: 1.25,
  timeUrgencyMinutes: 3,
  timeUrgencyMaxAmplify: 1.35,
  confidenceMinBars: 10,
};

export const PROBABILITY_MODEL_VERSION = "5.4.0";

export type ProbabilityDriver =
  | "distance"
  | "momentum"
  | "trend"
  | "crossTarget"
  | "volatilityDampen"
  | "timeUrgency";

export type ProbabilityDriverContribution = {
  driver: ProbabilityDriver;
  /** Signed contribution to log-odds before dampening/amplification. */
  logOddsAdjustment: number;
};

/**
 * Fair-value probability that BTC settles at or above the contract strike.
 * `probabilityDown` is always the complement of `probabilityUp`.
 */
export type ProbabilityEstimate = {
  probabilityUp: number;
  probabilityDown: number;
  /** Confidence in [0, 1] from data depth, liquidity, and time quality. */
  confidence: number;
  modelVersion: string;
  /** Pre-sigmoid log-odds after all adjustments. */
  logOdds: number;
  drivers: readonly ProbabilityDriverContribution[];
};
