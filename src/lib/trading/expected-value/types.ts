import type { MarketFeatureVector } from "@/lib/features/types";
import type { EvaluationPricingSnapshot } from "@/types/domain/trading";
import type { ProbabilityEstimate } from "@/lib/trading/probability";

export type ExpectedValueSide = "yes" | "no";

export type ExpectedValuePricingInput = Pick<
  EvaluationPricingSnapshot,
  "yesBidCents" | "yesAskCents" | "noBidCents" | "noAskCents"
>;

export type EstimateExpectedValueInput = {
  probability: ProbabilityEstimate;
  features: MarketFeatureVector;
  pricing: ExpectedValuePricingInput;
};

export type ExpectedValueReasoning = {
  summary: string;
  lines: readonly string[];
};

/**
 * Per-contract expected value vs Kalshi ask prices.
 * All currency fields are in cents per $1 contract payout.
 */
export type ExpectedValueEstimate = {
  modelVersion: string;
  /** Gross EV for buying YES at ask, before fees. */
  evYesCents: number;
  /** Gross EV for buying NO at ask, before fees. */
  evNoCents: number;
  /** Net EV after configured fees. */
  netEvYesCents: number;
  netEvNoCents: number;
  /** Model fair YES price in cents (probabilityUp × 100). */
  fairYesCents: number;
  /** Model fair NO price in cents (probabilityDown × 100). */
  fairNoCents: number;
  /** Edge vs YES ask in percent points: (fair − ask) / ask × 100. */
  edgeYesPercent: number;
  /** Edge vs NO ask in percent points. */
  edgeNoPercent: number;
  /** Side with highest net EV, null when both sides are invalid. */
  bestSide: ExpectedValueSide | null;
  /** Net EV of the best side in cents. */
  bestEvCents: number;
  /** Confidence after spread/liquidity adjustment in [0, 1]. */
  confidence: number;
  reasoning: ExpectedValueReasoning;
};

export class ExpectedValueInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExpectedValueInputError";
  }
}
