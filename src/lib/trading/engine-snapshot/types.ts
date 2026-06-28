import type { ReasoningOutcome, ReasoningPhase, TradeAction } from "@/types/domain/trading";

export type SnapshotStepItem = {
  id: string;
  label: string;
  phase: ReasoningPhase;
  outcome: ReasoningOutcome;
  detail: string | null;
};

export type EngineSnapshotDecisionSection = {
  action: TradeAction;
};

export type EngineSnapshotProbabilitySection = {
  up: string | null;
  down: string | null;
  confidence: string | null;
  available: boolean;
};

export type EngineSnapshotExpectedValueSection = {
  bestSide: string | null;
  edgePercent: string | null;
  netEv: string | null;
  available: boolean;
};

export type EngineSnapshotPositionSizingSection = {
  recommendedPercent: string | null;
  recommendedDollars: string | null;
  side: string | null;
  available: boolean;
};

export type EngineSnapshotReasoningSection = {
  summary: string;
};

export type EngineSnapshotTechnicalSection = {
  steps: readonly SnapshotStepItem[];
};

export type EngineSnapshotMetadataSection = {
  engineVersion: string;
  probabilityVersion: string | null;
  expectedValueVersion: string | null;
  policyVersion: string | null;
  positionSizingVersion: string | null;
};

/** Compact, serializable engine snapshot for export, QA, and diagnostics. */
export type EngineSnapshotPresentation = {
  modelVersion: string;
  headline: string;
  summary: string;
  decision: EngineSnapshotDecisionSection;
  probability: EngineSnapshotProbabilitySection;
  expectedValue: EngineSnapshotExpectedValueSection;
  positionSizing: EngineSnapshotPositionSizingSection;
  reasoning: EngineSnapshotReasoningSection;
  technical: EngineSnapshotTechnicalSection;
  metadata: EngineSnapshotMetadataSection;
};
