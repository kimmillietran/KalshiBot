import { analyzeHypothesisEvolution } from "@/lib/data/research/hypothesisEvolution";
import type { HypothesisHistoryDocument } from "@/lib/data/research/hypothesisEvolution/hypothesisEvolutionTypes";

import type { HypothesisEvolutionSection } from "./pipelineDashboardTypes";

/** Builds the dashboard hypothesis evolution section from longitudinal history. */
export function buildHypothesisEvolutionSection(
  history: HypothesisHistoryDocument | null,
): HypothesisEvolutionSection {
  if (!history || history.runs.length === 0) {
    return {
      historyPath: history?.outputPath ?? "data/research-results/hypothesis-history.json",
      historyPresent: history !== null,
      runCount: 0,
      strongestImprovingHypothesis: null,
      largestRobustnessGain: null,
      largestObservationGrowth: null,
      approachingPromotion: [],
      regressedHypotheses: [],
      strengtheningCount: 0,
      weakeningCount: 0,
    };
  }

  const analysis = analyzeHypothesisEvolution(history);

  return {
    historyPath: history.outputPath,
    historyPresent: true,
    runCount: analysis.summary.runCount,
    strongestImprovingHypothesis: analysis.highlights.strongestImprovingHypothesis,
    largestRobustnessGain: analysis.highlights.largestRobustnessGain,
    largestObservationGrowth: analysis.highlights.largestObservationGrowth,
    approachingPromotion: [...analysis.highlights.approachingPromotion],
    regressedHypotheses: [...analysis.highlights.regressedHypotheses],
    strengtheningCount: analysis.summary.strengtheningCount,
    weakeningCount: analysis.summary.weakeningCount,
  };
}
