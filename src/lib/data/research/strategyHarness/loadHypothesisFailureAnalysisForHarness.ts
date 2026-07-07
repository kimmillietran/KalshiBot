import type { HypothesisPriorityCategory } from "@/lib/data/research/hypothesisFailureAnalysis/hypothesisFailureAnalysisTypes";

import {
  DEFAULT_HYPOTHESIS_FAILURE_ANALYSIS_PATH,
  type HypothesisFailureAnalysisIndex,
} from "./researchOnlyHarnessEligibility";
import type { StrategyHarnessIo } from "./strategyHarnessTypes";

const PRIORITY_CATEGORIES = new Set<HypothesisPriorityCategory>([
  "near-promising",
  "needs-more-data",
  "likely-spurious",
  "blocked-by-coverage",
]);

function isPriorityCategory(value: unknown): value is HypothesisPriorityCategory {
  return typeof value === "string" && PRIORITY_CATEGORIES.has(value as HypothesisPriorityCategory);
}

/** Loads hypothesis failure analysis priority categories keyed by hypothesis id. */
export function loadHypothesisFailureAnalysisForHarness(
  io: StrategyHarnessIo,
  path = DEFAULT_HYPOTHESIS_FAILURE_ANALYSIS_PATH,
): HypothesisFailureAnalysisIndex | null {
  if (!io.fileExists(path)) {
    return null;
  }

  try {
    const parsed = JSON.parse(io.readFile(path)) as {
      analyses?: unknown;
    };

    if (!Array.isArray(parsed.analyses)) {
      return null;
    }

    const index: Map<string, { priorityCategory: HypothesisPriorityCategory }> =
      new Map();

    for (const entry of parsed.analyses) {
      if (
        typeof entry !== "object"
        || entry === null
        || typeof (entry as { hypothesisId?: unknown }).hypothesisId !== "string"
        || !isPriorityCategory((entry as { priorityCategory?: unknown }).priorityCategory)
      ) {
        continue;
      }

      const hypothesisId = (entry as { hypothesisId: string }).hypothesisId;
      const priorityCategory = (entry as { priorityCategory: HypothesisPriorityCategory })
        .priorityCategory;
      index.set(hypothesisId, { priorityCategory });
    }

    return index.size > 0 ? index : null;
  } catch {
    return null;
  }
}
