import type { HypothesisCandidate } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import { applyRefinementSuggestedFilters } from "@/lib/data/research/hypothesisRobustness/applyRefinementSuggestedFilters";
import { filterObservationsForAtlasBucket } from "@/lib/data/research/hypothesisRobustness/filterObservationsForAtlasBucket";
import { parseAtlasHypothesisCandidateId } from "@/lib/data/research/hypothesisRobustness/parseAtlasHypothesisCandidateId";
import type { HypothesisRefinementFilters } from "@/lib/data/research/hypothesisRefinementGenerator/hypothesisRefinementTypes";
import type { RegimeVolatilityByMarketKey } from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";

import { deriveHypothesisTradeRule } from "./deriveHypothesisTradeRule";
import type {
  BuildHypothesisTradeReplayReportInput,
  HypothesisTradeReplayEntry,
  HypothesisTradeReplayMetrics,
  HypothesisTradeReplayReport,
  HypothesisTradeReplaySummary,
  ReplayableObservation,
} from "./hypothesisTradeReplayTypes";
import {
  buildHypothesisReplayWarnings,
  computeHypothesisReplayMetrics,
  replayObservationTrade,
  resolveCalibrationError,
} from "./replayHypothesisTrades";

const DISCLAIMER =
  "Research-only, in-sample replay evidence. Each filled trade is one bucket-matched replay step with cross-spread entry and hold-to-settlement payout. Results do not imply validated strategies, out-of-sample alpha, statistical significance, or deployable readiness. This module does not modify live trading, strategy promotion, or validation thresholds.";

function createEmptyMetrics(): HypothesisTradeReplayMetrics {
  return {
    tradeCount: 0,
    fillableObservationCount: 0,
    skippedCount: 0,
    skipReasons: {
      "missing-quote": 0,
      "invalid-quote": 0,
      "wide-spread": 0,
      "insufficient-net-edge": 0,
      "unsupported-hypothesis-type": 0,
      "no-bucket-observations": 0,
    },
    uniqueMarketCount: 0,
    uniqueTradingDayCount: 0,
    averageTradesPerMarket: null,
    maxTradesPerMarket: 0,
    grossPnlCents: 0,
    netPnlCents: 0,
    averagePnlCentsPerTrade: null,
    winRate: null,
    maxDrawdownCents: 0,
    exposureCount: 0,
    averageEntryPriceCents: null,
    averageSpreadPaidCents: null,
    averageFeeCents: null,
    realizedRoi: null,
    calibrationGapCents: null,
    calibrationGapVsRealizedPnlDeltaCents: null,
  };
}

function filterObservationsForCandidate(
  candidate: HypothesisCandidate,
  observations: readonly ReplayableObservation[],
  regimeVolatilityByMarket: RegimeVolatilityByMarketKey,
): ReplayableObservation[] {
  const refinementRegistration = candidate.refinementRegistration;
  const atlasRef = refinementRegistration
    ? parseAtlasHypothesisCandidateId(refinementRegistration.parentHypothesisId)
    : parseAtlasHypothesisCandidateId(candidate.candidateId);

  if (!atlasRef) {
    return [];
  }

  let bucketObservations = filterObservationsForAtlasBucket(
    observations,
    atlasRef,
    regimeVolatilityByMarket,
  ) as ReplayableObservation[];

  if (refinementRegistration) {
    bucketObservations = applyRefinementSuggestedFilters(
      bucketObservations,
      refinementRegistration.suggestedFilters as HypothesisRefinementFilters,
    ) as ReplayableObservation[];
  }

  return bucketObservations;
}

export function replayHypothesisCandidate(input: {
  candidate: HypothesisCandidate;
  observations: readonly ReplayableObservation[];
  regimeVolatilityByMarket: RegimeVolatilityByMarketKey;
  config: BuildHypothesisTradeReplayReportInput["config"];
}): HypothesisTradeReplayEntry {
  const tradeRule = deriveHypothesisTradeRule(input.candidate);

  if (!tradeRule) {
    const metrics = createEmptyMetrics();
    metrics.skipReasons["unsupported-hypothesis-type"] = 1;

    return {
      hypothesisId: input.candidate.candidateId,
      hypothesis: input.candidate.hypothesis,
      sourceArtifact: input.candidate.sourceArtifact,
      tradeRule: null,
      unsupportedReason: "Only atlas calibration hypotheses are replayable in M11.6.",
      metrics,
      warnings: [...input.candidate.warnings],
      candidate: {
        candidateId: input.candidate.candidateId,
        confidence: input.candidate.confidence,
        bucketMetadata: input.candidate.bucketMetadata ?? null,
        suggestedStrategyFamily: input.candidate.suggestedStrategyFamily,
      },
    };
  }

  const bucketObservations = filterObservationsForCandidate(
    input.candidate,
    input.observations,
    input.regimeVolatilityByMarket,
  );

  if (bucketObservations.length === 0) {
    const metrics = createEmptyMetrics();
    metrics.skipReasons["no-bucket-observations"] = 1;

    return {
      hypothesisId: input.candidate.candidateId,
      hypothesis: input.candidate.hypothesis,
      sourceArtifact: input.candidate.sourceArtifact,
      tradeRule,
      unsupportedReason: null,
      metrics,
      warnings: buildHypothesisReplayWarnings({
        candidate: input.candidate,
        metrics,
      }),
      candidate: {
        candidateId: input.candidate.candidateId,
        confidence: input.candidate.confidence,
        bucketMetadata: input.candidate.bucketMetadata ?? null,
        suggestedStrategyFamily: input.candidate.suggestedStrategyFamily,
      },
    };
  }

  const calibrationError = resolveCalibrationError(input.candidate);
  const attempts = bucketObservations.map((observation) =>
    replayObservationTrade({
      observation,
      rule: tradeRule,
      config: input.config,
      calibrationError,
    }),
  );
  const metrics = computeHypothesisReplayMetrics(attempts);

  return {
    hypothesisId: input.candidate.candidateId,
    hypothesis: input.candidate.hypothesis,
    sourceArtifact: input.candidate.sourceArtifact,
    tradeRule,
    unsupportedReason: null,
    metrics,
    warnings: buildHypothesisReplayWarnings({
      candidate: input.candidate,
      metrics,
    }),
    candidate: {
      candidateId: input.candidate.candidateId,
      confidence: input.candidate.confidence,
      bucketMetadata: input.candidate.bucketMetadata ?? null,
      suggestedStrategyFamily: input.candidate.suggestedStrategyFamily,
    },
  };
}

function buildSummary(entries: readonly HypothesisTradeReplayEntry[]): HypothesisTradeReplaySummary {
  const evaluatedTradeCount = entries.reduce(
    (sum, entry) => sum + entry.metrics.fillableObservationCount,
    0,
  );
  const filledTradeCount = entries.reduce((sum, entry) => sum + entry.metrics.tradeCount, 0);
  const skippedTradeCount = entries.reduce((sum, entry) => sum + entry.metrics.skippedCount, 0);
  const positiveNetHypothesisCount = entries.filter(
    (entry) => entry.metrics.tradeCount > 0 && entry.metrics.netPnlCents > 0,
  ).length;
  const killedByCostOrFillabilityCount = entries.filter(
    (entry) =>
      entry.metrics.fillableObservationCount > 0
      && entry.metrics.tradeCount === 0,
  ).length;
  const untradeableHypothesisCount = entries.filter(
    (entry) =>
      entry.metrics.tradeCount === 0
      && (
        entry.metrics.skipReasons["wide-spread"] > 0
        || entry.metrics.skipReasons["missing-quote"] > 0
        || entry.metrics.skipReasons["invalid-quote"] > 0
      ),
  ).length;
  const descriptiveButUnprofitableCount = entries.filter(
    (entry) =>
      entry.metrics.tradeCount > 0
      && entry.metrics.netPnlCents <= 0
      && (entry.candidate.bucketMetadata?.calibrationError ?? 0) !== 0,
  ).length;

  return {
    replayedHypothesisCount: entries.length,
    evaluatedTradeCount,
    filledTradeCount,
    skippedTradeCount,
    positiveNetHypothesisCount,
    killedByCostOrFillabilityCount,
    untradeableHypothesisCount,
    descriptiveButUnprofitableCount,
  };
}

/** Builds the full hypothesis trade replay report. */
export function buildHypothesisTradeReplayReport(
  input: BuildHypothesisTradeReplayReportInput,
): HypothesisTradeReplayReport {
  const entries = input.candidates.map((candidate) =>
    replayHypothesisCandidate({
      candidate,
      observations: input.observations,
      regimeVolatilityByMarket: input.regimeVolatilityByMarket,
      config: input.config,
    }),
  );

  return {
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
    disclaimer: DISCLAIMER,
    config: input.config,
    inputPaths: input.inputPaths,
    inputStatus: input.inputStatus,
    summary: buildSummary(entries),
    entries,
  };
}
