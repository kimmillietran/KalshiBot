import { midProbabilityFromCents } from "@/lib/features/contractPricing";
import { estimateRealizedVolatility } from "@/lib/data/strategies/fairValueDiffusion/fairValueDiffusionModel";
import { observationMatchesResearchAxisGroupBucket } from "@/lib/data/research/dimensions";
import type { HypothesisAtlasGroupId } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import type { MispricingObservation } from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";
import { computeFillCostBreakdown } from "@/lib/data/backtesting/costModel/computeFillCostBreakdown";
import { resolveExecutionCostModel } from "@/lib/data/backtesting/costModel/resolveExecutionCostModel";
import { DEFAULT_BACKTEST_FILL_SIMULATION_CONFIG } from "@/lib/data/backtesting/strategyTypes";
import { loadKnownSettlementsFromImports } from "@/lib/data/research/forwardSettlementJoin/loadForwardSettlementJoinInputs";

import { preloadBtcSpotSeries } from "../btcKalshiLeadLagAnalysis/causalBtcJoin";
import { joinPath, parseIsoTimestampMs } from "./calibrationFadeForwardValidationUtils";
import {
  buildBtcCandlesUpToTimestamp,
  resolveCausalBtcPrice,
} from "./buildBtcCandlesCausal";
import { classifyCalibrationFadeInterpretation } from "./classifyCalibrationFadeInterpretation";
import { loadFrozenHypothesisSpec } from "./loadFrozenHypothesisSpec";
import { loadSelectedRunCalibrationFadeContext } from "./loadSelectedRunCalibrationFadeContext";
import {
  CALIBRATION_FADE_FORWARD_VALIDATION_DISCLAIMER,
  CALIBRATION_FADE_FORWARD_VALIDATION_VERSION,
  type CalibrationFadeEventRecord,
  type CalibrationFadeForwardValidationConfig,
  type CalibrationFadeForwardValidationIo,
  type CalibrationFadeForwardValidationReport,
  type CalibrationFadeFunnelStage,
  type CalibrationFadeGatePassCounts,
  type CalibrationFadeMarketRecord,
  type FrozenHypothesisSpec,
} from "./calibrationFadeForwardValidationTypes";
import {
  isValidQuoteCents,
  mean,
  median,
  readNumber,
  readString,
  resolveSelectedRunId,
  safeShare,
} from "./calibrationFadeForwardValidationUtils";

type ParsedTopOfBook = {
  marketTicker: string;
  seriesTicker: string;
  timestampMs: number;
  timestamp: string;
  yesBidCents: number | null;
  yesAskCents: number | null;
  noBidCents: number | null;
  noAskCents: number | null;
  bookState: string;
  bookValid: boolean;
  bookSynchronized: boolean;
};

type MarketMetadata = {
  closeTimeMs: number | null;
};

type EpisodeEntry = {
  episodeId: string;
  marketTicker: string;
  timestamp: string;
  timestampMs: number;
  impliedYesProbability: number;
  annualizedVolatility: number | null;
  timeRemainingMs: number | null;
  noAskCents: number | null;
  yesMidCents: number | null;
};

function parseTopOfBookLine(line: string): ParsedTopOfBook | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }
  const record = parsed as Record<string, unknown>;
  const marketTicker = readString(record.marketTicker);
  const receivedAtLocal = readString(record.receivedAtLocal);
  if (!marketTicker || !receivedAtLocal) {
    return null;
  }
  const timestampMs =
    readNumber(record.exchangeTimestampMs) ?? parseIsoTimestampMs(receivedAtLocal);
  if (timestampMs === null) {
    return null;
  }
  const bookState = readString(record.bookState) ?? "unknown";
  return {
    marketTicker,
    seriesTicker: readString(record.seriesTicker) ?? marketTicker.split("-")[0] ?? "UNKNOWN",
    timestampMs,
    timestamp: new Date(timestampMs).toISOString(),
    yesBidCents: readNumber(record.yesBestBidCents),
    yesAskCents: readNumber(record.yesBestAskCents),
    noBidCents: readNumber(record.noBestBidCents),
    noAskCents: readNumber(record.noBestAskCents),
    bookState,
    bookValid: bookState === "valid",
    bookSynchronized: bookState !== "gap-detected" && bookState !== "unsynchronized",
  };
}

function buildObservation(
  quote: ParsedTopOfBook,
  metadata: MarketMetadata | undefined,
  annualizedVolatility: number | null,
): MispricingObservation | null {
  if (!isValidQuoteCents(quote.yesBidCents) || !isValidQuoteCents(quote.yesAskCents)) {
    return null;
  }
  const timeRemainingMs =
    metadata?.closeTimeMs !== null && metadata?.closeTimeMs !== undefined
      ? Math.max(metadata.closeTimeMs - quote.timestampMs, 0)
      : null;

  return {
    strategyId: "forward-capture",
    seriesTicker: quote.seriesTicker,
    marketTicker: quote.marketTicker,
    outputPath: "forward-capture",
    stepIndex: 0,
    predictedProbability: midProbabilityFromCents(quote.yesBidCents!, quote.yesAskCents!),
    observedOutcome: 0,
    timeRemainingMs,
    moneynessPercent: null,
    annualizedVolatility,
    momentumPercent: null,
    timestampMs: quote.timestampMs,
  };
}

function qualifies(
  spec: FrozenHypothesisSpec,
  observation: MispricingObservation,
): boolean {
  return observationMatchesResearchAxisGroupBucket({
    groupId: spec.axisGroupId as HypothesisAtlasGroupId,
    bucketId: spec.bucketId,
    observation,
  });
}

function computeGrossReturnCents(side: "no" | "yes", entryPriceCents: number, outcome: "yes" | "no"): number {
  const wins = (side === "no" && outcome === "no") || (side === "yes" && outcome === "yes");
  return wins ? 100 - entryPriceCents : -entryPriceCents;
}

function computeMetricsFromMarkets(markets: readonly CalibrationFadeMarketRecord[]) {
  const settled = markets.filter((market) => market.settledOutcome === "yes" || market.settledOutcome === "no");
  const implied = settled.map((market) => market.impliedYesProbability);
  const yesRate = settled.length
    ? settled.filter((market) => market.settledOutcome === "yes").length / settled.length
    : null;
  const targetRate =
    settled.length
      ? settled.filter((market) =>
          (market.settledOutcome === "no"),
        ).length / settled.length
      : null;
  const meanImplied = mean(implied);
  const calibrationGap = meanImplied !== null && yesRate !== null ? meanImplied - yesRate : null;
  const signedGap = calibrationGap;
  const brier =
    settled.length > 0
      ? mean(
          settled.map((market) => {
            const outcome = market.settledOutcome === "yes" ? 1 : 0;
            const p = Math.min(Math.max(market.impliedYesProbability, 1e-6), 1 - 1e-6);
            return (p - outcome) ** 2;
          }),
        )
      : null;
  const logLoss =
    settled.length > 0
      ? mean(
          settled.map((market) => {
            const outcome = market.settledOutcome === "yes" ? 1 : 0;
            const p = Math.min(Math.max(market.impliedYesProbability, 1e-6), 1 - 1e-6);
            return -(outcome * Math.log(p) + (1 - outcome) * Math.log(1 - p));
          }),
        )
      : null;

  const executable = settled.filter((market) => market.executableAvailable && market.noAskCents !== null);
  const grossReturns = executable.map((market) => market.grossReturnCents ?? 0);
  const feeReturns = executable.map((market) => market.feeAdjustedReturnCents ?? 0);
  let cumulative = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const value of feeReturns) {
    cumulative += value;
    peak = Math.max(peak, cumulative);
    maxDrawdown = Math.max(maxDrawdown, peak - cumulative);
  }

  return {
    calibration: {
      qualifyingObservationCount: 0,
      candidateEpisodeCount: 0,
      candidateMarketCount: markets.length,
      meanImpliedYesProbability: meanImplied,
      meanTargetSideProbability: targetRate !== null ? 1 - yesRate! : null,
      observedYesSettlementRate: yesRate,
      observedTargetSideSettlementRate: targetRate,
      calibrationGap,
      signedCalibrationGap: signedGap,
      brierScore: brier,
      logLoss,
      marketLevelSignedCalibrationGap: signedGap,
      descriptiveObservationSignedGap: null,
    },
    executable: {
      executableCandidateCount: executable.length,
      unavailableExecutablePriceCount: markets.length - executable.length,
      grossReturnCents: grossReturns.length ? grossReturns.reduce((a, b) => a + b, 0) : null,
      feeAdjustedReturnCents: feeReturns.length ? feeReturns.reduce((a, b) => a + b, 0) : null,
      winRate: executable.length
        ? executable.filter((market) => (market.feeAdjustedReturnCents ?? 0) > 0).length / executable.length
        : null,
      averageEntryPriceCents: mean(executable.map((market) => market.noAskCents ?? 0)),
      medianEntryPriceCents: median(executable.map((market) => market.noAskCents ?? 0)),
      maximumDrawdownCents: feeReturns.length ? maxDrawdown : null,
      cumulativeReturnCents: feeReturns.length ? cumulative : null,
    },
  };
}

/** Streams selected-run capture data and evaluates the frozen calibration-fade hypothesis. */
export async function analyzeCalibrationFadeForwardForRun(input: {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  config: CalibrationFadeForwardValidationConfig;
  io: CalibrationFadeForwardValidationIo;
  hypothesisId?: string;
}): Promise<{
  report: CalibrationFadeForwardValidationReport;
  eventLines: string[];
  marketLines: string[];
}> {
  const captureRunDir = input.config.captureRunDir;
  const runId = resolveSelectedRunId(captureRunDir);
  const { spec, historicalBenchmark, provenanceAvailable, warnings: provenanceWarnings } =
    loadFrozenHypothesisSpec({
      io: input.io,
      hypothesisConfigPath: input.config.hypothesisConfigPath,
      hypothesisId: input.hypothesisId,
    });
  const context = loadSelectedRunCalibrationFadeContext({ io: input.io, captureRunDir });
  const { points: btcPoints, recordsScanned: btcRecordsScanned } = await preloadBtcSpotSeries(
    input.io,
    captureRunDir,
  );

  const metadataByMarket = new Map<string, MarketMetadata>();
  const metadataPath = joinPath(captureRunDir, "market-metadata.jsonl");
  if (input.io.fileExists(metadataPath)) {
    await input.io.iterateJsonl(metadataPath, {
      onLine: (line) => {
        try {
          const parsed = JSON.parse(line) as Record<string, unknown>;
          const marketTicker = readString(parsed.marketTicker);
          const closeTime = readString(parsed.closeTime) ?? readString(parsed.close_time);
          if (!marketTicker) {
            return "skip";
          }
          metadataByMarket.set(marketTicker, {
            closeTimeMs: closeTime ? Date.parse(closeTime) : null,
          });
        } catch {
          return "skip";
        }
        return "continue";
      },
    });
  }

  const gateCounts: CalibrationFadeGatePassCounts = {
    validBook: 0,
    synchronizedBook: 0,
    btcJoinAvailable: 0,
    volatilityAvailable: 0,
    highVolatility: 0,
    probabilityBand: 0,
    timeRemainingBand: 0,
    qualifyingObservation: 0,
  };

  let recordsScanned = 0;
  const marketsSeen = new Set<string>();
  let qualifyingObservationCount = 0;
  let suppressedDuplicateCount = 0;
  const episodeEntries: EpisodeEntry[] = [];
  const marketFirstEntries = new Map<string, EpisodeEntry>();
  const eventLines: string[] = [];

  const perMarketState = new Map<
    string,
    { wasQualifying: boolean; episodeIndex: number; inEpisode: boolean }
  >();

  const topOfBookPath = joinPath(captureRunDir, "top-of-book.jsonl");
  await input.io.iterateJsonl(topOfBookPath, {
    onLine: (line) => {
      const quote = parseTopOfBookLine(line);
      if (!quote) {
        return "skip";
      }
      recordsScanned += 1;
      marketsSeen.add(quote.marketTicker);

      if (quote.bookValid) {
        gateCounts.validBook += 1;
      }
      if (quote.bookSynchronized) {
        gateCounts.synchronizedBook += 1;
      }

      const btcJoin = resolveCausalBtcPrice(
        btcPoints,
        quote.timestampMs,
        input.config.maximumBtcJoinAgeMs,
      );
      if (btcJoin.joined) {
        gateCounts.btcJoinAvailable += 1;
      }

      const candles = buildBtcCandlesUpToTimestamp({
        points: btcPoints,
        timestampMs: quote.timestampMs,
        barIntervalMs: spec.volatilityDefinition.returnIntervalMs,
      });
      const volEstimate = estimateRealizedVolatility(candles, spec.volatilityDefinition.lookbackBars);
      const annualizedVolatility = volEstimate?.annualizedVol ?? null;
      if (annualizedVolatility !== null) {
        gateCounts.volatilityAvailable += 1;
      }
      if (annualizedVolatility !== null && annualizedVolatility >= spec.eligibilityRules.volatility.minInclusive) {
        gateCounts.highVolatility += 1;
      }

      const observation = buildObservation(quote, metadataByMarket.get(quote.marketTicker), annualizedVolatility);
      if (!observation) {
        return "skip";
      }

      if (
        observation.predictedProbability >= spec.eligibilityRules.probability.minInclusive
        && observation.predictedProbability < spec.eligibilityRules.probability.maxExclusive
      ) {
        gateCounts.probabilityBand += 1;
      }
      if (
        observation.timeRemainingMs !== null
        && observation.timeRemainingMs >= spec.eligibilityRules.timeRemainingMs.minInclusive
        && observation.timeRemainingMs < spec.eligibilityRules.timeRemainingMs.maxExclusive
      ) {
        gateCounts.timeRemainingBand += 1;
      }

      const bookEligible =
        (!spec.marketEligibilityRules.requireValidBook || quote.bookValid)
        && (!spec.marketEligibilityRules.requireSynchronizedBook || quote.bookSynchronized)
        && (!spec.marketEligibilityRules.requireBtcJoin || btcJoin.joined);

      const eligible = bookEligible && qualifies(spec, observation);
      const state = perMarketState.get(quote.marketTicker) ?? {
        wasQualifying: false,
        episodeIndex: 0,
        inEpisode: false,
      };

      if (eligible) {
        gateCounts.qualifyingObservation += 1;
        qualifyingObservationCount += 1;
        eventLines.push(
          JSON.stringify({
            eventType: "qualifying-observation",
            marketTicker: quote.marketTicker,
            episodeId: `${quote.marketTicker}-ep-${state.episodeIndex}`,
            timestamp: quote.timestamp,
            impliedYesProbability: observation.predictedProbability,
            annualizedVolatility,
            timeRemainingMs: observation.timeRemainingMs,
            noAskCents: quote.noAskCents,
            yesMidCents: Math.round(observation.predictedProbability * 100),
            bookValid: quote.bookValid,
            bookSynchronized: quote.bookSynchronized,
          } satisfies CalibrationFadeEventRecord),
        );

        if (state.wasQualifying) {
          suppressedDuplicateCount += 1;
        } else {
          state.inEpisode = true;
          const entry: EpisodeEntry = {
            episodeId: `${quote.marketTicker}-ep-${state.episodeIndex}`,
            marketTicker: quote.marketTicker,
            timestamp: quote.timestamp,
            timestampMs: quote.timestampMs,
            impliedYesProbability: observation.predictedProbability,
            annualizedVolatility,
            timeRemainingMs: observation.timeRemainingMs,
            noAskCents: quote.noAskCents,
            yesMidCents: Math.round(observation.predictedProbability * 100),
          };
          episodeEntries.push(entry);
          eventLines.push(
            JSON.stringify({
              eventType: "episode-entry",
              ...entry,
            }),
          );
          if (!marketFirstEntries.has(quote.marketTicker)) {
            marketFirstEntries.set(quote.marketTicker, entry);
            eventLines.push(
              JSON.stringify({
                eventType: "market-entry",
                ...entry,
              }),
            );
          }
        }
        state.wasQualifying = true;
      } else if (state.wasQualifying && spec.deduplicationPolicy.episodeBreakOnDisqualification) {
        state.wasQualifying = false;
        state.inEpisode = false;
        state.episodeIndex += 1;
      } else {
        state.wasQualifying = false;
      }

      perMarketState.set(quote.marketTicker, state);
      return "continue";
    },
  });

  const settlementSource = loadKnownSettlementsFromImports({
    io: input.io as Parameters<typeof loadKnownSettlementsFromImports>[0]["io"],
    importsDir: input.config.importsDir,
    marketTickers: [...marketFirstEntries.keys()],
  });
  const costModels = resolveExecutionCostModel(DEFAULT_BACKTEST_FILL_SIMULATION_CONFIG, {
    executionCostModel: { kind: "per-contract-fee", feeCentsPerContract: 1 },
  });

  const marketRecords: CalibrationFadeMarketRecord[] = [...marketFirstEntries.values()].map((entry) => {
    const settlement = settlementSource.settlementsByMarket.get(entry.marketTicker);
    const settledOutcome = settlement?.settledOutcome ?? "unknown";
    const executableAvailable = isValidQuoteCents(entry.noAskCents);
    let grossReturnCents: number | null = null;
    let feeAdjustedReturnCents: number | null = null;
    if (executableAvailable && (settledOutcome === "yes" || settledOutcome === "no")) {
      grossReturnCents = computeGrossReturnCents("no", entry.noAskCents!, settledOutcome);
      const fee = computeFillCostBreakdown({
        action: "buy",
        grossPriceCents: entry.noAskCents!,
        quantity: 1,
        models: costModels,
      });
      feeAdjustedReturnCents = grossReturnCents - fee.feeCents;
    }

    return {
      marketTicker: entry.marketTicker,
      entryTimestamp: entry.timestamp,
      impliedYesProbability: entry.impliedYesProbability,
      noAskCents: entry.noAskCents,
      executableAvailable,
      settlementStatus: settlement?.settlementStatus ?? "missing-source",
      settledOutcome,
      grossReturnCents,
      feeAdjustedReturnCents,
      calibrationGapSigned:
        settledOutcome === "yes" || settledOutcome === "no"
          ? entry.impliedYesProbability - (settledOutcome === "yes" ? 1 : 0)
          : null,
    };
  });

  const metrics = computeMetricsFromMarkets(marketRecords);
  metrics.calibration.qualifyingObservationCount = qualifyingObservationCount;
  metrics.calibration.candidateEpisodeCount = episodeEntries.length;
  metrics.calibration.candidateMarketCount = marketRecords.length;

  const joinedCount = marketRecords.filter(
    (market) => market.settledOutcome === "yes" || market.settledOutcome === "no",
  ).length;
  const settlementCoverage = {
    candidateMarketCount: marketRecords.length,
    settledCandidateMarketCount: joinedCount,
    joinedCandidateMarketCount: joinedCount,
    unresolvedCandidateMarketCount: marketRecords.length - joinedCount,
    settlementCoverageShare: safeShare(joinedCount, marketRecords.length),
    excludedByReason: {
      unresolved: marketRecords.length - joinedCount,
    },
  };

  const featureIncompatible =
    gateCounts.volatilityAvailable === 0 || metadataByMarket.size === 0;

  const classification = classifyCalibrationFadeInterpretation({
    spec,
    provenanceAvailable,
    featureIncompatible,
    candidateMarketCount: marketRecords.length,
    settlementCoverage,
    selectedRunQuality: context.selectedRunQuality,
    calibration: metrics.calibration,
    executable: metrics.executable,
  });

  const funnel: CalibrationFadeFunnelStage[] = [
    { stageId: "records-loaded", label: "Records loaded", count: recordsScanned },
    { stageId: "markets-scanned", label: "Markets scanned", count: marketsSeen.size },
    { stageId: "valid-book", label: "Valid book", count: gateCounts.validBook },
    { stageId: "synchronized-book", label: "Synchronized book", count: gateCounts.synchronizedBook },
    { stageId: "btc-join-available", label: "BTC join available", count: gateCounts.btcJoinAvailable },
    { stageId: "volatility-available", label: "Volatility available", count: gateCounts.volatilityAvailable },
    { stageId: "high-volatility", label: "High volatility", count: gateCounts.highVolatility },
    { stageId: "probability-band", label: "Probability band", count: gateCounts.probabilityBand },
    { stageId: "time-remaining-band", label: "Time remaining band", count: gateCounts.timeRemainingBand },
    { stageId: "qualifying-observation", label: "Qualifying observations", count: qualifyingObservationCount },
    { stageId: "candidate-episode", label: "Candidate episodes", count: episodeEntries.length },
    { stageId: "independent-market", label: "Independent candidate markets", count: marketRecords.length },
    {
      stageId: "executable-entry",
      label: "Executable entry available",
      count: metrics.executable.executableCandidateCount,
    },
    { stageId: "settlement-joined", label: "Settlement joined", count: joinedCount },
    { stageId: "evaluated-candidate", label: "Final evaluated candidates", count: joinedCount },
  ];

  const warnings = [
    ...provenanceWarnings,
    ...context.warnings,
    ...settlementSource.warnings,
    suppressedDuplicateCount > 0
      ? `Suppressed ${suppressedDuplicateCount} repeated qualifying snapshots within episodes.`
      : null,
  ].filter((entry): entry is string => Boolean(entry));

  const report: CalibrationFadeForwardValidationReport = {
    analysisVersion: CALIBRATION_FADE_FORWARD_VALIDATION_VERSION,
    analysisScope: "selected-run",
    selectedRunId: runId,
    selectedRunDirectory: captureRunDir,
    sourceRunIds: [runId],
    hypothesisId: spec.hypothesisId,
    hypothesisVersion: spec.hypothesisVersion,
    hypothesisConfigurationHash: spec.configurationHash,
    historicalSourceArtifacts: spec.canonicalSourceArtifacts,
    historicalSourceHashes: historicalBenchmark.sourceArtifactHashes,
    artifactGeneratedAt: input.generatedAt,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
    eventsOutputPath: input.config.eventsOutputPath,
    marketsOutputPath: input.config.marketsOutputPath,
    recordsScanned,
    marketsScanned: marketsSeen.size,
    btcRecordsScanned,
    qualifyingObservationCount,
    candidateEpisodeCount: episodeEntries.length,
    candidateMarketCount: marketRecords.length,
    executableCandidateCount: metrics.executable.executableCandidateCount,
    settlementCoverageShare: settlementCoverage.settlementCoverageShare,
    warnings,
    inputArtifactIdentities: context.inputArtifactIdentities,
    selectedRunQuality: context.selectedRunQuality,
    historicalBenchmark,
    forwardBenchmark: {
      ...metrics.calibration,
      executable: metrics.executable,
      settlementCoverage,
    },
    funnel,
    gatePassCounts: gateCounts,
    featureCompatibility: {
      probabilityMeasureAvailable: true,
      volatilityMeasureAvailable: gateCounts.volatilityAvailable > 0,
      timeRemainingAvailable: metadataByMarket.size > 0,
      incompatibleFeatures: featureIncompatible ? ["volatility-or-time-remaining"] : [],
    },
    summary: classification,
    disclaimer: CALIBRATION_FADE_FORWARD_VALIDATION_DISCLAIMER,
  };

  return {
    report,
    eventLines,
    marketLines: marketRecords.map((record) => JSON.stringify(record)),
  };
}
