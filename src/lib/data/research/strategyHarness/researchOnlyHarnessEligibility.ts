import type { HypothesisPriorityCategory } from "@/lib/data/research/hypothesisFailureAnalysis/hypothesisFailureAnalysisTypes";

import {
  normalizeHarnessStrategyFamily,
  type RawSynthesizedStrategySpec,
} from "./normalizeSynthesizedStrategySpec";

export const RESEARCH_ONLY_MIN_ROBUSTNESS_SCORE = 45;
export const RESEARCH_ONLY_MIN_OBSERVATIONS = 6;

export const HARNESS_RESEARCH_ONLY_WARNING =
  "Research-only backtest: results are diagnostic and not promotion-eligible.";

export const DEFAULT_HYPOTHESIS_FAILURE_ANALYSIS_PATH =
  "data/research-results/hypothesis-failure-analysis.json";

export type HypothesisFailureAnalysisIndex = ReadonlyMap<
  string,
  { priorityCategory: HypothesisPriorityCategory }
>;

export type ResearchOnlyHarnessEligibilityResult = {
  eligible: boolean;
  reason: string;
};

function formatRobustnessScore(score: number | null): string {
  return score === null ? "null" : String(score);
}

function formatObservationCount(count: number | null): string {
  return count === null ? "null" : String(count);
}

/** Evaluates whether a rejected synthesized strategy is research-worthy for harness backtest. */
export function evaluateResearchOnlyHarnessEligibility(
  raw: RawSynthesizedStrategySpec,
  context: {
    failureAnalysisByHypothesisId: HypothesisFailureAnalysisIndex | null;
  },
): ResearchOnlyHarnessEligibilityResult {
  if (raw.promotionStatus !== "rejected") {
    return {
      eligible: false,
      reason: "Not a rejected strategy.",
    };
  }

  const robustnessScore = raw.validationSummary.robustnessScore;
  if (
    robustnessScore === null
    || robustnessScore < RESEARCH_ONLY_MIN_ROBUSTNESS_SCORE
  ) {
    return {
      eligible: false,
      reason: `Robustness score ${formatRobustnessScore(robustnessScore)} is below research-only floor (${RESEARCH_ONLY_MIN_ROBUSTNESS_SCORE}).`,
    };
  }

  const observationCount = raw.validationSummary.observationCount;
  if (
    observationCount === null
    || observationCount < RESEARCH_ONLY_MIN_OBSERVATIONS
  ) {
    return {
      eligible: false,
      reason: `Observation count ${formatObservationCount(observationCount)} is below minimum (${RESEARCH_ONLY_MIN_OBSERVATIONS}).`,
    };
  }

  if (!raw.exitAssumption.trim()) {
    return {
      eligible: false,
      reason: "Missing exit assumption.",
    };
  }

  const supportedFamily = normalizeHarnessStrategyFamily(raw.strategyFamily);
  if (!supportedFamily) {
    return {
      eligible: false,
      reason: `Unsupported strategy family "${raw.strategyFamily}".`,
    };
  }

  const failureAnalysis = context.failureAnalysisByHypothesisId?.get(
    raw.hypothesisId,
  );

  if (failureAnalysis) {
    if (failureAnalysis.priorityCategory === "blocked-by-coverage") {
      return {
        eligible: false,
        reason: "Hypothesis is blocked by coverage per failure analysis.",
      };
    }

    if (failureAnalysis.priorityCategory === "likely-spurious") {
      return {
        eligible: false,
        reason: "Hypothesis classified as likely-spurious.",
      };
    }

    if (failureAnalysis.priorityCategory !== "near-promising") {
      return {
        eligible: false,
        reason: `Priority category "${failureAnalysis.priorityCategory}" is not near-promising.`,
      };
    }
  }

  if (failureAnalysis) {
    return {
      eligible: true,
      reason: "Near-promising rejected strategy eligible for research-only backtest.",
    };
  }

  return {
    eligible: true,
    reason:
      "Rejected strategy meets research-only robustness and observation floors (failure analysis not loaded).",
  };
}
