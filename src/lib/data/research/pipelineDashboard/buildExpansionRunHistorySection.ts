import type { ExpansionRunHistoryDocument } from "@/lib/data/research/expansionRunHistory/expansionRunHistoryTypes";
import { analyzeExpansionRunHistory } from "@/lib/data/research/expansionRunHistory/analyzeExpansionRunHistory";

import type { ExpansionRunHistorySection } from "./pipelineDashboardTypes";

/** Builds the dashboard expansion run history section from longitudinal history. */
export function buildExpansionRunHistorySection(
  history: ExpansionRunHistoryDocument | null,
): ExpansionRunHistorySection {
  if (!history || history.runs.length === 0) {
    return {
      historyPath: history?.outputPath ?? "data/research-results/expansion-run-history.json",
      historyPresent: history !== null,
      runCount: 0,
      latestRunGeneratedAt: null,
      latestImportedCount: null,
      latestImportsPerMinute: null,
      bestThroughputImportsPerMinute: null,
      bestThroughputGeneratedAt: null,
      worstBottleneckDiscoveryShare: null,
      worstBottleneckGeneratedAt: null,
      efficiencyImproving: null,
    };
  }

  const analysis = analyzeExpansionRunHistory(history.runs);

  return {
    historyPath: history.outputPath,
    historyPresent: true,
    runCount: history.runs.length,
    latestRunGeneratedAt: analysis.highlights.latestRun?.generatedAt ?? null,
    latestImportedCount: analysis.highlights.latestRun?.importedCount ?? null,
    latestImportsPerMinute: analysis.highlights.latestRun?.importsPerMinute ?? null,
    bestThroughputImportsPerMinute:
      analysis.highlights.bestThroughputRun?.importsPerMinute ?? null,
    bestThroughputGeneratedAt: analysis.highlights.bestThroughputRun?.generatedAt ?? null,
    worstBottleneckDiscoveryShare:
      analysis.highlights.worstBottleneckRun?.discoveryOverheadShare ?? null,
    worstBottleneckGeneratedAt: analysis.highlights.worstBottleneckRun?.generatedAt ?? null,
    efficiencyImproving: analysis.highlights.efficiencyImproving,
  };
}
