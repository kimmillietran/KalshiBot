import type { MarketFeatureVector } from "@/lib/features/types";
import type { ExpectedValueEstimate } from "@/lib/trading/expected-value/types";
import type { ProbabilityEstimate } from "@/lib/trading/probability/types";
import type { EngineConfig } from "@/types/domain/trading";

export type DecisionPolicyAction = "BUY_UP" | "BUY_DOWN" | "NO_TRADE";

export type DecisionPolicySide = "yes" | "no";

export type DecisionPolicyReasonCode =
  | "POLICY_DISABLED"
  | "CONFIDENCE_BELOW_THRESHOLD"
  | "EDGE_BELOW_THRESHOLD"
  | "NO_QUALIFYING_SIDE"
  | "INVALID_INPUT"
  | "BUY_UP"
  | "BUY_DOWN"
  | "BUY_UP_TIE_BREAK";

export type EvaluateDecisionPolicyInput = {
  features: MarketFeatureVector;
  probability: ProbabilityEstimate;
  expectedValue: ExpectedValueEstimate;
  engineConfig: EngineConfig;
};

/**
 * Deterministic trade action from model probability, EV, and engine thresholds.
 * Builder #2 maps `action` to domain `TradeAction` when wiring `evaluate()`.
 */
export type DecisionPolicyResult = {
  modelVersion: string;
  action: DecisionPolicyAction;
  selectedSide: DecisionPolicySide | null;
  reasonCode: DecisionPolicyReasonCode;
  /** Combined model confidence in [0, 1]. */
  confidence: number;
  reasoning: readonly string[];
};
