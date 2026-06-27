export { DEFAULT_ENGINE_CONFIG } from "@/lib/trading/config/defaults";
export { fnv1a32, hashConfig, stableStringify } from "@/lib/trading/config/hashConfig";
export { evaluate } from "@/lib/trading/evaluate";
export { extractFeaturesFromSnapshot } from "@/lib/trading/features/extractFeatures";
export {
  estimateProbability,
  DEFAULT_PROBABILITY_MODEL_CONFIG,
  PROBABILITY_MODEL_VERSION,
} from "@/lib/trading/probability";
export { GUARD_STEP_ORDER, runEvaluationGuards, type GuardStepId } from "@/lib/trading/guards";
export {
  hasMarket,
  hasStrike,
  isActiveLifecycle,
  MarketLifecycle,
} from "@/lib/trading/snapshot/types";
export { parseVolumeLabelDollars } from "@/lib/trading/snapshot/parseVolumeDollars";
export { snapshotToFeatureInput } from "@/lib/trading/snapshot/toFeatureInput";
export { ENGINE_VERSION } from "@/lib/trading/versioning";
export {
  estimateExpectedValue,
  buildExpectedValueReasoning,
  DEFAULT_EXPECTED_VALUE_CONFIG,
  EXPECTED_VALUE_MODEL_VERSION,
  ExpectedValueInputError,
} from "@/lib/trading/expected-value";
export {
  evaluateDecisionPolicy,
  buildDecisionPolicyReasoning,
  DEFAULT_DECISION_POLICY_CONFIG,
  DECISION_POLICY_MODEL_VERSION,
} from "@/lib/trading/decision-policy";
export {
  estimatePositionSize,
  buildPositionSizingReasoning,
  rawKellyFraction,
  DEFAULT_POSITION_SIZING_CONFIG,
  POSITION_SIZING_MODEL_VERSION,
} from "@/lib/trading/position-sizing";

export type {
  EstimateExpectedValueInput,
  ExpectedValueConfig,
  ExpectedValueEstimate,
  ExpectedValuePricingInput,
  ExpectedValueReasoning,
  ExpectedValueSide,
} from "@/lib/trading/expected-value";

export type {
  DecisionPolicyAction,
  DecisionPolicyConfig,
  DecisionPolicyReasonCode,
  DecisionPolicyResult,
  DecisionPolicySide,
  EvaluateDecisionPolicyInput,
} from "@/lib/trading/decision-policy";

export type {
  EstimatePositionSizeInput,
  PositionSide,
  PositionSizeEstimate,
} from "@/lib/trading/position-sizing";

export type { PositionSizingConfig } from "@/lib/trading/position-sizing";

export type {
  BtcFeedStatus,
  EngineConfig,
  EvaluationBtcSnapshot,
  EvaluationCandleSnapshot,
  EvaluationMarketSnapshot,
  EvaluationPricingSnapshot,
  EvaluationSnapshot,
  LiquidityQuality,
  ReasoningOutcome,
  ReasoningPhase,
  ReasoningStep,
  ReasoningTrace,
  TradeAction,
  TradeDecision,
} from "@/types/domain/trading";

export type { MarketFeatureVector } from "@/lib/features/types";

export type {
  ProbabilityDriver,
  ProbabilityDriverContribution,
  ProbabilityEstimate,
  ProbabilityModelConfig,
} from "@/lib/trading/probability";
