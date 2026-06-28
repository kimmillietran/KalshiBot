import type { TradeDecision } from "@/types/domain/trading";

import {
  ENGINE_SNAPSHOT_MODEL_VERSION,
  SNAPSHOT_HEADLINES,
  SNAPSHOT_POLICY_VERSION,
} from "./config";
import {
  formatExpectedValueSection,
  formatPositionSizingSection,
  formatProbabilitySection,
  formatSnapshotSteps,
} from "./formatSnapshotSections";
import type { EngineSnapshotPresentation } from "./types";

function snapshotHeadline(action: TradeDecision["action"]): string {
  return SNAPSHOT_HEADLINES[action] ?? `Engine snapshot — ${action}`;
}

/**
 * Builds a compact, serializable presentation from an engine TradeDecision.
 * Formatting only — no model math or policy logic.
 */
export function summarizeEngineSnapshot(
  decision: TradeDecision,
): EngineSnapshotPresentation {
  return {
    modelVersion: ENGINE_SNAPSHOT_MODEL_VERSION,
    headline: snapshotHeadline(decision.action),
    summary: decision.reasoning.summary,
    decision: {
      action: decision.action,
    },
    probability: formatProbabilitySection(decision.probability),
    expectedValue: formatExpectedValueSection(decision.expectedValue),
    positionSizing: formatPositionSizingSection(decision.positionSize),
    reasoning: {
      summary: decision.reasoning.summary,
    },
    technical: {
      steps: formatSnapshotSteps(decision.reasoning.steps),
    },
    metadata: {
      engineVersion: decision.engineVersion,
      probabilityVersion: decision.probability?.modelVersion ?? null,
      expectedValueVersion: decision.expectedValue?.modelVersion ?? null,
      policyVersion: decision.probability ? SNAPSHOT_POLICY_VERSION : null,
      positionSizingVersion: decision.positionSize?.modelVersion ?? null,
    },
  };
}

export {
  ENGINE_SNAPSHOT_MODEL_VERSION,
  SNAPSHOT_HEADLINES,
  SNAPSHOT_POLICY_VERSION,
  SNAPSHOT_STEP_LABELS,
  SNAPSHOT_UNAVAILABLE_LABEL,
} from "./config";

export {
  formatExpectedValueSection,
  formatPositionSizingSection,
  formatProbabilitySection,
  formatSnapshotSteps,
} from "./formatSnapshotSections";

export type {
  EngineSnapshotDecisionSection,
  EngineSnapshotExpectedValueSection,
  EngineSnapshotMetadataSection,
  EngineSnapshotPositionSizingSection,
  EngineSnapshotPresentation,
  EngineSnapshotProbabilitySection,
  EngineSnapshotReasoningSection,
  EngineSnapshotTechnicalSection,
  SnapshotStepItem,
} from "./types";
