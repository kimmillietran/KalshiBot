import type { MarketFeatureVector } from "@/lib/features/types";
import type { ProbabilityEstimate } from "@/lib/trading/probability/types";
import type { GuardStepId } from "@/lib/trading/guards/evaluationGuards";

/**
 * Domain vocabulary for the deterministic trading engine.
 * Vendor/feature shapes are mapped into these types before evaluation.
 */

export const MarketLifecycle = {
  UPCOMING: "UPCOMING",
  ACTIVE: "ACTIVE",
  CLOSED: "CLOSED",
  SETTLED: "SETTLED",
  UNKNOWN: "UNKNOWN",
} as const;

export type MarketLifecycle =
  (typeof MarketLifecycle)[keyof typeof MarketLifecycle];

export type LiquidityQuality = "Poor" | "Fair" | "Good" | "Excellent";

export type TradeAction = "BUY UP" | "BUY DOWN" | "HOLD" | "NO TRADE";

export type EvaluationMarketSnapshot = {
  ticker: string;
  lifecycle: MarketLifecycle;
  /** Kalshi target / strike price in USD. Required for tradable evaluation. */
  strikePrice: number | null;
  timeRemainingMs: number;
  closeTime: string | null;
};

export type BtcFeedStatus =
  | "loading"
  | "live"
  | "stale"
  | "error"
  | "fallback";

export type EvaluationCandleSnapshot = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type EvaluationBtcSnapshot = {
  price: number;
  change24hPercent: number | null;
  feedStatus: BtcFeedStatus;
  /** `fallback` when demo price is used; `upstream` when live BFF data is active. */
  providerSource: "fallback" | "upstream" | "unknown";
  candles: readonly EvaluationCandleSnapshot[];
};

export type EvaluationPricingSnapshot = {
  yesBidCents: number | null;
  yesAskCents: number | null;
  yesMidCents: number | null;
  noBidCents: number | null;
  noAskCents: number | null;
  noMidCents: number | null;
  liquidityQuality: LiquidityQuality;
  /** Parsed contract volume in USD when available from Kalshi metadata. */
  volumeDollars: number | null;
};

/**
 * Immutable input assembled by a future orchestrator (BFF or server action).
 * `evaluatedAt` must be supplied by the caller — the engine never reads the clock.
 */
export type EvaluationSnapshot = {
  evaluatedAt: string;
  market: EvaluationMarketSnapshot | null;
  btc: EvaluationBtcSnapshot | null;
  pricing: EvaluationPricingSnapshot | null;
};

export type EngineConfig = {
  enabled: boolean;
  minEdgePercent: number;
  minLiquidityQuality: LiquidityQuality;
  maxSpreadPercent: number;
  minimumTimeRemaining: number;
  minimumCandles: number;
};

export type ReasoningPhase = "guard" | "model" | "execution";

export type ReasoningOutcome = "pass" | "fail" | "skip";

export type ReasoningStep = {
  id: string;
  phase: ReasoningPhase;
  summary: string;
  outcome: ReasoningOutcome;
  detail?: string;
};

export type ReasoningTrace = {
  steps: readonly ReasoningStep[];
  summary: string;
};

export type TradeDecision = {
  action: TradeAction;
  engineVersion: string;
  configHash: string;
  reasoning: ReasoningTrace;
  /** Echo of `snapshot.evaluatedAt` for audit alignment. */
  evaluatedAt: string;
  /**
   * Deterministic feature vector from `buildMarketFeatureVector()`.
   * `null` when evaluation exits before feature extraction (guard failure).
   */
  features: MarketFeatureVector | null;
  /**
   * Fair-value probability from `estimateProbability()`.
   * `null` when evaluation exits before probability estimation (guard failure).
   */
  probability: ProbabilityEstimate | null;
  gatesTriggered?: readonly GuardStepId[];
};
