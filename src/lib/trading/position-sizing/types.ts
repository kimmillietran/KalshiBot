import type { ExpectedValueEstimate } from "@/lib/trading/expected-value/types";
import type { ProbabilityEstimate } from "@/lib/trading/probability/types";
import type { EngineConfig, TradeAction } from "@/types/domain/trading";

export type PositionSide = "yes" | "no";

export type EstimatePositionSizeInput = {
  action: TradeAction;
  probability: ProbabilityEstimate;
  expectedValue: ExpectedValueEstimate;
  engineConfig: EngineConfig;
  /** Optional bankroll in USD; when absent, dollar sizing is omitted. */
  bankrollDollars?: number | null;
};

/**
 * Kelly-based position sizing recommendation (fraction of bankroll).
 * Builder #2 wires after decision policy in `evaluate()`.
 */
export type PositionSizeEstimate = {
  modelVersion: string;
  side: PositionSide | null;
  /** Final recommended fraction of bankroll in [0, maxFraction]. */
  recommendedFraction: number;
  /** `recommendedFraction × 100`. */
  recommendedPercent: number;
  /** `bankrollDollars × recommendedFraction` when bankroll is valid; otherwise null. */
  recommendedDollars: number | null;
  /** Fraction after fractional Kelly, confidence, and max cap. */
  cappedFraction: number;
  /** Full Kelly fraction before fractional scaling and dampening. */
  rawKellyFraction: number;
  reasoning: readonly string[];
};
