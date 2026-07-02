import { stableStringify } from "@/lib/trading/config/hashConfig";

import { normalizeRootPath } from "../aggregation/researchAggregatePaths";
import { discoverStrategyAggregateSummaries } from "../leaderboard/discoverStrategyAggregateSummaries";
import {
  StrategyLeaderboardError,
  StrategyLeaderboardErrorCode,
} from "../leaderboard/strategyLeaderboardTypes";

import {
  computeStrategyStatisticalSignificance,
  resolveStatisticalSignificanceConfig,
} from "./computeStrategySignificance";
import type {
  BuildStatisticalSignificanceReportInput,
  StatisticalSignificanceIo,
  StatisticalSignificanceReport,
} from "./statisticalSignificanceTypes";
import type { ParsedStrategyAggregateSummary } from "../leaderboard/strategyLeaderboardTypes";

function discoverSummariesOrEmpty(
  inputRoot: string,
  io: StatisticalSignificanceIo,
): readonly ParsedStrategyAggregateSummary[] {
  try {
    return discoverStrategyAggregateSummaries(inputRoot, io);
  } catch (error) {
    if (
      error instanceof StrategyLeaderboardError &&
      error.code === StrategyLeaderboardErrorCode.EMPTY_DATASET
    ) {
      return [];
    }

    throw error;
  }
}

function sortStrategies(
  strategies: StatisticalSignificanceReport["strategies"],
): StatisticalSignificanceReport["strategies"] {
  return [...strategies].sort((left, right) =>
    left.strategyId.localeCompare(right.strategyId),
  );
}

/** Builds a deterministic statistical significance report from parsed summaries. */
export function buildStatisticalSignificanceReport(
  input: BuildStatisticalSignificanceReportInput,
): StatisticalSignificanceReport {
  const config = resolveStatisticalSignificanceConfig(input.config);

  const strategies = sortStrategies(
    input.summaries.map((summary) =>
      computeStrategyStatisticalSignificance(summary, config),
    ),
  );

  return {
    generatedAt: input.generatedAt,
    inputRoot: normalizeRootPath(input.inputRoot),
    outputPath: normalizeRootPath(input.outputPath),
    config,
    strategies,
  };
}

export function buildStatisticalSignificanceFromDirectories(
  inputRoot: string,
  outputPath: string,
  io: StatisticalSignificanceIo,
  options: {
    generatedAt: string;
    config?: BuildStatisticalSignificanceReportInput["config"];
  },
): StatisticalSignificanceReport {
  const summaries = discoverSummariesOrEmpty(inputRoot, io);

  return buildStatisticalSignificanceReport({
    inputRoot,
    outputPath,
    generatedAt: options.generatedAt,
    summaries,
    config: options.config,
  });
}

export function serializeStatisticalSignificanceReport(
  report: StatisticalSignificanceReport,
): string {
  return stableStringify(report);
}
