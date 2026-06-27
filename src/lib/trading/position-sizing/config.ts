/** Tunable parameters for deterministic Kelly position sizing (v1). */
export type PositionSizingConfig = {
  /** Fractional Kelly multiplier applied to full Kelly (e.g. 0.25 = quarter Kelly). */
  kellyFraction: number;
  /** Hard cap on recommended bankroll fraction. */
  maxFraction: number;
  /** Minimum recommended fraction; below this returns zero size. */
  minFraction: number;
};

export const DEFAULT_POSITION_SIZING_CONFIG: PositionSizingConfig = {
  kellyFraction: 0.25,
  maxFraction: 0.1,
  minFraction: 0.005,
};

export const POSITION_SIZING_MODEL_VERSION = "5.7.0";
