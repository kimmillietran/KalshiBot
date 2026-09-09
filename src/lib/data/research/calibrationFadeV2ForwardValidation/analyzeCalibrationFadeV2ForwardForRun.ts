import { midProbabilityFromCents } from "@/lib/features/contractPricing";
import type { MispricingObservation } from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";
import { loadKnownSettlementsFromImports } from "@/lib/data/research/forwardSettlementJoin/loadForwardSettlementJoinInputs";
import { fnv1a32, stableStringify } from "@/lib/trading/config/hashConfig";

import { preloadBtcSpotSeries } from "../btcKalshiLeadLagAnalysis/causalBtcJoin";
import { evaluateOpenMarket } from "../calibrationFadeForwardValidation/analyzeCalibrationFadeForwardForRun";
import { resolveCausalBtcPrice } from "../calibrationFadeForwardValidation/buildBtcCandlesCausal";
import { classifyCalibrationFadeInterpretation } from "../calibrationFadeForwardValidation/classifyCalibrationFadeInterpretation";
import { loadSelectedRunCalibrationFadeContext } from "../calibrationFadeForwardValidation/loadSelectedRunCalibrationFadeContext";
import {
  observationMeetsFrozenEligibility,
  probabilityInAuthoritativeBand,
  resolveFrozenEligibilityBands,
  timeRemainingInAuthoritativeBand,
  volatilityInAuthoritativeBand,
} from "../calibrationFadeForwardValidation/resolveFrozenEligibilityBands";
import type {
  CalibrationFadeEventRecord,
  CalibrationFadeFunnelStage,
  CalibrationFadeGatePassCounts,
  CalibrationFadeMarketRecord,
  FrozenHypothesisSpec,
  HistoricalHypothesisBenchmark,
} from "../calibrationFadeForwardValidation/calibrationFadeForwardValidationTypes";
import {
  isValidQuoteCents,
  joinPath,
  mean,
  median,
  parseIsoTimestampMs,
  readNumber,
  readString,
  resolveSelectedRunId,
  safeShare,
} from "../calibrationFadeForwardValidation/calibrationFadeForwardValidationUtils";
import {
  CALIBRATION_FADE_V2_FREEZE_COMMIT_SHA,
  CALIBRATION_FADE_V2_HYPOTHESIS_VERSION,
  failClosedIfCompletedCandleSourceUnavailable,
  isProspectiveConfirmatoryEvidenceEligible,
  loadCalibrationFadeV2HypothesisSpec,
  loadCalibrationFadeV2Provenance,
  requireFinalizedFreezeBoundary,
  V2_REQUIRED_SOURCE_RECORD_TYPE,
  type CalibrationFadeV2HypothesisSpec,
} from "../calibrationFadeV2Preregistration";

import { buildHistoricalReplicaVolatilityWindow } from "./buildHistoricalReplicaVolatilityWindow";
import {
  CALIBRATION_FADE_V2_FORWARD_VALIDATION_DISCLAIMER,
  CALIBRATION_FADE_V2_FORWARD_VALIDATION_VERSION,
  CalibrationFadeV2ForwardValidationError,
  type CalibrationFadeV2EvidenceIdentity,
  type CalibrationFadeV2ForwardValidationConfig,
  type CalibrationFadeV2ForwardValidationIo,
  type CalibrationFadeV2ForwardValidationReport,
  type CalibrationFadeV2OutputPaths,
} from "./calibrationFadeV2ForwardValidationTypes";
import { deriveV2NoHoldToSettlementReturns } from "./deriveV2NoHoldToSettlementReturns";
import {
  defaultInRunCandlePath,
  preloadCompletedBtcCandleObservations,
  requireExplicitCandleRunId,
} from "./preloadCompletedBtcCandleObservations";

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

type MarketMetadata = { closeTimeMs: number | null };

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
  timeRemainingMs: number | null,
  annualizedVolatility: number | null,
): MispricingObservation | null {
  if (!isValidQuoteCents(quote.yesBidCents) || !isValidQuoteCents(quote.yesAskCents)) {
    return null;
  }
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

function computeMetricsFromMarkets(markets: readonly CalibrationFadeMarketRecord[]) {
  const settled = markets.filter((market) => market.settledOutcome === "yes" || market.settledOutcome === "no");
  const executableEntryAvailable = markets.filter(
    (market) => market.executableAvailable && market.noAskCents !== null,
  );
  const evaluatedExecutable = executableEntryAvailable.filter(
    (market) => market.settledOutcome === "yes" || market.settledOutcome === "no",
  );
  const implied = settled.map((market) => market.impliedYesProbability);
  const yesRate = settled.length
    ? settled.filter((market) => market.settledOutcome === "yes").length / settled.length
    : null;
  const targetRate = settled.length
    ? settled.filter((market) => market.settledOutcome === "no").length / settled.length
    : null;
  const meanImplied = mean(implied);
  const calibrationGap = meanImplied !== null && yesRate !== null ? meanImplied - yesRate : null;
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
  const executable = evaluatedExecutable;
  const feeReturns = executable.map((market) => market.feeAdjustedReturnCents ?? 0);
  const grossReturns = executable.map((market) => market.grossReturnCents ?? 0);
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
      signedCalibrationGap: calibrationGap,
      brierScore: brier,
      logLoss,
      marketLevelSignedCalibrationGap: calibrationGap,
      descriptiveObservationSignedGap: null,
    },
    executable: {
      executableCandidateCount: evaluatedExecutable.length,
      evaluatedExecutableCandidateCount: evaluatedExecutable.length,
      executableEntryAvailableCount: executableEntryAvailable.length,
      unavailableExecutablePriceCount: markets.length - executableEntryAvailable.length,
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

function hashV2Spec(spec: CalibrationFadeV2HypothesisSpec): string {
  return fnv1a32(stableStringify(spec));
}

/**
 * Classification/band helpers share eligibility and evidence thresholds with v1.
 * This view is never passed to a volatility window builder.
 */
function classificationViewFromV2(
  spec: CalibrationFadeV2HypothesisSpec,
  configurationHash: string,
): FrozenHypothesisSpec {
  return {
    hypothesisId: spec.hypothesisId,
    hypothesisVersion: spec.hypothesisVersion,
    description: spec.description,
    canonicalSourceArtifacts: spec.canonicalSourceArtifacts,
    sourceCandidateId: spec.sourceCandidateId,
    axisGroupId: spec.axisGroupId,
    bucketId: spec.bucketId,
    calibrationDirection: spec.calibrationDirection,
    targetOutcomeSide: spec.targetOutcomeSide,
    suggestedStrategyFamily: spec.suggestedStrategyFamily,
    eligibilityRules: spec.eligibilityRules,
    probabilityMeasure: spec.probabilityMeasure,
    volatilityDefinition: {
      sourceInstrument: spec.volatilityDefinition.sourceInstrument,
      returnIntervalMs: spec.volatilityDefinition.returnIntervalMs,
      lookbackBars: spec.volatilityDefinition.lookbackBars,
      method: spec.volatilityDefinition.method,
      causalOnly: true,
      maximumSourceGapMs: 0,
    },
    marketEligibilityRules: spec.marketEligibilityRules,
    deduplicationPolicy: spec.deduplicationPolicy,
    entryPriceMeasures: spec.entryPriceMeasures,
    settlementMapping: spec.settlementMapping,
    minimumEvidenceRequirements: spec.minimumEvidenceRequirements,
    classificationRules: {
      precedence: spec.classificationRules.precedence as FrozenHypothesisSpec["classificationRules"]["precedence"],
    },
    configurationHash,
  };
}

function resolveCaptureStartedAt(input: {
  io: CalibrationFadeV2ForwardValidationIo;
  captureRunDir: string;
  startedAtFromHealth: string | null;
}): string {
  const candidates = [input.startedAtFromHealth];
  const healthPath = joinPath(input.captureRunDir, "capture-health.json");
  if (input.io.fileExists(healthPath)) {
    try {
      const parsed = JSON.parse(input.io.readFile(healthPath)) as Record<string, unknown>;
      candidates.push(readString(parsed.startedAt));
    } catch {
      // continue
    }
  }
  const statusPath = joinPath(input.captureRunDir, "capture-run-status.json");
  if (input.io.fileExists(statusPath)) {
    try {
      const parsed = JSON.parse(input.io.readFile(statusPath)) as Record<string, unknown>;
      candidates.push(readString(parsed.startedAt));
    } catch {
      // continue
    }
  }

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    if (parseIsoTimestampMs(candidate) === null) {
      throw new CalibrationFadeV2ForwardValidationError(
        `Malformed capture startedAt ${JSON.stringify(candidate)}; confirmatory/diagnostic identity fails closed`,
      );
    }
    return candidate;
  }

  throw new CalibrationFadeV2ForwardValidationError(
    "captureStartedAt is required on capture-health.json or capture-run-status.json; missing run start fails closed",
  );
}

function confirmatoryIneligibilityReason(input: {
  captureStartedAt: string;
  eligible: boolean;
}): string | null {
  if (input.eligible) {
    return null;
  }
  const startedMs = parseIsoTimestampMs(input.captureStartedAt);
  if (startedMs === null) {
    return "malformed-capture-started-at";
  }
  return "run-start-not-strictly-after-v2-freeze";
}

/** Streams selected-run capture data and evaluates the frozen v2 completed-candle contract. */
export async function analyzeCalibrationFadeV2ForwardForRun(input: {
  generatedAt: string;
  paths: CalibrationFadeV2OutputPaths;
  config: CalibrationFadeV2ForwardValidationConfig;
  io: CalibrationFadeV2ForwardValidationIo;
  hypothesisId?: string;
}): Promise<{
  report: CalibrationFadeV2ForwardValidationReport;
  eventLines: string[];
  marketLines: string[];
  evidenceIdentity: CalibrationFadeV2EvidenceIdentity;
}> {
  if (input.config.evidenceMode !== "diagnostic" && input.config.evidenceMode !== "confirmatory") {
    throw new CalibrationFadeV2ForwardValidationError(
      "evidenceMode is required and must be diagnostic or confirmatory",
    );
  }

  const captureRunDir = input.config.captureRunDir;
  const runId = resolveSelectedRunId(captureRunDir);
  const { spec } = loadCalibrationFadeV2HypothesisSpec({
    io: input.io,
    hypothesisConfigPath: input.config.hypothesisConfigPath,
  });
  if (input.hypothesisId && spec.hypothesisId !== input.hypothesisId) {
    throw new CalibrationFadeV2ForwardValidationError(
      `Unknown hypothesis ID ${input.hypothesisId}; expected ${spec.hypothesisId}`,
    );
  }
  if (spec.hypothesisVersion !== CALIBRATION_FADE_V2_HYPOTHESIS_VERSION) {
    throw new CalibrationFadeV2ForwardValidationError("v2 evaluator requires hypothesisVersion=v2");
  }
  if (spec.volatilityDefinition.sourceRecordType !== V2_REQUIRED_SOURCE_RECORD_TYPE) {
    throw new CalibrationFadeV2ForwardValidationError(
      `v2 evaluator requires sourceRecordType=${V2_REQUIRED_SOURCE_RECORD_TYPE}`,
    );
  }
  if (spec.volatilityDefinition.maximumSourceGapMs !== null) {
    throw new CalibrationFadeV2ForwardValidationError(
      "v2 evaluator requires maximumSourceGapMs=null (non-operative)",
    );
  }

  const { provenance } = loadCalibrationFadeV2Provenance({
    io: input.io,
    provenancePath: input.config.provenancePath,
  });
  const freezeBoundary = requireFinalizedFreezeBoundary(provenance);
  const configurationHash = hashV2Spec(spec);
  const classificationSpec = classificationViewFromV2(spec, configurationHash);
  const bands = resolveFrozenEligibilityBands(classificationSpec);
  const context = loadSelectedRunCalibrationFadeContext({ io: input.io, captureRunDir });
  const captureStartedAt = resolveCaptureStartedAt({
    io: input.io,
    captureRunDir,
    startedAtFromHealth: null,
  });

  const confirmatoryEligibility = isProspectiveConfirmatoryEvidenceEligible({
    freezeBoundary,
    runStartIso: captureStartedAt,
    runId,
  });
  const ineligibilityReason = confirmatoryIneligibilityReason({
    captureStartedAt,
    eligible: confirmatoryEligibility,
  });

  if (input.config.evidenceMode === "confirmatory" && !confirmatoryEligibility) {
    throw new CalibrationFadeV2ForwardValidationError(
      `Confirmatory v2 evaluation refused: capture startedAt ${captureStartedAt} is not strictly after the immutable v2 freeze boundary (${freezeBoundary.freezeTimestamp} / ${CALIBRATION_FADE_V2_FREEZE_COMMIT_SHA})`,
    );
  }

  const candlesPath = input.config.candlesPath ?? defaultInRunCandlePath(captureRunDir);
  failClosedIfCompletedCandleSourceUnavailable({
    sourceRecordType: V2_REQUIRED_SOURCE_RECORD_TYPE,
    sourceAvailable: input.io.fileExists(candlesPath),
    volatilityDefinition: spec.volatilityDefinition,
  });

  const candleIndex = await preloadCompletedBtcCandleObservations({
    io: input.io,
    captureRunDir,
    candlesPath,
    evidenceMode: input.config.evidenceMode,
    expectedRunId: runId,
    requireExplicitRunId: requireExplicitCandleRunId({
      evidenceMode: input.config.evidenceMode,
      candlesPath,
      captureRunDir,
    }),
  });

  const { points: btcPoints, recordsScanned: btcSpotRecordsScanned } = await preloadBtcSpotSeries(
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
          const closeTimeMs = closeTime ? Date.parse(closeTime) : null;
          metadataByMarket.set(marketTicker, {
            closeTimeMs: closeTimeMs !== null && Number.isFinite(closeTimeMs) ? closeTimeMs : null,
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
    openMarket: 0,
    btcJoinAvailable: 0,
    volatilityAvailable: 0,
    highVolatility: 0,
    probabilityBand: 0,
    timeRemainingBand: 0,
    qualifyingObservation: 0,
  };
  const sequentialFunnel = {
    recordsLoaded: 0,
    validBook: 0,
    synchronizedBook: 0,
    openMarket: 0,
    btcJoinAvailable: 0,
    volatilityAvailable: 0,
    highVolatility: 0,
    probabilityBand: 0,
    timeRemainingBand: 0,
    qualifyingObservation: 0,
  };
  const volatilityWindowRejections: Record<string, number> = {};

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
      sequentialFunnel.recordsLoaded += 1;
      let sequentialPassed = true;

      if (quote.bookValid) {
        gateCounts.validBook += 1;
      }
      if (quote.bookSynchronized) {
        gateCounts.synchronizedBook += 1;
      }

      const metadata = metadataByMarket.get(quote.marketTicker);
      const openEval = evaluateOpenMarket({
        timestampMs: quote.timestampMs,
        closeTimeMs: metadata?.closeTimeMs,
        requireOpenMarket: spec.marketEligibilityRules.requireOpenMarket,
      });
      const marketIsOpen =
        openEval.closeKnown
        && openEval.timeRemainingMs !== null
        && openEval.timeRemainingMs > 0
        && metadata?.closeTimeMs !== null
        && metadata?.closeTimeMs !== undefined
        && quote.timestampMs < metadata.closeTimeMs;
      if (marketIsOpen) {
        gateCounts.openMarket += 1;
      }

      const btcJoin = resolveCausalBtcPrice(
        btcPoints,
        quote.timestampMs,
        input.config.maximumBtcJoinAgeMs,
      );
      if (btcJoin.joined) {
        gateCounts.btcJoinAvailable += 1;
      }

      const volWindow = buildHistoricalReplicaVolatilityWindow({
        index: candleIndex,
        timestampMs: quote.timestampMs,
      });
      const annualizedVolatility = volWindow.available ? volWindow.annualizedVolatility : null;
      if (!volWindow.available && volWindow.rejectionReason) {
        volatilityWindowRejections[volWindow.rejectionReason] =
          (volatilityWindowRejections[volWindow.rejectionReason] ?? 0) + 1;
      }
      if (annualizedVolatility !== null) {
        gateCounts.volatilityAvailable += 1;
      }
      if (
        annualizedVolatility !== null
        && volatilityInAuthoritativeBand(annualizedVolatility, bands.volatility)
      ) {
        gateCounts.highVolatility += 1;
      }

      const observation = buildObservation(quote, openEval.timeRemainingMs, annualizedVolatility);

      if (sequentialPassed) {
        if (spec.marketEligibilityRules.requireValidBook && !quote.bookValid) {
          sequentialPassed = false;
        } else {
          sequentialFunnel.validBook += 1;
        }
      }
      if (sequentialPassed) {
        if (spec.marketEligibilityRules.requireSynchronizedBook && !quote.bookSynchronized) {
          sequentialPassed = false;
        } else {
          sequentialFunnel.synchronizedBook += 1;
        }
      }
      if (sequentialPassed) {
        if (spec.marketEligibilityRules.requireOpenMarket && !openEval.openMarket) {
          sequentialPassed = false;
        } else {
          sequentialFunnel.openMarket += 1;
        }
      }
      if (sequentialPassed) {
        if (spec.marketEligibilityRules.requireBtcJoin && !btcJoin.joined) {
          sequentialPassed = false;
        } else {
          sequentialFunnel.btcJoinAvailable += 1;
        }
      }
      if (sequentialPassed) {
        if (annualizedVolatility === null) {
          sequentialPassed = false;
        } else {
          sequentialFunnel.volatilityAvailable += 1;
        }
      }
      if (sequentialPassed) {
        if (!volatilityInAuthoritativeBand(annualizedVolatility!, bands.volatility)) {
          sequentialPassed = false;
        } else {
          sequentialFunnel.highVolatility += 1;
        }
      }

      if (!observation) {
        return "skip";
      }

      if (probabilityInAuthoritativeBand(observation.predictedProbability, bands.probability)) {
        gateCounts.probabilityBand += 1;
      }
      if (
        observation.timeRemainingMs !== null
        && timeRemainingInAuthoritativeBand(observation.timeRemainingMs, bands.timeRemainingMs)
      ) {
        gateCounts.timeRemainingBand += 1;
      }

      if (sequentialPassed) {
        if (!probabilityInAuthoritativeBand(observation.predictedProbability, bands.probability)) {
          sequentialPassed = false;
        } else {
          sequentialFunnel.probabilityBand += 1;
        }
      }
      if (sequentialPassed) {
        if (
          observation.timeRemainingMs === null
          || !timeRemainingInAuthoritativeBand(observation.timeRemainingMs, bands.timeRemainingMs)
        ) {
          sequentialPassed = false;
        } else {
          sequentialFunnel.timeRemainingBand += 1;
        }
      }

      const bookEligible =
        (!spec.marketEligibilityRules.requireValidBook || quote.bookValid)
        && (!spec.marketEligibilityRules.requireSynchronizedBook || quote.bookSynchronized)
        && (!spec.marketEligibilityRules.requireBtcJoin || btcJoin.joined)
        && (!spec.marketEligibilityRules.requireOpenMarket || openEval.openMarket);

      const axisEligible = observationMeetsFrozenEligibility({ observation, bands });
      const eligible = bookEligible && axisEligible;
      if (sequentialPassed && eligible) {
        sequentialFunnel.qualifyingObservation += 1;
      }
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
          eventLines.push(JSON.stringify({ eventType: "episode-entry", ...entry }));
          if (!marketFirstEntries.has(quote.marketTicker)) {
            marketFirstEntries.set(quote.marketTicker, entry);
            eventLines.push(JSON.stringify({ eventType: "market-entry", ...entry }));
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

  const marketRecords: CalibrationFadeMarketRecord[] = [...marketFirstEntries.values()].map((entry) => {
    const settlement = settlementSource.settlementsByMarket.get(entry.marketTicker);
    const settledOutcome = settlement?.settledOutcome ?? "unknown";
    const executableAvailable = isValidQuoteCents(entry.noAskCents);
    const derivedReturns = deriveV2NoHoldToSettlementReturns({
      noAskCents: entry.noAskCents,
      executableAvailable,
      settledOutcome,
    });
    return {
      marketTicker: entry.marketTicker,
      entryTimestamp: entry.timestamp,
      impliedYesProbability: entry.impliedYesProbability,
      noAskCents: entry.noAskCents,
      executableAvailable,
      settlementStatus: settlement?.settlementStatus ?? "missing-source",
      settledOutcome,
      grossReturnCents: derivedReturns.grossReturnCents,
      feeAdjustedReturnCents: derivedReturns.feeAdjustedReturnCents,
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
    excludedByReason: { unresolved: marketRecords.length - joinedCount },
  };

  const featureIncompatible = gateCounts.volatilityAvailable === 0 || metadataByMarket.size === 0;
  const classification = classifyCalibrationFadeInterpretation({
    spec: classificationSpec,
    provenanceAvailable: true,
    featureIncompatible,
    candidateMarketCount: marketRecords.length,
    settlementCoverage,
    selectedRunQuality: context.selectedRunQuality,
    calibration: metrics.calibration,
    executable: metrics.executable,
  });

  const funnel: CalibrationFadeFunnelStage[] = [
    { stageId: "records-loaded", label: "Records loaded", count: sequentialFunnel.recordsLoaded },
    { stageId: "valid-book", label: "Valid book (sequential)", count: sequentialFunnel.validBook },
    { stageId: "synchronized-book", label: "Synchronized book (sequential)", count: sequentialFunnel.synchronizedBook },
    { stageId: "open-market", label: "Open market (sequential)", count: sequentialFunnel.openMarket },
    { stageId: "btc-join-available", label: "BTC join available (sequential)", count: sequentialFunnel.btcJoinAvailable },
    { stageId: "volatility-available", label: "Volatility available (sequential)", count: sequentialFunnel.volatilityAvailable },
    { stageId: "high-volatility", label: "High volatility (sequential)", count: sequentialFunnel.highVolatility },
    { stageId: "probability-band", label: "Probability band (sequential)", count: sequentialFunnel.probabilityBand },
    { stageId: "time-remaining-band", label: "Time remaining band (sequential)", count: sequentialFunnel.timeRemainingBand },
    { stageId: "qualifying-observation", label: "Qualifying observations (sequential)", count: sequentialFunnel.qualifyingObservation },
    { stageId: "candidate-episode", label: "Candidate episodes", count: episodeEntries.length },
    { stageId: "independent-market", label: "Independent candidate markets", count: marketRecords.length },
  ];

  const evidenceIdentity: CalibrationFadeV2EvidenceIdentity = {
    hypothesisId: spec.hypothesisId,
    hypothesisVersion: "v2",
    configurationHash,
    freezeCommitSha: CALIBRATION_FADE_V2_FREEZE_COMMIT_SHA,
    sourceRecordType: V2_REQUIRED_SOURCE_RECORD_TYPE,
    sourceContractId: V2_REQUIRED_SOURCE_RECORD_TYPE,
    captureRunId: runId,
    captureStartedAt,
    evidenceMode: input.config.evidenceMode,
    confirmatoryEligibility,
    confirmatoryIneligibilityReason:
      input.config.evidenceMode === "diagnostic" && confirmatoryEligibility
        ? "diagnostic-evaluation-does-not-claim-confirmatory"
        : ineligibilityReason,
  };

  const historicalBenchmark: HistoricalHypothesisBenchmark = {
    discoveryObservationCount: provenance.historicalCandidateLineage.observationCount,
    discoveryUniqueTradingDays: provenance.historicalCandidateLineage.uniqueTradingDays,
    discoveryCalibrationError: null,
    discoveryAverageImpliedProbability: null,
    discoveryRealizedFrequency: null,
    discoveryRobustnessScore: provenance.historicalCandidateLineage.robustnessScore,
    discoveryPassesValidation: provenance.historicalCandidateLineage.passes,
    sourceArtifactPaths: spec.canonicalSourceArtifacts,
    sourceArtifactHashes: {},
    caveats: [...provenance.historicalCandidateLineage.notes, ...provenance.limitations],
  };

  const warnings = [
    ...context.warnings,
    ...provenance.limitations,
    ...settlementSource.warnings,
    suppressedDuplicateCount > 0
      ? `Suppressed ${suppressedDuplicateCount} repeated qualifying snapshots within episodes.`
      : null,
    "v2 volatility used exchange-completed-1m-ohlc only; btc-spot.jsonl was not a volatility source.",
  ].filter((entry): entry is string => Boolean(entry));

  const report: CalibrationFadeV2ForwardValidationReport = {
    analysisVersion: CALIBRATION_FADE_V2_FORWARD_VALIDATION_VERSION,
    analysisScope: "selected-run",
    selectedRunId: runId,
    selectedRunDirectory: captureRunDir,
    sourceRunIds: [runId],
    hypothesisId: spec.hypothesisId,
    hypothesisVersion: "v2",
    hypothesisConfigurationHash: configurationHash,
    freezeCommitSha: CALIBRATION_FADE_V2_FREEZE_COMMIT_SHA,
    sourceRecordType: V2_REQUIRED_SOURCE_RECORD_TYPE,
    sourceContractId: V2_REQUIRED_SOURCE_RECORD_TYPE,
    captureRunId: runId,
    captureStartedAt,
    evidenceMode: input.config.evidenceMode,
    confirmatoryEligibility,
    confirmatoryIneligibilityReason: evidenceIdentity.confirmatoryIneligibilityReason,
    historicalSourceArtifacts: spec.canonicalSourceArtifacts,
    artifactGeneratedAt: input.generatedAt,
    outputPath: input.paths.outputPath,
    htmlOutputPath: input.paths.htmlOutputPath,
    eventsOutputPath: input.paths.eventsOutputPath,
    marketsOutputPath: input.paths.marketsOutputPath,
    recordsScanned,
    marketsScanned: marketsSeen.size,
    btcSpotRecordsScanned,
    candleObservationsScanned: candleIndex.observations.length,
    qualifyingObservationCount,
    candidateEpisodeCount: episodeEntries.length,
    candidateMarketCount: marketRecords.length,
    executableCandidateCount: metrics.executable.evaluatedExecutableCandidateCount,
    settlementCoverageShare: settlementCoverage.settlementCoverageShare,
    warnings,
    inputArtifactIdentities: [
      ...context.inputArtifactIdentities,
      { path: candlesPath, role: "btc-candles-1m", present: true },
    ],
    selectedRunQuality: context.selectedRunQuality,
    historicalBenchmark,
    evidenceIdentity,
    forwardBenchmark: {
      ...metrics.calibration,
      executable: metrics.executable,
      settlementCoverage,
    },
    funnel,
    gatePassCounts: gateCounts,
    volatilityWindowRejections,
    featureCompatibility: {
      probabilityMeasureAvailable: true,
      volatilityMeasureAvailable: gateCounts.volatilityAvailable > 0,
      timeRemainingAvailable: metadataByMarket.size > 0,
      incompatibleFeatures: featureIncompatible ? ["volatility-or-time-remaining"] : [],
      spotUsedForVolatility: false,
    },
    summary: classification,
    disclaimer: CALIBRATION_FADE_V2_FORWARD_VALIDATION_DISCLAIMER,
  };

  return {
    report,
    eventLines,
    marketLines: marketRecords.map((record) => JSON.stringify(record)),
    evidenceIdentity,
  };
}
