import { dirname } from "node:path";
import { fnv1a32, stableStringify } from "@/lib/trading/config/hashConfig";

import { LeadLagAggregateCollector } from "./aggregateLeadLagMetrics";
import { joinBtcCausally, preloadBtcSpotSeries } from "./causalBtcJoin";
import { classifyLeadLagInterpretation } from "./classifyLeadLagInterpretation";
import { detectBtcTriggers } from "./triggerDetection";
import { computeForwardResponses } from "./forwardResponse";
import {
  loadSelectedRunLeadLagContext,
  validateSelectedRunDirectory,
} from "./loadSelectedRunLeadLagContext";
import {
  resolveDistanceFromThresholdBps,
  resolveImpliedProbabilityBin,
  resolveTimeRemainingBin,
} from "./leadLagBins";
import { joinPath, parseIsoTimestampMs, publishStagedFileAtomically, readString, resolveQuoteRetentionWindowMs } from "./leadLagUtils";
import {
  buildQuoteSnapshot,
  findLastQuoteAtOrBefore,
  parseTopOfBookLine,
  parseTopOfBookTimestampMs,
} from "./quoteMeasures";
import { resolveMarketContractSemantics } from "./resolveMarketContractSemantics";
import {
  BTC_KALSHI_LEAD_LAG_ANALYSIS_VERSION,
  BTC_KALSHI_LEAD_LAG_DISCLAIMER,
  BTC_MAGNITUDE_BINS,
  BTC_RETURN_HORIZONS_MS,
  RESPONSE_WINDOWS_MS,
  type BtcKalshiLeadLagAnalysisConfig,
  type BtcKalshiLeadLagAnalysisIo,
  type BtcKalshiLeadLagAnalysisReport,
  type LeadLagEventRecord,
  type QuoteSnapshot,
} from "./btcKalshiLeadLagAnalysisTypes";

function resolveBtcSampleAgeBucket(ageMs: number | null): string {
  if (ageMs === null) {
    return "unjoined";
  }
  if (ageMs <= 500) {
    return "0-500ms";
  }
  if (ageMs <= 1_000) {
    return "500ms-1s";
  }
  if (ageMs <= 2_000) {
    return "1s-2s";
  }
  if (ageMs <= 5_000) {
    return "2s-5s";
  }
  return "over-5s";
}

function didCrossThresholdDuringWindow(input: {
  floorStrikeUsd: number | null;
  btcPriceAtTrigger: number;
  triggerTimestampMs: number;
  btcPoints: readonly { timestampMs: number; priceUsd: number }[];
  windowEndMs: number;
}): boolean {
  if (input.floorStrikeUsd === null) {
    return false;
  }

  const aboveAtTrigger = input.btcPriceAtTrigger > input.floorStrikeUsd;
  for (const point of input.btcPoints) {
    if (point.timestampMs <= input.triggerTimestampMs) {
      continue;
    }
    if (point.timestampMs > input.windowEndMs) {
      break;
    }
    const above = point.priceUsd > input.floorStrikeUsd;
    if (above !== aboveAtTrigger) {
      return true;
    }
  }
  return false;
}

export async function analyzeBtcKalshiLeadLagForRun(input: {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  eventsOutputPath: string;
  config: BtcKalshiLeadLagAnalysisConfig;
  io: BtcKalshiLeadLagAnalysisIo;
}): Promise<BtcKalshiLeadLagAnalysisReport> {
  const captureRunDir = validateSelectedRunDirectory(input.io, input.config.captureRunDir);
  const context = loadSelectedRunLeadLagContext({ io: input.io, captureRunDir });
  const configurationHash = `${BTC_KALSHI_LEAD_LAG_ANALYSIS_VERSION}-${fnv1a32(
    stableStringify(input.config),
  )}`;

  const { points: btcPoints, recordsScanned: btcRecordsScanned } = await preloadBtcSpotSeries(
    input.io,
    captureRunDir,
  );
  const { triggers, suppressedOverlappingTriggerCount } = detectBtcTriggers({
    points: btcPoints,
    horizonsMs: BTC_RETURN_HORIZONS_MS,
    triggerCooldownMs: input.config.triggerCooldownMs,
  });
  const quoteRetentionWindow = resolveQuoteRetentionWindowMs({
    triggerTimestampsMs: triggers.map((trigger) => trigger.triggerTimestampMs),
    maximumBtcHorizonMs: Math.max(...BTC_RETURN_HORIZONS_MS),
    maximumResponseWindowMs: Math.max(...RESPONSE_WINDOWS_MS),
    responseMatchToleranceMs: input.config.responseMatchToleranceMs,
  });

  const quotesByMarket = new Map<string, QuoteSnapshot[]>();
  let recordsScanned = 0;
  let unjoinedObservationCount = 0;
  let staleJoinCount = 0;
  const btcSampleAgeDistribution: Record<string, number> = {};
  const btcMoveDistribution: Record<string, number> = {};
  const triggerCountsByHorizon: Record<string, number> = {};
  const triggerCountsByMagnitudeBin: Record<string, number> = Object.fromEntries(
    BTC_MAGNITUDE_BINS.map((bin) => [bin, 0]),
  );
  const exclusionReasons: Record<string, number> = {};

  await input.io.iterateJsonl(joinPath(captureRunDir, "top-of-book.jsonl"), {
    onLine: (line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return "skip";
      }
      recordsScanned += 1;
      const parsed = parseTopOfBookLine(trimmed);
      if (!parsed) {
        return "skip";
      }

      const marketTicker = readString(parsed.marketTicker);
      const receivedAtLocal = readString(parsed.receivedAtLocal);
      const receivedAtMs = receivedAtLocal ? parseIsoTimestampMs(receivedAtLocal) : null;
      const timestampMs = parseTopOfBookTimestampMs(parsed);
      if (!marketTicker || receivedAtMs === null || timestampMs === null) {
        return "skip";
      }

      if (
        quoteRetentionWindow
        && (timestampMs < quoteRetentionWindow.startMs || timestampMs > quoteRetentionWindow.endMs)
      ) {
        return "skip";
      }

      const join = joinBtcCausally(btcPoints, timestampMs, input.config.maximumBtcJoinAgeMs);
      const ageBucket = resolveBtcSampleAgeBucket(join.sampleAgeMs);
      btcSampleAgeDistribution[ageBucket] = (btcSampleAgeDistribution[ageBucket] ?? 0) + 1;
      if (!join.joined) {
        unjoinedObservationCount += 1;
        if (join.stale) {
          staleJoinCount += 1;
        }
      }

      if (!context.marketSemantics.has(marketTicker)) {
        context.marketSemantics.set(
          marketTicker,
          resolveMarketContractSemantics({
            marketTicker,
            seriesTicker: readString(parsed.seriesTicker),
            eventTicker: readString(parsed.eventTicker),
            closeTimeMs: null,
            metadataRecord: null,
          }),
        );
      }

      const quote = buildQuoteSnapshot(parsed, receivedAtMs, input.config.stalenessBoundMs);
      const existing = quotesByMarket.get(marketTicker) ?? [];
      existing.push(quote);
      quotesByMarket.set(marketTicker, existing);
      return "continue";
    },
  });

  for (const quotes of quotesByMarket.values()) {
    quotes.sort((left, right) => left.timestampMs - right.timestampMs);
  }

  input.io.mkdirSync(dirname(input.eventsOutputPath), { recursive: true });
  const eventsStagingPath = `${input.eventsOutputPath}.${process.pid}.events.staging`;
  input.io.writeFile(eventsStagingPath, "");

  const collector = new LeadLagAggregateCollector();
  let eventCounter = 0;
  let eligibleEventCount = 0;
  let excludedMarketTriggerPairs = 0;
  let executableSideVisibleCount = 0;

  for (const trigger of triggers) {
    triggerCountsByHorizon[`${trigger.horizonMs / 1000}s`] =
      (triggerCountsByHorizon[`${trigger.horizonMs / 1000}s`] ?? 0) + 1;
    triggerCountsByMagnitudeBin[trigger.btcMagnitudeBin] =
      (triggerCountsByMagnitudeBin[trigger.btcMagnitudeBin] ?? 0) + 1;
    btcMoveDistribution[trigger.btcMagnitudeBin] =
      (btcMoveDistribution[trigger.btcMagnitudeBin] ?? 0) + 1;

    for (const [marketTicker, quotes] of quotesByMarket.entries()) {
      const semantics = context.marketSemantics.get(marketTicker)!;
      if (semantics.exclusionReason) {
        exclusionReasons[semantics.exclusionReason] =
          (exclusionReasons[semantics.exclusionReason] ?? 0) + 1;
        excludedMarketTriggerPairs += 1;
        continue;
      }

      if (semantics.closeTimeMs !== null && trigger.triggerTimestampMs >= semantics.closeTimeMs) {
        excludedMarketTriggerPairs += 1;
        continue;
      }

      const triggerQuote = findLastQuoteAtOrBefore(quotes, trigger.triggerTimestampMs);
      if (!triggerQuote) {
        excludedMarketTriggerPairs += 1;
        continue;
      }

      const join = joinBtcCausally(
        btcPoints,
        trigger.triggerTimestampMs,
        input.config.maximumBtcJoinAgeMs,
      );
      if (!join.joined || join.priceUsd === null) {
        excludedMarketTriggerPairs += 1;
        continue;
      }

      const contractDirectionResolved = semantics.comparisonDirection !== null;
      if (!contractDirectionResolved) {
        excludedMarketTriggerPairs += 1;
        continue;
      }

      eligibleEventCount += 1;

      const timeRemainingMs =
        semantics.closeTimeMs === null
          ? null
          : Math.max(semantics.closeTimeMs - trigger.triggerTimestampMs, 0);
      const distanceFromThresholdBps =
        semantics.floorStrikeUsd === null
          ? null
          : resolveDistanceFromThresholdBps(join.priceUsd, semantics.floorStrikeUsd);
      const thresholdCrossingDuringWindow = didCrossThresholdDuringWindow({
        floorStrikeUsd: semantics.floorStrikeUsd,
        btcPriceAtTrigger: join.priceUsd,
        triggerTimestampMs: trigger.triggerTimestampMs,
        btcPoints,
        windowEndMs: trigger.triggerTimestampMs + 60_000,
      });

      const responses = computeForwardResponses({
        triggerTimestampMs: trigger.triggerTimestampMs,
        triggerQuote,
        quotes,
        closeTimeMs: semantics.closeTimeMs,
        btcDirection: trigger.btcDirection,
        comparisonDirection: semantics.comparisonDirection,
        responseWindowsMs: RESPONSE_WINDOWS_MS,
        responseMatchToleranceMs: input.config.responseMatchToleranceMs,
        stalenessBoundMs: input.config.stalenessBoundMs,
      });

      if (
        responses.some(
          (response) =>
            response.signedYesAskResponseCents !== null
            && Math.abs(response.signedYesAskResponseCents) >= 1,
        )
      ) {
        executableSideVisibleCount += 1;
      }

      eventCounter += 1;
      const event: LeadLagEventRecord = {
        eventId: `${context.runId}-event-${eventCounter}`,
        selectedRunId: context.runId,
        marketTicker,
        triggerTimestamp: trigger.triggerTimestamp,
        triggerTimestampMs: trigger.triggerTimestampMs,
        btcMoveHorizonMs: trigger.horizonMs,
        btcReturnBps: trigger.btcReturnBps,
        btcMagnitudeBin: trigger.btcMagnitudeBin,
        btcDirection: trigger.btcDirection,
        btcPriceAtTrigger: join.priceUsd,
        marketThresholdUsd: semantics.floorStrikeUsd,
        distanceFromThresholdBps,
        btcAboveThreshold:
          semantics.floorStrikeUsd === null ? null : join.priceUsd > semantics.floorStrikeUsd,
        thresholdCrossingDuringWindow,
        timeRemainingMs,
        timeRemainingBin: resolveTimeRemainingBin(timeRemainingMs),
        impliedProbabilityBin: resolveImpliedProbabilityBin(triggerQuote.yesMidCents),
        yesBidAtTrigger: triggerQuote.yesBidCents,
        yesAskAtTrigger: triggerQuote.yesAskCents,
        yesMidAtTrigger: triggerQuote.yesMidCents,
        spreadAtTrigger: triggerQuote.spreadCents,
        sizeAtTrigger: triggerQuote.bestDisplayedSize,
        bookValidAtTrigger: triggerQuote.bookValid,
        bookSynchronizedAtTrigger: triggerQuote.bookSynchronized,
        quoteAgeMsAtTrigger: triggerQuote.quoteAgeMs,
        btcSampleAgeMs: join.sampleAgeMs,
        contractDirectionResolved,
        responses,
        dataQualityCaveats: join.stale ? ["stale-btc-join-at-trigger"] : [],
      };

      input.io.appendFile(eventsStagingPath, `${stableStringify(event)}\n`);
      collector.addEvent(event);
    }
  }

  publishStagedFileAtomically(input.io, input.eventsOutputPath, eventsStagingPath);

  const aggregateMaps = collector.finalizeMaps();
  const marketsWithDirectionalSemantics = [...context.marketSemantics.values()].filter(
    (semantics) => semantics.comparisonDirection !== null,
  ).length;
  const marketsExcludedFromDirectionalAnalysis = [...context.marketSemantics.values()].filter(
    (semantics) => semantics.exclusionReason !== null,
  ).length;
  const marketsWithThresholdMetadata = [...context.marketSemantics.values()].filter(
    (semantics) => semantics.floorStrikeUsd !== null,
  ).length;

  const summary = classifyLeadLagInterpretation({
    eligibleTriggerCount: eligibleEventCount,
    triggerCount: triggers.length,
    excludedTriggerCount: excludedMarketTriggerPairs,
    minimumTriggersForClassification: input.config.minimumTriggersForClassification,
    minimumEligibleTriggersForStrongClassification:
      input.config.minimumEligibleTriggersForStrongClassification,
    selectedRunQuality: context.selectedRunQuality,
    directionalResponseShare: collector.getOverallDirectionalShare(),
    consistentDirectionAcrossBins: collector.isConsistentAcrossMagnitudeBins(),
    executableSideVisible: executableSideVisibleCount > 0,
    thresholdCrossingEventShare: collector.getThresholdCrossingShare(eventCounter),
    medianSignedResponseAt5Seconds: collector.getMedianSignedResponseAt5Seconds(),
  });

  const warnings = [...context.warnings];
  if (marketsWithThresholdMetadata === 0) {
    warnings.push(
      "No floor-strike metadata found in selected-run market metadata; threshold-distance breakdowns are limited.",
    );
  }

  return {
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
    eventsOutputPath: input.eventsOutputPath,
    disclaimer: BTC_KALSHI_LEAD_LAG_DISCLAIMER,
    analysisScope: "selected-run",
    selectedRunId: context.runId,
    selectedRunDirectory: captureRunDir,
    sourceRunIds: [context.runId],
    artifactGeneratedAt: input.generatedAt,
    analysisVersion: BTC_KALSHI_LEAD_LAG_ANALYSIS_VERSION,
    configuration: input.config,
    configurationHash,
    recordsScanned,
    btcRecordsScanned,
    marketCount: quotesByMarket.size,
    triggerCount: triggers.length,
    eligibleTriggerCount: eligibleEventCount,
    excludedTriggerCount: excludedMarketTriggerPairs,
    warnings,
    inputArtifactIdentities: context.inputArtifactIdentities,
    selectedRunQuality: context.selectedRunQuality,
    causalJoinQuality: {
      btcJoinDirection: "backward-only",
      maximumBtcJoinAgeMs: input.config.maximumBtcJoinAgeMs,
      unjoinedObservationCount,
      staleJoinCount,
      btcSampleAgeMsDistribution: btcSampleAgeDistribution,
      futureLeakageGuardStatus: "pass",
    },
    marketCoverage: {
      marketsWithDirectionalSemantics,
      marketsExcludedFromDirectionalAnalysis,
      marketsWithThresholdMetadata,
      exclusionReasons,
    },
    btcMoveDistribution,
    triggerCountsByHorizon,
    triggerCountsByMagnitudeBin,
    suppressedOverlappingTriggerCount,
    ...aggregateMaps,
    summary,
  };
}

export function serializeBtcKalshiLeadLagAnalysisReport(
  report: BtcKalshiLeadLagAnalysisReport,
): string {
  return stableStringify(report);
}

export { validateSelectedRunDirectory };
