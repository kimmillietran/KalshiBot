import { stableStringify } from "@/lib/trading/config/hashConfig";

import { buildHarnessStrategyResult, resolveHarnessResultsConfig } from "./deriveHarnessPromotionRecommendation";
import type {
  BuildHarnessResultsReportInput,
  HarnessResultsReport,
  HarnessResultsSummary,
} from "./harnessResultsTypes";

function groupHarnessResultsByStrategyId(
  results: BuildHarnessResultsReportInput["harnessSummary"],
): Map<string, BuildHarnessResultsReportInput["harnessSummary"] extends null ? never : NonNullable<BuildHarnessResultsReportInput["harnessSummary"]>["results"][number][]> {
  const grouped = new Map<string, NonNullable<BuildHarnessResultsReportInput["harnessSummary"]>["results"][number][]>();

  if (!results) {
    return grouped;
  }

  for (const result of results.results) {
    const key = result.synthesizedStrategyId;
    const existing = grouped.get(key) ?? [];
    existing.push(result);
    grouped.set(key, existing);
  }

  return grouped;
}

function buildSummary(
  strategies: HarnessResultsReport["strategies"],
): HarnessResultsSummary {
  const recommendationCounts = {
    reject: 0,
    needsMoreData: 0,
    candidate: 0,
  };

  for (const strategy of strategies) {
    if (strategy.promotionRecommendation === "reject") {
      recommendationCounts.reject += 1;
    } else if (strategy.promotionRecommendation === "needs-more-data") {
      recommendationCounts.needsMoreData += 1;
    } else {
      recommendationCounts.candidate += 1;
    }
  }

  return {
    totalStrategies: strategies.length,
    evaluatedCount: strategies.filter((strategy) => strategy.runStatus !== "not-run").length,
    recommendationCounts,
  };
}

/** Builds harness results JSON from synthesis specs and harness run outputs. */
export function buildHarnessResultsReport(
  input: BuildHarnessResultsReportInput,
): HarnessResultsReport {
  const config = resolveHarnessResultsConfig(input.config);
  const groupedResults = groupHarnessResultsByStrategyId(input.harnessSummary);

  const strategies = [...input.synthesisStrategies]
    .sort((left, right) => left.strategyId.localeCompare(right.strategyId))
    .map((strategy) =>
      buildHarnessStrategyResult({
        strategy,
        harnessResults: groupedResults.get(strategy.strategyId) ?? [],
        validation: input.validationByHypothesisId.get(strategy.hypothesisId) ?? null,
        leaderboardStrategyIds: input.leaderboardStrategyIds,
        readFile: input.readFile,
        config,
      }),
    );

  return {
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
    inputPaths: input.inputPaths,
    config,
    summary: buildSummary(strategies),
    strategies,
  };
}

export function serializeHarnessResultsReport(report: HarnessResultsReport): string {
  return stableStringify(report);
}
