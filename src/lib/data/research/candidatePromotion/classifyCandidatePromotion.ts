import {
  buildOosPromotionStatisticalGates,
  type OosPromotionStatisticalGates,
} from "@/lib/data/research/candidatePreregistrationEligibility/oosPromotionStatisticalGates";
import { computePromotionAccepted } from "@/lib/data/research/candidatePreregistrationEligibility/promotionEvidenceIdentity";
import {
  hashCandidateDefinitionContent,
  hashValidationEntryContent,
} from "@/lib/data/research/candidatePreregistrationEligibility/promotionEvidenceIdentity";

import type {
  CandidatePromotionConfig,
  CandidatePromotionDecision,
  CandidatePromotionEntry,
  CandidatePromotionEntryEvidence,
  CandidatePromotionNextAction,
  CandidatePromotionSupportingMetrics,
  ParsedHarnessStrategyMetrics,
  ParsedOosPromotionContext,
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
  oos?: ParsedOosPromotionContext;
  config: CandidatePromotionConfig;
};

const EMPTY_OOS: ParsedOosPromotionContext = {
  present: false,
  artifactContentHash: null,
  discoveryIsolation: null,
  prospectiveDesign: null,
  testedHypothesisCount: null,
  alpha: null,
  targetPower: null,
  holdoutMonthsHash: null,
  entriesByHypothesisId: new Map(),
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

function appendStatisticalBlockingIssues(
  blockingIssues: string[],
  gates: OosPromotionStatisticalGates,
  oosPresent: boolean,
): void {
  if (!oosPresent) {
    blockingIssues.push("Missing OOS/power/correction artifact; promotion cannot be accepted.");
    return;
  }
  if (gates.oosFinalStatisticalVerdict == null) {
    blockingIssues.push("Hypothesis missing from OOS/power/correction family.");
  } else if (gates.oosFinalStatisticalVerdict !== "pass") {
    blockingIssues.push(
      `OOS finalStatisticalVerdict is ${gates.oosFinalStatisticalVerdict} (only pass authorizes promotion).`,
    );
  }
  if (gates.oosPassesCorrected !== true) {
    blockingIssues.push("Multiple-testing correction did not pass (passesCorrected !== true).");
  }
  if (gates.oosIsUnderpowered === true || gates.oosClearsMde !== true) {
    blockingIssues.push("Power/MDE gate did not clear (underpowered or observed effect below MDE).");
  }
  if (gates.discoveryIsolationStatus !== "train-only-discovery") {
    blockingIssues.push(
      `Discovery isolation is ${gates.discoveryIsolationStatus ?? "missing"}; `
        + "holdout-contaminated or unproven discovery cannot authorize promotion.",
    );
  }
  if (gates.prospectiveDesignValid !== true) {
    blockingIssues.push("Prospective statistical design contract is missing or invalid.");
  }
}

function buildEvidence(input: {
  strategy: ParsedSynthesisStrategy;
  validation: ParsedValidationEntry | null;
  decision: CandidatePromotionDecision;
  validationPasses: boolean | null;
  oos: ParsedOosPromotionContext;
}): CandidatePromotionEntryEvidence {
  const oosEntry = input.oos.entriesByHypothesisId.get(input.strategy.hypothesisId) ?? null;
  const gates = buildOosPromotionStatisticalGates({
    entry: oosEntry,
    discoveryIsolation: input.oos.discoveryIsolation,
    prospectiveDesign: input.oos.prospectiveDesign,
    testedHypothesisCount: input.oos.testedHypothesisCount,
    alpha: input.oos.alpha,
    targetPower: input.oos.targetPower,
  });

  return {
    validationEntryContentHash: input.validation
      ? hashValidationEntryContent(input.validation)
      : null,
    candidateDefinitionContentHash: hashCandidateDefinitionContent(input.strategy),
    validationPasses: input.validationPasses,
    promotionAccepted: computePromotionAccepted({
      decision: input.decision,
      validationPasses: input.validationPasses,
      statisticalGates: gates,
    }),
    oosFinalStatisticalVerdict: gates.oosFinalStatisticalVerdict,
    oosPassesCorrected: gates.oosPassesCorrected,
    oosClearsMde: gates.oosClearsMde,
    oosIsUnderpowered: gates.oosIsUnderpowered,
    oosQValue: gates.oosQValue,
    oosUncorrectedPValue: gates.oosUncorrectedPValue,
    oosCorrectionMethod: gates.oosCorrectionMethod,
    oosNumberOfHypothesesTested: gates.oosNumberOfHypothesesTested,
    oosAlpha: gates.oosAlpha,
    oosTargetPower: gates.oosTargetPower,
    oosMinimumDetectableEffect: gates.oosMinimumDetectableEffect,
    oosObservedEffect: gates.oosObservedEffect,
    oosEffectiveSampleSize: gates.oosEffectiveSampleSize,
    oosIndependentMarketCount: gates.oosIndependentMarketCount,
    oosMarketDayCount: gates.oosMarketDayCount,
    discoveryIsolationStatus: gates.discoveryIsolationStatus,
    prospectiveDesignValid: gates.prospectiveDesignValid,
    prospectiveDesignContentHash: gates.prospectiveDesignContentHash,
    oosEntryContentHash: gates.oosEntryContentHash,
    oosArtifactContentHash: input.oos.artifactContentHash,
    oosHoldoutMonthsHash: input.oos.holdoutMonthsHash,
  };
}

/** Classifies one synthesized strategy into a promotion decision with M12.7c statistical gates. */
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

  const validationPassesMetric = metrics.validationPasses;
  const oos = input.oos ?? EMPTY_OOS;
  const evidence = buildEvidence({
    strategy: input.strategy,
    validation: input.validation,
    decision,
    validationPasses: validationPassesMetric,
    oos,
  });

  if (decision === "candidate" || decision === "production-watchlist") {
    appendStatisticalBlockingIssues(
      blockingIssues,
      {
        oosFinalStatisticalVerdict: evidence.oosFinalStatisticalVerdict,
        oosPassesCorrected: evidence.oosPassesCorrected,
        oosClearsMde: evidence.oosClearsMde,
        oosIsUnderpowered: evidence.oosIsUnderpowered,
        oosQValue: evidence.oosQValue,
        oosUncorrectedPValue: evidence.oosUncorrectedPValue,
        oosCorrectionMethod: evidence.oosCorrectionMethod,
        oosNumberOfHypothesesTested: evidence.oosNumberOfHypothesesTested,
        oosAlpha: evidence.oosAlpha,
        oosTargetPower: evidence.oosTargetPower,
        oosMinimumDetectableEffect: evidence.oosMinimumDetectableEffect,
        oosObservedEffect: evidence.oosObservedEffect,
        oosEffectiveSampleSize: evidence.oosEffectiveSampleSize,
        oosIndependentMarketCount: evidence.oosIndependentMarketCount,
        oosMarketDayCount: evidence.oosMarketDayCount,
        discoveryIsolationStatus: evidence.discoveryIsolationStatus,
        prospectiveDesignValid: evidence.prospectiveDesignValid,
        prospectiveDesignContentHash: evidence.prospectiveDesignContentHash,
        oosEntryContentHash: evidence.oosEntryContentHash,
      },
      oos.present,
    );
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
    evidence,
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
  oos?: ParsedOosPromotionContext;
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
        oos: input.oos,
        config: input.config,
      }),
    );
}
