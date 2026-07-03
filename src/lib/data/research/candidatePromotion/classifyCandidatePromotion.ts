import type {
  CandidatePromotionConfig,
  CandidatePromotionDecision,
  CandidatePromotionEntry,
  CandidatePromotionNextAction,
  CandidatePromotionSupportingMetrics,
  ParsedHarnessStrategyMetrics,
  ParsedSynthesisStrategy,
  ParsedValidationEntry,
} from "./candidatePromotionTypes";
import {
  DEFAULT_CANDIDATE_ROBUSTNESS_THRESHOLD,
  DEFAULT_MIN_CANDIDATE_HARNESS_RUNS,
  DEFAULT_MIN_CANDIDATE_TRADE_COUNT,
  DEFAULT_MIN_OBSERVATION_COUNT,
  DEFAULT_MIN_WATCHLIST_TRADE_COUNT,
  DEFAULT_REJECT_ROBUSTNESS_THRESHOLD,
  DEFAULT_WATCHLIST_ROBUSTNESS_THRESHOLD,
} from "./candidatePromotionTypes";

export function resolveCandidatePromotionConfig(
  partial?: Partial<CandidatePromotionConfig>,
): CandidatePromotionConfig {
  return {
    rejectRobustnessThreshold:
      partial?.rejectRobustnessThreshold ?? DEFAULT_REJECT_ROBUSTNESS_THRESHOLD,
    candidateRobustnessThreshold:
      partial?.candidateRobustnessThreshold ?? DEFAULT_CANDIDATE_ROBUSTNESS_THRESHOLD,
    watchlistRobustnessThreshold:
      partial?.watchlistRobustnessThreshold ?? DEFAULT_WATCHLIST_ROBUSTNESS_THRESHOLD,
    minCandidateTradeCount:
      partial?.minCandidateTradeCount ?? DEFAULT_MIN_CANDIDATE_TRADE_COUNT,
    minWatchlistTradeCount:
      partial?.minWatchlistTradeCount ?? DEFAULT_MIN_WATCHLIST_TRADE_COUNT,
    minCandidateHarnessRuns:
      partial?.minCandidateHarnessRuns ?? DEFAULT_MIN_CANDIDATE_HARNESS_RUNS,
    minObservationCount:
      partial?.minObservationCount ?? DEFAULT_MIN_OBSERVATION_COUNT,
  };
}

type ClassificationContext = {
  strategy: ParsedSynthesisStrategy;
  validation: ParsedValidationEntry | null;
  harness: ParsedHarnessStrategyMetrics | null;
  significance: {
    statisticallySignificant: boolean;
    pValue: number | null;
    insufficientSample: boolean;
  } | null;
  config: CandidatePromotionConfig;
};

function buildSupportingMetrics(input: ClassificationContext): CandidatePromotionSupportingMetrics {
  const warnings = [
    ...input.strategy.riskNotes,
    ...(input.validation?.reasons ?? []),
    ...(input.harness?.warnings ?? []),
  ];

  return {
    robustnessScore:
      input.validation?.robustnessScore
      ?? input.strategy.validationSummary.robustnessScore,
    validationPasses:
      input.validation?.passes ?? input.strategy.validationSummary.passes,
    observationCount:
      input.validation?.observationCount
      ?? input.strategy.validationSummary.observationCount,
    synthesisPromotionStatus: input.strategy.promotionStatus,
    harnessMarketRuns: input.harness?.marketRuns ?? 0,
    harnessSuccessfulRuns: input.harness?.successfulRuns ?? 0,
    harnessFailedRuns: input.harness?.failedRuns ?? 0,
    totalTradeCount: input.harness?.totalTradeCount ?? 0,
    netPnlCents: input.harness?.netPnlCents ?? null,
    singleDayConcentrationPercent:
      input.validation?.sampleConcentration.largestDayPercent ?? null,
    singleDayDominated: input.validation?.sampleConcentration.singleDayDominated ?? null,
    statisticallySignificant: input.significance?.statisticallySignificant ?? null,
    significancePValue: input.significance?.pValue ?? null,
    warningCount: warnings.length,
  };
}

function resolveNextAction(input: {
  decision: CandidatePromotionDecision;
  blockingIssues: readonly string[];
}): CandidatePromotionNextAction {
  if (input.decision === "rejected") {
    return "reject-permanently";
  }

  if (input.decision === "needs-more-data") {
    if (input.blockingIssues.some((issue) => issue.toLowerCase().includes("harness"))) {
      return "run-expanded-backtest";
    }
    return "gather-more-history";
  }

  if (input.decision === "exploratory") {
    return "monitor-in-exploratory";
  }

  if (input.decision === "candidate") {
    return "tune-parameters";
  }

  return "promote-to-watchlist";
}

function buildExplanation(input: {
  decision: CandidatePromotionDecision;
  metrics: CandidatePromotionSupportingMetrics;
  blockingIssues: readonly string[];
}): string {
  const scoreLabel =
    input.metrics.robustnessScore === null
      ? "unknown robustness"
      : `robustness ${input.metrics.robustnessScore}/100`;

  const tradeLabel = `${input.metrics.totalTradeCount} harness trades across ${input.metrics.harnessSuccessfulRuns} successful runs`;

  if (input.decision === "rejected") {
    return `Rejected (${scoreLabel}). ${input.blockingIssues[0] ?? "Validation or synthesis gates failed."}`;
  }

  if (input.decision === "needs-more-data") {
    return `Needs more data (${scoreLabel}, ${tradeLabel}). Evidence is directionally interesting but sample depth is insufficient.`;
  }

  if (input.decision === "exploratory") {
    return `Exploratory (${scoreLabel}, ${tradeLabel}). Continue monitoring before promotion.`;
  }

  if (input.decision === "candidate") {
    return `Candidate (${scoreLabel}, ${tradeLabel}). Meets core validation and harness thresholds for further review.`;
  }

  return `Production watchlist (${scoreLabel}, ${tradeLabel}). Strong validation, harness depth, and significance support advisory promotion review.`;
}

/** Classifies one synthesized strategy into an advisory promotion decision. */
export function classifyCandidatePromotion(
  input: ClassificationContext,
): CandidatePromotionEntry {
  const metrics = buildSupportingMetrics(input);
  const blockingIssues: string[] = [];
  const warnings = [
    ...input.strategy.riskNotes,
    ...(input.validation?.reasons ?? []),
    ...(input.harness?.warnings ?? []),
  ];

  const robustnessScore = metrics.robustnessScore;
  const validationPasses = metrics.validationPasses === true;
  const observationCount = metrics.observationCount ?? 0;
  const tradeCount = metrics.totalTradeCount;
  const harnessRuns = metrics.harnessSuccessfulRuns;

  if (input.strategy.promotionStatus === "rejected") {
    blockingIssues.push("Strategy synthesis marked this candidate rejected.");
  }

  if (!validationPasses) {
    blockingIssues.push("Hypothesis validation did not pass.");
  }

  if (robustnessScore !== null && robustnessScore < input.config.rejectRobustnessThreshold) {
    blockingIssues.push(
      `Robustness score ${robustnessScore} is below rejection threshold ${input.config.rejectRobustnessThreshold}.`,
    );
  }

  if (metrics.singleDayDominated) {
    blockingIssues.push(
      `Sample concentration dominated by one trading day (${metrics.singleDayConcentrationPercent}%).`,
    );
  }

  if (input.harness && input.harness.failedRuns > 0 && input.harness.successfulRuns === 0) {
    blockingIssues.push("All harness backtest runs failed.");
  }

  let decision: CandidatePromotionDecision;

  if (
    input.strategy.promotionStatus === "rejected"
    || !validationPasses
    || (robustnessScore !== null && robustnessScore < input.config.rejectRobustnessThreshold)
  ) {
    decision = "rejected";
  } else if (
    observationCount < input.config.minObservationCount
    || tradeCount < input.config.minCandidateTradeCount
    || harnessRuns < input.config.minCandidateHarnessRuns
    || input.harness === null
    || metrics.singleDayDominated
  ) {
    decision = "needs-more-data";
    if (observationCount < input.config.minObservationCount) {
      blockingIssues.push(
        `Only ${observationCount} validation observations; need ${input.config.minObservationCount}.`,
      );
    }
    if (tradeCount < input.config.minCandidateTradeCount) {
      blockingIssues.push(
        `Only ${tradeCount} harness trades; need ${input.config.minCandidateTradeCount}.`,
      );
    }
    if (harnessRuns < input.config.minCandidateHarnessRuns) {
      blockingIssues.push(
        `Only ${harnessRuns} successful harness runs; need ${input.config.minCandidateHarnessRuns}.`,
      );
    }
    if (input.harness === null) {
      blockingIssues.push("No harness results available for this strategy.");
    }
  } else if (
    robustnessScore !== null
    && robustnessScore >= input.config.watchlistRobustnessThreshold
    && tradeCount >= input.config.minWatchlistTradeCount
    && harnessRuns >= input.config.minCandidateHarnessRuns
    && input.strategy.promotionStatus === "candidate"
    && (input.significance?.statisticallySignificant === true
      || input.significance === null)
  ) {
    decision = "production-watchlist";
  } else if (
    robustnessScore !== null
    && robustnessScore >= input.config.candidateRobustnessThreshold
    && tradeCount >= input.config.minCandidateTradeCount
    && harnessRuns >= input.config.minCandidateHarnessRuns
  ) {
    decision = "candidate";
  } else {
    decision = "exploratory";
  }

  return {
    strategyId: input.strategy.strategyId,
    hypothesisId: input.strategy.hypothesisId,
    strategyFamily: input.strategy.strategyFamily,
    decision,
    explanation: buildExplanation({ decision, metrics, blockingIssues }),
    supportingMetrics: metrics,
    blockingIssues: [...new Set(blockingIssues)],
    warnings: [...new Set(warnings)],
    recommendedNextAction: resolveNextAction({ decision, blockingIssues }),
  };
}

export function classifyAllCandidatePromotions(input: {
  strategies: readonly ParsedSynthesisStrategy[];
  validationByHypothesisId: ReadonlyMap<string, ParsedValidationEntry>;
  harnessByStrategyId: ReadonlyMap<string, ParsedHarnessStrategyMetrics>;
  significanceByFamily: ReadonlyMap<
    string,
    { statisticallySignificant: boolean; pValue: number | null; insufficientSample: boolean }
  >;
  config: CandidatePromotionConfig;
}): CandidatePromotionEntry[] {
  return [...input.strategies]
    .sort((left, right) => left.strategyId.localeCompare(right.strategyId))
    .map((strategy) =>
      classifyCandidatePromotion({
        strategy,
        validation: input.validationByHypothesisId.get(strategy.hypothesisId) ?? null,
        harness: input.harnessByStrategyId.get(strategy.strategyId) ?? null,
        significance: input.significanceByFamily.get(strategy.strategyFamily)
          ?? input.significanceByFamily.get(strategy.strategyId)
          ?? null,
        config: input.config,
      }),
    );
}
