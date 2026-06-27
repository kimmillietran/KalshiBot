import type { PositionSizeEstimate } from "@/lib/trading/position-sizing/types";
import type { ReasoningOutcome, ReasoningPhase, TradeDecision } from "@/types/domain/trading";

export type ReasoningTraceItem = {
  id: string;
  label: string;
  phase: ReasoningPhase;
  outcome: ReasoningOutcome;
  detail: string | null;
};

export type ReasoningPresentation = {
  modelVersion: string;
  headline: string;
  summary: string;
  primaryReason: string | null;
  supportingReasons: readonly string[];
  riskNotes: readonly string[];
  technicalTrace: readonly ReasoningTraceItem[];
};

/**
 * Optional post-5.7B extensions — not required for 5.8A.
 * `positionSize` is ignored until a future presentation revision wires it in.
 */
export type ReasoningPresentationExtensions = {
  positionSize?: PositionSizeEstimate | null;
};

export type SummarizeTradeDecisionInput = {
  decision: TradeDecision;
  config?: ReasoningPresentationConfig;
  extensions?: ReasoningPresentationExtensions;
};

/** Tunable copy for deterministic reasoning presentation. */
export type ReasoningPresentationConfig = {
  headlineBuyUp: string;
  headlineBuyDown: string;
  headlineNoTradePolicy: string;
  headlineNoTradeGuard: string;
  headlineHold: string;
  executionDisabledNote: string;
  probabilityUnavailableNote: string;
  expectedValueUnavailableNote: string;
  featuresUnavailableNote: string;
};
