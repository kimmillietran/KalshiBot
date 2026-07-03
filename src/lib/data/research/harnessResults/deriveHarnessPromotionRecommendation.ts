import {
  computePerformanceStatistics,
  toMarketResultSummary,
} from "@/lib/data/research/aggregation/computeResearchAggregateStatistics";
import { parseResearchOutputJson } from "@/lib/data/research/aggregation/parseResearchOutputJson";
import type { ResearchMarketResultSummary } from "@/lib/data/research/aggregation/researchAggregateTypes";
import type { StrategySynthesisCandidate } from "@/lib/data/research/strategySynthesis/strategySynthesisTypes";

import {
  DEFAULT_MIN_COMPLETED_MARKETS_FOR_CANDIDATE,
  DEFAULT_MIN_ROBUSTNESS_SCORE_FOR_CANDIDATE,
  DEFAULT_MIN_WIN_RATE_FOR_CANDIDATE,
} from "./harnessResultsTypes";
import type {
  HarnessCalibrationContext,
  HarnessPromotionRecommendation,
  HarnessResultsConfig,
  HarnessRunStatus,
  HarnessStrategyResult,
  HarnessStrategyRunCounts,
  ParsedHarnessMarketResult,
  ParsedHarnessValidationEntry,
} from "./harnessResultsTypes";

export function resolveHarnessResultsConfig(
  partial?: Partial<HarnessResultsConfig>,
): HarnessResultsConfig {
  return {
    minCompletedMarketsForCandidate:
      partial?.minCompletedMarketsForCandidate
      ?? DEFAULT_MIN_COMPLETED_MARKETS_FOR_CANDIDATE,
    minWinRateForCandidate:
      partial?.minWinRateForCandidate ?? DEFAULT_MIN_WIN_RATE_FOR_CANDIDATE,
    minRobustnessScoreForCandidate:
      partial?.minRobustnessScoreForCandidate
      ?? DEFAULT_MIN_ROBUSTNESS_SCORE_FOR_CANDIDATE,
  };
}

function deriveRunStatus(counts: HarnessStrategyRunCounts): HarnessRunStatus {
  if (counts.total === 0) {
    return "not-run";
  }

  if (counts.successful === 0) {
    return "failed";
  }

  if (counts.successful < counts.total) {
    return "partial";
  }

  return "completed";
}

function buildCalibrationContext(
  strategy: StrategySynthesisCandidate,
): HarnessCalibrationContext {
  return {
    atlasGroupId: strategy.entryConditions.atlasGroupId,
    bucketId: strategy.entryConditions.bucketId,
    calibrationDirection: strategy.entryConditions.calibrationDirection,
    marketCondition: strategy.entryConditions.marketCondition || null,
  };
}

export function deriveHarnessPromotionRecommendation(input: {
  strategy: StrategySynthesisCandidate;
  validation: ParsedHarnessValidationEntry | null;
  runStatus: HarnessRunStatus;
  completedMarkets: number;
  winRatePct: number;
  totalPnlCents: number;
  config: HarnessResultsConfig;
}): HarnessPromotionRecommendation {
  if (
    input.strategy.promotionStatus === "rejected"
    || input.runStatus === "not-run"
    || input.runStatus === "failed"
  ) {
    return "reject";
  }

  if (input.validation && !input.validation.passes) {
    return "reject";
  }

  const robustnessScore =
    input.validation?.robustnessScore
    ?? input.strategy.validationSummary.robustnessScore;

  if (
    input.completedMarkets < input.config.minCompletedMarketsForCandidate
    || input.strategy.promotionStatus === "experimental"
  ) {
    return "needs-more-data";
  }

  if (
    robustnessScore !== null
    && robustnessScore < input.config.minRobustnessScoreForCandidate
  ) {
    return "needs-more-data";
  }

  if (
    input.winRatePct < input.config.minWinRateForCandidate
    && input.totalPnlCents <= 0
  ) {
    return "needs-more-data";
  }

  if (
    input.runStatus === "completed"
    && input.strategy.promotionStatus === "candidate"
    && (robustnessScore === null || robustnessScore >= input.config.minRobustnessScoreForCandidate)
  ) {
    return "candidate";
  }

  if (input.runStatus === "partial") {
    return "needs-more-data";
  }

  return input.totalPnlCents > 0 ? "candidate" : "needs-more-data";
}

function collectWarnings(input: {
  strategy: StrategySynthesisCandidate;
  validation: ParsedHarnessValidationEntry | null;
  runStatus: HarnessRunStatus;
  counts: HarnessStrategyRunCounts;
  leaderboardStrategyIds: ReadonlySet<string>;
}): string[] {
  const warnings = [...input.strategy.riskNotes];

  if (input.runStatus === "not-run") {
    warnings.push("Harness did not evaluate this synthesized strategy.");
  }

  if (input.runStatus === "partial") {
    warnings.push(
      `Harness completed ${input.counts.successful}/${input.counts.total} market runs.`,
    );
  }

  if (input.validation && !input.validation.passes) {
    warnings.push(...input.validation.reasons);
  }

  if (input.leaderboardStrategyIds.has(input.strategy.strategyFamily)) {
    warnings.push(
      "Baseline leaderboard contains a strategy with the same family id; harness results are isolated under data/research-results/harness/.",
    );
  }

  return [...new Set(warnings.filter((warning) => warning.trim().length > 0))];
}

function loadCompletedMarketSummaries(input: {
  results: readonly ParsedHarnessMarketResult[];
  readFile: (path: string) => string;
}): ResearchMarketResultSummary[] {
  const summaries: ResearchMarketResultSummary[] = [];

  for (const result of input.results) {
    if (result.status !== "success" || !result.outputPath) {
      continue;
    }

    try {
      const parsed = parseResearchOutputJson(
        input.readFile(result.outputPath),
        result.marketTicker,
      );

      if (parsed.status !== "completed" || parsed.metrics === null) {
        continue;
      }

      summaries.push(toMarketResultSummary(result.outputPath, parsed));
    } catch {
      // Skip unreadable harness outputs.
    }
  }

  return summaries;
}

export function buildHarnessStrategyResult(input: {
  strategy: StrategySynthesisCandidate;
  harnessResults: readonly ParsedHarnessMarketResult[];
  validation: ParsedHarnessValidationEntry | null;
  leaderboardStrategyIds: ReadonlySet<string>;
  readFile: (path: string) => string;
  config: HarnessResultsConfig;
}): HarnessStrategyResult {
  const counts: HarnessStrategyRunCounts = {
    total: input.harnessResults.length,
    successful: input.harnessResults.filter((result) => result.status === "success").length,
    failed: input.harnessResults.filter((result) => result.status === "failed").length,
    skipped: input.harnessResults.filter((result) => result.status === "skipped").length,
  };

  const runStatus = deriveRunStatus(counts);
  const completedMarkets = loadCompletedMarketSummaries({
    results: input.harnessResults,
    readFile: input.readFile,
  });
  const performance = computePerformanceStatistics(completedMarkets);

  const robustnessScore =
    input.validation?.robustnessScore
    ?? input.strategy.validationSummary.robustnessScore;

  const promotionRecommendation = deriveHarnessPromotionRecommendation({
    strategy: input.strategy,
    validation: input.validation,
    runStatus,
    completedMarkets: completedMarkets.length,
    winRatePct: performance.winRatePct,
    totalPnlCents: performance.totalPnlCents,
    config: input.config,
  });

  return {
    strategyId: input.strategy.strategyId,
    hypothesisId: input.strategy.hypothesisId,
    strategyFamily: input.strategy.strategyFamily,
    direction: input.strategy.direction,
    runStatus,
    tradeCount: performance.totalTrades,
    totalPnlCents: performance.totalPnlCents,
    averagePnlCents: performance.averagePnlCents,
    winRatePct: performance.winRatePct,
    maxDrawdownPct:
      completedMarkets.length > 0 ? performance.maxDrawdownPct : null,
    calibrationContext: buildCalibrationContext(input.strategy),
    robustnessScore,
    warnings: collectWarnings({
      strategy: input.strategy,
      validation: input.validation,
      runStatus,
      counts,
      leaderboardStrategyIds: input.leaderboardStrategyIds,
    }),
    promotionRecommendation,
    harnessRuns: counts,
  };
}

export type { HarnessStrategyResult };
