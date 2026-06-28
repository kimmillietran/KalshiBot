import type { ExpectedValueEstimate } from "@/lib/trading/expected-value/types";
import type { PositionSizeEstimate } from "@/lib/trading/position-sizing/types";
import type { ProbabilityEstimate } from "@/lib/trading/probability/types";
import type { ReasoningStep } from "@/types/domain/trading";

import { SNAPSHOT_STEP_LABELS } from "./config";
import type {
  EngineSnapshotExpectedValueSection,
  EngineSnapshotPositionSizingSection,
  EngineSnapshotProbabilitySection,
  SnapshotStepItem,
} from "./types";

function formatProbabilityPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function formatConfidencePercent(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

function formatSignedEdgePercent(value: number): string {
  const prefix = value >= 0 ? "+" : "";
  return `${prefix}${value.toFixed(2)}%`;
}

function formatSignedCents(value: number): string {
  const prefix = value >= 0 ? "+" : "";
  return `${prefix}${value.toFixed(2)}¢`;
}

function formatRecommendedPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

function formatRecommendedDollars(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatSideLabel(side: "yes" | "no" | null): string | null {
  if (side === "yes") return "YES";
  if (side === "no") return "NO";
  return null;
}

function resolveStepLabel(step: ReasoningStep): string {
  return SNAPSHOT_STEP_LABELS[step.id] ?? step.summary;
}

export function formatSnapshotSteps(
  steps: readonly ReasoningStep[],
): readonly SnapshotStepItem[] {
  return steps.map((step) => ({
    id: step.id,
    label: resolveStepLabel(step),
    phase: step.phase,
    outcome: step.outcome,
    detail: step.detail ?? null,
  }));
}

export function formatProbabilitySection(
  probability: ProbabilityEstimate | null,
): EngineSnapshotProbabilitySection {
  if (!probability) {
    return {
      up: null,
      down: null,
      confidence: null,
      available: false,
    };
  }

  return {
    up: formatProbabilityPercent(probability.probabilityUp),
    down: formatProbabilityPercent(probability.probabilityDown),
    confidence: formatConfidencePercent(probability.confidence),
    available: true,
  };
}

function bestEdgePercent(expectedValue: ExpectedValueEstimate): number {
  if (expectedValue.bestSide === "yes") {
    return expectedValue.edgeYesPercent;
  }
  if (expectedValue.bestSide === "no") {
    return expectedValue.edgeNoPercent;
  }
  return Math.max(expectedValue.edgeYesPercent, expectedValue.edgeNoPercent);
}

export function formatExpectedValueSection(
  expectedValue: ExpectedValueEstimate | null,
): EngineSnapshotExpectedValueSection {
  if (!expectedValue) {
    return {
      bestSide: null,
      edgePercent: null,
      netEv: null,
      available: false,
    };
  }

  return {
    bestSide: formatSideLabel(expectedValue.bestSide),
    edgePercent: formatSignedEdgePercent(bestEdgePercent(expectedValue)),
    netEv: formatSignedCents(expectedValue.bestEvCents),
    available: true,
  };
}

export function formatPositionSizingSection(
  positionSize: PositionSizeEstimate | null,
): EngineSnapshotPositionSizingSection {
  if (!positionSize) {
    return {
      recommendedPercent: null,
      recommendedDollars: null,
      side: null,
      available: false,
    };
  }

  return {
    recommendedPercent: formatRecommendedPercent(positionSize.recommendedPercent),
    recommendedDollars:
      positionSize.recommendedDollars === null
        ? null
        : formatRecommendedDollars(positionSize.recommendedDollars),
    side: formatSideLabel(positionSize.side),
    available: true,
  };
}
