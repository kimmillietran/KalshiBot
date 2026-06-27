export { DEFAULT_ENGINE_CONFIG } from "@/lib/trading/config/defaults";
export { fnv1a32, hashConfig, stableStringify } from "@/lib/trading/config/hashConfig";
export { evaluate } from "@/lib/trading/evaluate";
export { extractFeaturesFromSnapshot } from "@/lib/trading/features/extractFeatures";
export {
  hasMarket,
  hasStrike,
  isActiveLifecycle,
  MarketLifecycle,
} from "@/lib/trading/snapshot/types";
export { parseVolumeLabelDollars } from "@/lib/trading/snapshot/parseVolumeDollars";
export { snapshotToFeatureInput } from "@/lib/trading/snapshot/toFeatureInput";
export { ENGINE_VERSION } from "@/lib/trading/versioning";

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
