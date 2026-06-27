import type { ReasoningStep } from "@/types/domain/trading";

import {
  DEFAULT_REASONING_PRESENTATION_CONFIG,
  REASONING_STEP_LABELS,
} from "./config";
import type { ReasoningPresentationConfig, ReasoningTraceItem } from "./types";

function formatGuardLabel(stepId: string): string {
  if (stepId in REASONING_STEP_LABELS) {
    return REASONING_STEP_LABELS[stepId];
  }

  return stepId.replace(/^guard-/, "").replace(/-/g, " ");
}

function resolveStepLabel(
  step: ReasoningStep,
  config: ReasoningPresentationConfig,
): string {
  void config;
  return REASONING_STEP_LABELS[step.id] ?? step.summary;
}

/** Maps engine reasoning steps into presentation trace items (order preserved). */
export function formatReasoningTrace(
  steps: readonly ReasoningStep[],
  config: ReasoningPresentationConfig = DEFAULT_REASONING_PRESENTATION_CONFIG,
): readonly ReasoningTraceItem[] {
  void config;

  return steps.map((step) => ({
    id: step.id,
    label: resolveStepLabel(step, config),
    phase: step.phase,
    outcome: step.outcome,
    detail: step.detail ?? null,
  }));
}

export function formatGuardGateLabel(gateId: string): string {
  return formatGuardLabel(gateId);
}
