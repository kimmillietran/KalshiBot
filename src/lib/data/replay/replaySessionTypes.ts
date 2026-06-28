import type {
  HistoricalSnapshotProvenance,
  HistoricalTradingSnapshot,
  SnapshotTemporalMetadata,
} from "@/lib/data/snapshots/types";
import type { HistoricalTicker } from "@/lib/data/types";
import type { EngineConfig, EvaluationSnapshot, TradeDecision } from "@/types/domain/trading";

export type ReplayStepResult = {
  /** Zero-based index of this replay step within the ordered timeline. */
  stepIndex: number;
  sourceTicker: HistoricalTicker;
  temporal: SnapshotTemporalMetadata;
  provenance: HistoricalSnapshotProvenance;
  engineInput: EvaluationSnapshot;
  engineOutput: TradeDecision;
  sourceSnapshot: HistoricalTradingSnapshot;
};

export type ReplaySessionState = {
  /** Cursor index for the next step to execute. */
  stepIndex: number;
  totalSteps: number;
  isEmpty: boolean;
  isComplete: boolean;
  canStep: boolean;
};

export type CreateReplaySessionInput = {
  snapshots: readonly HistoricalTradingSnapshot[];
  engineConfig: EngineConfig;
};

export type ReplayStepOutput = {
  session: import("./ReplaySession").ReplaySession;
  result: ReplayStepResult | null;
};

export type ReplayStepAllOutput = {
  session: import("./ReplaySession").ReplaySession;
  results: readonly ReplayStepResult[];
};
