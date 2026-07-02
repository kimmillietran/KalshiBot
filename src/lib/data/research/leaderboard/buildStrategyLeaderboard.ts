import { normalizeRootPath } from "../aggregation/researchAggregatePaths";

import { discoverStrategyAggregateSummaries } from "./discoverStrategyAggregateSummaries";
import {
  DEFAULT_STRATEGY_LEADERBOARD_INPUT_DIR,
  DEFAULT_STRATEGY_LEADERBOARD_OUTPUT_PATH,
  STRATEGY_LEADERBOARD_RANK_METRICS,
  StrategyLeaderboardError,
  StrategyLeaderboardErrorCode,
  type BuildStrategyLeaderboardInput,
  type ParsedStrategyAggregateSummary,
  type StrategyLeaderboard,
  type StrategyLeaderboardEntry,
  type StrategyLeaderboardIo,
  type StrategyLeaderboardRankMetric,
} from "./strategyLeaderboardTypes";

function toLeaderboardEntry(
  summary: ParsedStrategyAggregateSummary,
  rank: number,
): StrategyLeaderboardEntry {
  return {
    rank,
    strategyId: summary.strategyId,
    marketsTested: summary.marketCounts.total,
    completedMarkets: summary.marketCounts.completed,
    totalTrades: summary.performance.totalTrades,
    totalFills: summary.performance.totalFills,
    totalContractsFilled: summary.performance.totalContractsFilled,
    totalPnlCents: summary.performance.totalPnlCents,
    averagePnlCents: summary.performance.averagePnlCents,
    medianPnlCents: summary.performance.medianPnlCents,
    winRatePct: summary.performance.winRatePct,
    maxDrawdownPct: summary.performance.maxDrawdownPct,
    sharpeRatio: summary.performance.sharpeRatio,
    averageDurationMs: summary.duration.averageDurationMs,
    sourcePaths: summary.sourcePaths,
  };
}

function getRankValue(
  summary: ParsedStrategyAggregateSummary,
  rankBy: StrategyLeaderboardRankMetric,
): number | null {
  switch (rankBy) {
    case "totalPnL":
      return summary.performance.totalPnlCents;
    case "sharpe":
      return summary.performance.sharpeRatio;
    case "winRate":
      return summary.performance.winRatePct;
  }
}

function compareSummaries(
  left: ParsedStrategyAggregateSummary,
  right: ParsedStrategyAggregateSummary,
  rankBy: StrategyLeaderboardRankMetric,
): number {
  const leftValue = getRankValue(left, rankBy);
  const rightValue = getRankValue(right, rankBy);

  if (leftValue === null && rightValue === null) {
    return left.strategyId.localeCompare(right.strategyId);
  }
  if (leftValue === null) {
    return 1;
  }
  if (rightValue === null) {
    return -1;
  }
  if (leftValue !== rightValue) {
    return rightValue - leftValue;
  }

  return left.strategyId.localeCompare(right.strategyId);
}

function assertNoDuplicateStrategies(
  summaries: readonly ParsedStrategyAggregateSummary[],
): void {
  const seen = new Set<string>();
  for (const summary of summaries) {
    if (seen.has(summary.strategyId)) {
      throw new StrategyLeaderboardError(
        `Duplicate strategy entry: ${summary.strategyId}`,
        StrategyLeaderboardErrorCode.DUPLICATE_STRATEGY,
        summary.strategyId,
      );
    }
    seen.add(summary.strategyId);
  }
}

/** Parses a supported leaderboard rank metric. */
export function parseStrategyLeaderboardRankMetric(
  value: string,
): StrategyLeaderboardRankMetric {
  const trimmed = value.trim();
  if (
    !STRATEGY_LEADERBOARD_RANK_METRICS.includes(
      trimmed as StrategyLeaderboardRankMetric,
    )
  ) {
    throw new StrategyLeaderboardError(
      `Unsupported rank metric: ${value}. Expected one of ${STRATEGY_LEADERBOARD_RANK_METRICS.join(", ")}`,
      StrategyLeaderboardErrorCode.INVALID_RANK_METRIC,
    );
  }

  return trimmed as StrategyLeaderboardRankMetric;
}

/** Builds a deterministic strategy leaderboard from parsed aggregate summaries. */
export function buildStrategyLeaderboard(
  input: BuildStrategyLeaderboardInput,
): StrategyLeaderboard {
  if (input.summaries.length === 0) {
    throw new StrategyLeaderboardError(
      "No strategy aggregate summaries were provided",
      StrategyLeaderboardErrorCode.EMPTY_DATASET,
    );
  }

  assertNoDuplicateStrategies(input.summaries);

  const ranked = [...input.summaries].sort((left, right) =>
    compareSummaries(left, right, input.rankBy),
  );

  const strategies = ranked.map((summary, index) =>
    toLeaderboardEntry(summary, index + 1),
  );

  return {
    generatedAt: input.generatedAt,
    inputRoot: normalizeRootPath(input.inputRoot),
    outputPath: normalizeRootPath(input.outputPath),
    rankBy: input.rankBy,
    strategies,
  };
}

/** Discovers aggregate summaries and builds a strategy leaderboard in one step. */
export function buildStrategyLeaderboardFromDirectories(
  inputRoot: string,
  io: StrategyLeaderboardIo,
  options: {
    generatedAt: string;
    outputPath?: string;
    rankBy?: StrategyLeaderboardRankMetric;
  },
): StrategyLeaderboard {
  const summaries = discoverStrategyAggregateSummaries(inputRoot, io);

  return buildStrategyLeaderboard({
    inputRoot,
    outputPath: options.outputPath ?? DEFAULT_STRATEGY_LEADERBOARD_OUTPUT_PATH,
    generatedAt: options.generatedAt,
    rankBy: options.rankBy ?? "totalPnL",
    summaries,
  });
}

export {
  DEFAULT_STRATEGY_LEADERBOARD_INPUT_DIR,
  DEFAULT_STRATEGY_LEADERBOARD_OUTPUT_PATH,
};
