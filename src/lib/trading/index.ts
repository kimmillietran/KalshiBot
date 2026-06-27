export { DEFAULT_ENGINE_CONFIG } from "@/lib/trading/config/defaults";
export { fnv1a32, hashConfig, stableStringify } from "@/lib/trading/config/hashConfig";
export { evaluate } from "@/lib/trading/evaluate";
export {
  hasMarket,
  hasStrike,
  isActiveLifecycle,
  MarketLifecycle,
} from "@/lib/trading/snapshot/types";
export { ENGINE_VERSION } from "@/lib/trading/versioning";

export type {
  EngineConfig,
  EvaluationBtcSnapshot,
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
