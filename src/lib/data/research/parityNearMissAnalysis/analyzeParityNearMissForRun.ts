import { z } from "zod";

import { classificationFamily } from "../bidOnlyCandidateLifecycle/bidOnlyCandidateLifecycleUtils";
import { classifyCandidateEpisode } from "../bidOnlyCandidateLifecycle/classifyCandidateLifecycle";
import type { BidOnlyClassifiedRecord, BidOnlyCandidateEpisode } from "../bidOnlyCandidateLifecycle/bidOnlyCandidateLifecycleTypes";
import { joinPath, parseIsoTimestampMs } from "../bidOnlyCandidateLifecycle/bidOnlyCandidateLifecycleUtils";
import { fnv1a32, stableStringify } from "@/lib/trading/config/hashConfig";

import { BoundedNearMissRanking } from "./boundedNearMissRanking";
import {
  buildObservationGateFlags,
  buildRuleConfiguration,
  createEmptyGateCounts,
  evaluateParityObservationGates,
  incrementGateRejectionCounts,
  isObservationEligible,
  resolveDistanceBucket,
} from "./evaluateParityObservationGates";
import { MINIMUM_FEE_PASS_NET_EDGE_CENTS, isDistanceEvaluable } from "./computeParityShortfalls";
import { loadSelectedRunContext, validateSelectedRunDirectory } from "./loadSelectedRunContext";
import { classifyParityNearMissInterpretation } from "./classifyParityNearMissInterpretation";
import {
  createEmptyIndependentGatePassCounts,
  createEmptySequentialFunnel,
  observationPassesSequentialQualification,
  updateIndependentGatePassCounts,
  updateSequentialFunnel,
} from "./parityGateSemantics";
import type {
  ParityNearMissAnalysisConfig,
  ParityNearMissAnalysisIo,
  ParityNearMissAnalysisReport,
  ParityNearMissDistanceBucket,
  ParityNearMissEpisodeRankedEntry,
  ParityNearMissObservationMetrics,
  ParityNearMissQualificationFunnel,
  ParityNearMissSequentialQualificationFunnel,
} from "./parityNearMissAnalysisTypes";
import {
  PARITY_NEAR_MISS_ANALYSIS_DISCLAIMER,
  PARITY_NEAR_MISS_DISTANCE_BUCKETS,
  PARITY_NEAR_MISS_DISTANCE_SIGN_CONVENTION,
  PARITY_NEAR_MISS_REJECTION_GATES,
} from "./parityNearMissAnalysisTypes";

const topOfBookSchema = z
  .object({
    marketTicker: z.string(),
    receivedAtLocal: z.string(),
    bookState: z.string(),
    yesBestBidCents: z.number().nullable().optional(),
    noBestBidCents: z.number().nullable().optional(),
    yesBestBidSize: z.number().nullable().optional(),
    noBestBidSize: z.number().nullable().optional(),
    yesBestAskCents: z.number().nullable().optional(),
    noBestAskCents: z.number().nullable().optional(),
    exchangeTimestampMs: z.number().nullable().optional(),
    sequence: z.number().nullable().optional(),
    isParityUsable: z.boolean().optional(),
    economicBookState: z.string().optional(),
    btcSpotPriceUsd: z.number().nullable().optional(),
  })
  .passthrough();

function emptyBucketRecord(): Record<ParityNearMissDistanceBucket, number> {
  return Object.fromEntries(
    PARITY_NEAR_MISS_DISTANCE_BUCKETS.map((bucket) => [bucket, 0]),
  ) as Record<ParityNearMissDistanceBucket, number>;
}

function incrementBucket(
  buckets: Record<ParityNearMissDistanceBucket, number>,
  distance: number | null,
  evaluable: boolean,
): void {
  buckets[resolveDistanceBucket(distance, evaluable)] += 1;
}

type EpisodeDraft = {
  runId: string;
  marketTicker: string;
  classificationFamily: string;
  records: BidOnlyClassifiedRecord[];
  gapsMs: number[];
};

function toClassifiedRecord(
  runId: string,
  input: z.infer<typeof topOfBookSchema>,
  receivedAtMs: number,
  metrics: ParityNearMissObservationMetrics,
  classification: string,
  feeBufferCents: number,
): BidOnlyClassifiedRecord {
  return {
    runId,
    marketTicker: input.marketTicker,
    eventTicker: null,
    receivedAtLocal: input.receivedAtLocal,
    receivedAtMs,
    classification,
    classificationFamily: classificationFamily(classification),
    bidSumCents:
      metrics.yesBidCents !== null && metrics.noBidCents !== null
        ? metrics.yesBidCents + metrics.noBidCents
        : null,
    bidOnlyEdgeCents: metrics.bidOnlyParityValue,
    estimatedNetEdgeCents:
      metrics.bidOnlyParityValue !== null
        ? metrics.bidOnlyParityValue - feeBufferCents
        : null,
    minBidSizeContracts: metrics.executableSize,
    requiresExecutableConfirmation: true,
    reason: metrics.firstRejectingGate ?? "qualified",
  };
}

function preloadBtcSpots(
  io: ParityNearMissAnalysisIo,
  captureRunDir: string,
): Array<{ timestampMs: number; priceUsd: number }> {
  const path = joinPath(captureRunDir, "btc-spot.jsonl");
  if (!io.fileExists(path)) {
    return [];
  }

  const points: Array<{ timestampMs: number; priceUsd: number }> = [];
  for (const line of io.readFile(path).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      const parsed = JSON.parse(trimmed) as {
        receivedAtLocal?: string;
        exchangeTimestampMs?: number | null;
        priceUsd?: number;
      };
      const timestampMs =
        parsed.exchangeTimestampMs
        ?? (parsed.receivedAtLocal ? parseIsoTimestampMs(parsed.receivedAtLocal) : null);
      if (timestampMs !== null && typeof parsed.priceUsd === "number") {
        points.push({ timestampMs, priceUsd: parsed.priceUsd });
      }
    } catch {
      // skip
    }
  }

  return points.sort((left, right) => left.timestampMs - right.timestampMs);
}

function findNearestBtcPrice(
  points: readonly { timestampMs: number; priceUsd: number }[],
  receivedAtMs: number,
): number | null {
  if (points.length === 0) {
    return null;
  }

  let nearest = points[0]!;
  let nearestDistance = Math.abs(receivedAtMs - nearest.timestampMs);
  for (const point of points) {
    const distance = Math.abs(receivedAtMs - point.timestampMs);
    if (distance < nearestDistance) {
      nearest = point;
      nearestDistance = distance;
    }
  }

  return nearest.priceUsd;
}

function shouldStartEpisode(
  previous: BidOnlyClassifiedRecord | null,
  current: BidOnlyClassifiedRecord,
  maxGapMs: number,
): boolean {
  if (!previous) {
    return false;
  }
  if (previous.marketTicker !== current.marketTicker) {
    return true;
  }
  if (previous.classificationFamily !== current.classificationFamily) {
    return true;
  }
  return current.receivedAtMs - previous.receivedAtMs > maxGapMs;
}

function finalizeEpisodeDraft(
  draft: EpisodeDraft,
  episodeIndex: number,
  config: ParityNearMissAnalysisConfig,
): BidOnlyCandidateEpisode {
  const sorted = [...draft.records].sort((left, right) => left.receivedAtMs - right.receivedAtMs);
  const edges = sorted
    .map((record) => record.bidOnlyEdgeCents)
    .filter((value): value is number => value !== null);
  const durationMs = sorted[sorted.length - 1]!.receivedAtMs - sorted[0]!.receivedAtMs;

  const episode: BidOnlyCandidateEpisode = {
    episodeId: `${draft.runId}:${draft.marketTicker}:${draft.classificationFamily}:${episodeIndex}`,
    runId: draft.runId,
    marketTicker: draft.marketTicker,
    eventTicker: null,
    classificationFamily: draft.classificationFamily,
    episodeClassification: "no-candidate",
    startedAt: sorted[0]!.receivedAtLocal,
    endedAt: sorted[sorted.length - 1]!.receivedAtLocal,
    durationMs: Math.max(0, durationMs),
    recordCount: sorted.length,
    maxBidOnlyEdgeCents: edges.length > 0 ? Math.max(...edges) : null,
    meanBidOnlyEdgeCents: edges.length > 0 ? edges.reduce((sum, value) => sum + value, 0) / edges.length : null,
    medianBidOnlyEdgeCents: null,
    p95BidOnlyEdgeCents: null,
    minBidSizeContracts: null,
    medianBidSizeContracts: null,
    maxBidSizeContracts: null,
    firstBidSumCents: null,
    lastBidSumCents: null,
    edgeStabilityScore: null,
    sizeStabilityScore: null,
    gapCount: draft.gapsMs.length,
    maxGapMs: draft.gapsMs.length > 0 ? Math.max(...draft.gapsMs) : null,
    btcStartPrice: null,
    btcEndPrice: null,
    btcMoveDuringEpisode: null,
    btcMoveBucket: "unknown",
    timeToCloseAtStartMs: null,
    timeToCloseAtEndMs: null,
    timeToCloseBucket: "unknown",
    requiresExecutableConfirmation: config.lifecycle.requireExecutableConfirmation,
  };

  episode.episodeClassification = classifyCandidateEpisode(
    episode,
    sorted,
    {
      forwardQuotesDir: config.captureRunDir,
      captureRunDir: config.captureRunDir,
      staticParityScanPath: null,
      pricingModel: "bid-only",
      maxGapMs: config.lifecycle.maxGapMs,
      minEpisodeDurationMs: config.lifecycle.minEpisodeDurationMs,
      minEdgeCents: config.friction.minGrossEdgeCents,
      minSizeContracts: config.friction.minSizeContracts,
      persistentEpisodeDurationMs: config.lifecycle.persistentEpisodeDurationMs,
      persistentEpisodeMinRecords: config.lifecycle.persistentEpisodeMinRecords,
      feeBufferCents: config.friction.feeBufferCents,
      minGrossEdgeCents: config.friction.minGrossEdgeCents,
      minBidOnlyEdgeCents: config.friction.minBidOnlyEdgeCents,
      requireExecutableConfirmation: config.lifecycle.requireExecutableConfirmation,
    },
  );

  return episode;
}

function resolveTimeRemainingBucket(timeRemainingMs: number | null): string {
  if (timeRemainingMs === null) {
    return "unknown";
  }
  const minutes = timeRemainingMs / 60_000;
  if (minutes < 1) {
    return "0-1m";
  }
  if (minutes < 3) {
    return "1-3m";
  }
  if (minutes < 5) {
    return "3-5m";
  }
  if (minutes < 10) {
    return "5-10m";
  }
  if (minutes <= 15) {
    return "10-15m";
  }
  return "beyond-15m";
}

function resolveBidSumRelationship(yesBid: number | null, noBid: number | null): string {
  if (yesBid === null || noBid === null) {
    return "missing-side";
  }
  const sum = yesBid + noBid;
  if (sum <= 100) {
    return "sum-lte-100";
  }
  if (sum <= 101) {
    return "sum-100-to-101";
  }
  if (sum <= 102) {
    return "sum-101-to-102";
  }
  return "sum-gt-102";
}

function resolveExecutableSizeBucket(size: number | null): string {
  if (size === null) {
    return "missing";
  }
  if (size < 1) {
    return "sub-contract";
  }
  if (size === 1) {
    return "exactly-1";
  }
  return "gt-1";
}

function resolveQuoteAgeBucket(quoteAgeMs: number | null): string {
  if (quoteAgeMs === null) {
    return "unknown";
  }
  if (quoteAgeMs <= 1000) {
    return "0-1s";
  }
  if (quoteAgeMs <= 5000) {
    return "1-5s";
  }
  return "gt-5s";
}

function buildLegacyQualificationFunnel(input: {
  recordsScanned: number;
  recordsEligible: number;
  positiveEdgeRecords: number;
  sequentialFunnel: ParityNearMissSequentialQualificationFunnel;
  persistentPass: number;
  finalCandidates: number;
}): ParityNearMissQualificationFunnel {
  return {
    recordsLoaded: input.recordsScanned,
    recordsEligible: input.recordsEligible,
    validBooks: input.sequentialFunnel.validBook,
    synchronizedBooks: input.sequentialFunnel.synchronizedBook,
    sizedBidPairs: input.sequentialFunnel.executableSize,
    positiveEdgeRecords: input.positiveEdgeRecords,
    grossPass: input.sequentialFunnel.grossThreshold,
    feePass: input.sequentialFunnel.feeThreshold,
    bufferPass: input.sequentialFunnel.bufferThreshold,
    stalenessPass: input.sequentialFunnel.stalenessPass,
    persistentPass: input.persistentPass,
    finalCandidates: input.finalCandidates,
  };
}

function updateClosestNearMiss(
  current: number | null,
  candidate: number | null,
): number | null {
  if (candidate === null || candidate <= 0) {
    return current;
  }
  if (current === null || candidate < current) {
    return candidate;
  }
  return current;
}

/** Streams one selected capture run and produces near-miss diagnostics. */
export async function analyzeParityNearMissForRun(input: {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  config: ParityNearMissAnalysisConfig;
  io: ParityNearMissAnalysisIo;
}): Promise<ParityNearMissAnalysisReport> {
  const captureRunDir = validateSelectedRunDirectory(input.io, input.config.captureRunDir);
  const context = loadSelectedRunContext({ io: input.io, captureRunDir });
  const ruleConfiguration = buildRuleConfiguration(input.config);
  const ruleConfigurationHash = `parity-near-miss-v1-${fnv1a32(stableStringify(ruleConfiguration))}`;

  const gateCounts = createEmptyGateCounts();
  const independentGatePassCounts = createEmptyIndependentGatePassCounts();
  const sequentialFunnel = createEmptySequentialFunnel();
  const grossBuckets = emptyBucketRecord();
  const feeBuckets = emptyBucketRecord();
  const bufferBuckets = emptyBucketRecord();
  const bidSumRelationship: Record<string, number> = {};
  const executableSizeBuckets: Record<string, number> = {};
  const timeRemainingBuckets: Record<string, number> = {};
  const quoteAgeBuckets: Record<string, number> = {};
  const persistenceBuckets: Record<string, number> = {};
  const perMarket: ParityNearMissAnalysisReport["perMarketBreakdown"] = {};

  const grossRanking = new BoundedNearMissRanking(input.config.nearMissLimit, "gross");
  const feeRanking = new BoundedNearMissRanking(input.config.nearMissLimit, "fee-adjusted");
  const bufferRanking = new BoundedNearMissRanking(input.config.nearMissLimit, "buffer-adjusted");
  const executableRanking = new BoundedNearMissRanking(input.config.nearMissLimit, "executable");

  let recordsScanned = 0;
  let recordsEligible = 0;
  let positiveEdgeRecords = 0;
  let finalCandidates = 0;
  let grossNearMissCount = 0;
  let feeAdjustedNearMissCount = 0;
  let bufferNearMissCount = 0;
  let knownFreshCount = 0;
  let knownStaleCount = 0;
  let unknownQuoteAgeCount = 0;
  let negativeQuoteAgeCount = 0;
  let closestGrossNearMissCents: number | null = null;
  let closestFeeAdjustedNearMissCents: number | null = null;
  let closestBufferNearMissCents: number | null = null;
  let malformedLineCount = 0;
  const priorSequenceByMarket = new Map<string, number | null>();

  const episodeState: { draft: EpisodeDraft | null } = { draft: null };
  let previousCandidateRecord: BidOnlyClassifiedRecord | null = null;
  let episodeIndex = 0;
  const episodes: BidOnlyCandidateEpisode[] = [];

  const topOfBookPath = joinPath(captureRunDir, "top-of-book.jsonl");
  const btcSpots = preloadBtcSpots(input.io, captureRunDir);

  await input.io.iterateJsonl(topOfBookPath, {
    onLine: (line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return "skip";
      }

      recordsScanned += 1;
      const recordIndex = recordsScanned;
      let parsed: z.infer<typeof topOfBookSchema>;
      try {
        parsed = topOfBookSchema.parse(JSON.parse(trimmed));
      } catch {
        malformedLineCount += 1;
        return "skip";
      }

      const receivedAtMs = parseIsoTimestampMs(parsed.receivedAtLocal);
      if (receivedAtMs === null) {
        malformedLineCount += 1;
        return "skip";
      }

      const priorSequence = priorSequenceByMarket.get(parsed.marketTicker) ?? null;
      const btcSpotPriceUsd =
        parsed.btcSpotPriceUsd
        ?? findNearestBtcPrice(btcSpots, receivedAtMs);

      const metrics = evaluateParityObservationGates(
        {
          marketTicker: parsed.marketTicker,
          receivedAtLocal: parsed.receivedAtLocal,
          receivedAtMs,
          bookState: parsed.bookState,
          yesBestBidCents: parsed.yesBestBidCents ?? null,
          noBestBidCents: parsed.noBestBidCents ?? null,
          yesBestBidSize: parsed.yesBestBidSize ?? null,
          noBestBidSize: parsed.noBestBidSize ?? null,
          yesBestAskCents: parsed.yesBestAskCents ?? null,
          noBestAskCents: parsed.noBestAskCents ?? null,
          exchangeTimestampMs: parsed.exchangeTimestampMs ?? null,
          btcSpotPriceUsd,
          closeTimeMs: context.marketCloseTimes.get(parsed.marketTicker) ?? null,
          sequence: parsed.sequence ?? null,
          priorSequence,
          isParityUsable: parsed.isParityUsable,
          economicBookState: parsed.economicBookState,
        },
        ruleConfiguration,
      );

      priorSequenceByMarket.set(parsed.marketTicker, parsed.sequence ?? null);

      const gateFlags = buildObservationGateFlags({
        bookValid: metrics.bookValid,
        bookSynchronized: metrics.bookSynchronized,
        bothSidesPresent: isDistanceEvaluable(metrics.yesBidCents, metrics.noBidCents),
        stalenessPass: metrics.stalenessPass,
        sizePass: metrics.sizePass,
        observedGrossEdgeCents: metrics.bidOnlyParityValue,
        estimatedNetEdgeCents:
          metrics.bidOnlyParityValue !== null
            ? metrics.bidOnlyParityValue - ruleConfiguration.feeBufferCents
            : null,
        friction: ruleConfiguration,
      });

      updateSequentialFunnel(sequentialFunnel, gateFlags);
      updateIndependentGatePassCounts(independentGatePassCounts, {
        flags: gateFlags,
        quoteAgeStatus: metrics.quoteAgeStatus,
        stalenessReject: metrics.stalenessPass === false,
      });
      incrementGateRejectionCounts(gateCounts, metrics);
      const fullyQualifiedObservation = observationPassesSequentialQualification(gateFlags);

      if (isObservationEligible(metrics)) {
        recordsEligible += 1;
      }

      if (metrics.bidOnlyParityValue !== null && metrics.bidOnlyParityValue > 0) {
        positiveEdgeRecords += 1;
      }

      if (metrics.quoteAgeStatus === "unknown") {
        unknownQuoteAgeCount += 1;
      } else if (metrics.quoteAgeStatus === "negative") {
        negativeQuoteAgeCount += 1;
      } else if (metrics.stalenessPass === true) {
        knownFreshCount += 1;
      } else if (metrics.stalenessPass === false) {
        knownStaleCount += 1;
      }

      const distanceEvaluable = isDistanceEvaluable(metrics.yesBidCents, metrics.noBidCents);
      incrementBucket(grossBuckets, metrics.grossDistanceToQualification, distanceEvaluable);
      incrementBucket(feeBuckets, metrics.feeAdjustedDistanceToQualification, distanceEvaluable);
      incrementBucket(bufferBuckets, metrics.bufferAdjustedDistanceToQualification, distanceEvaluable);

      if (
        distanceEvaluable
        && metrics.grossDistanceToQualification !== null
        && metrics.grossDistanceToQualification > 0
      ) {
        grossNearMissCount += 1;
        closestGrossNearMissCents = updateClosestNearMiss(
          closestGrossNearMissCents,
          metrics.grossDistanceToQualification,
        );
      }
      if (
        distanceEvaluable
        && metrics.feeAdjustedDistanceToQualification !== null
        && metrics.feeAdjustedDistanceToQualification > 0
      ) {
        feeAdjustedNearMissCount += 1;
        closestFeeAdjustedNearMissCents = updateClosestNearMiss(
          closestFeeAdjustedNearMissCents,
          metrics.feeAdjustedDistanceToQualification,
        );
      }
      if (
        distanceEvaluable
        && metrics.bufferAdjustedDistanceToQualification !== null
        && metrics.bufferAdjustedDistanceToQualification > 0
      ) {
        bufferNearMissCount += 1;
        closestBufferNearMissCents = updateClosestNearMiss(
          closestBufferNearMissCents,
          metrics.bufferAdjustedDistanceToQualification,
        );
      }

      bidSumRelationship[resolveBidSumRelationship(metrics.yesBidCents, metrics.noBidCents)] =
        (bidSumRelationship[resolveBidSumRelationship(metrics.yesBidCents, metrics.noBidCents)] ?? 0) + 1;
      executableSizeBuckets[resolveExecutableSizeBucket(metrics.executableSize)] =
        (executableSizeBuckets[resolveExecutableSizeBucket(metrics.executableSize)] ?? 0) + 1;
      timeRemainingBuckets[resolveTimeRemainingBucket(metrics.timeRemainingMs)] =
        (timeRemainingBuckets[resolveTimeRemainingBucket(metrics.timeRemainingMs)] ?? 0) + 1;
      quoteAgeBuckets[resolveQuoteAgeBucket(metrics.quoteAgeMs)] =
        (quoteAgeBuckets[resolveQuoteAgeBucket(metrics.quoteAgeMs)] ?? 0) + 1;

      if (!perMarket[metrics.marketTicker]) {
        perMarket[metrics.marketTicker] = {
          recordsScanned: 0,
          grossPass: 0,
          bufferPass: 0,
          closestGrossNearMissCents: null,
        };
      }
      const marketStats = perMarket[metrics.marketTicker]!;
      marketStats.recordsScanned += 1;
      if (metrics.grossParityPass) {
        marketStats.grossPass += 1;
      }
      if (metrics.bufferPass) {
        marketStats.bufferPass += 1;
      }
      if (
        distanceEvaluable
        && metrics.grossDistanceToQualification !== null
        && metrics.grossDistanceToQualification > 0
      ) {
        marketStats.closestGrossNearMissCents = updateClosestNearMiss(
          marketStats.closestGrossNearMissCents,
          metrics.grossDistanceToQualification,
        );
      }

      if (distanceEvaluable) {
        const rankingBase = {
          recordIndex,
          marketTicker: metrics.marketTicker,
          timestamp: metrics.timestamp,
          timeRemainingMs: metrics.timeRemainingMs,
          yesBidCents: metrics.yesBidCents,
          noBidCents: metrics.noBidCents,
          yesBidSize: metrics.yesBidSize,
          noBidSize: metrics.noBidSize,
          observedEdgeCents: metrics.bidOnlyParityValue,
          bookValid: metrics.bookValid,
          bookSynchronized: metrics.bookSynchronized,
          quoteAgeMs: metrics.quoteAgeMs,
          firstRejectingGate: metrics.firstRejectingGate,
          allRejectingGates: metrics.allRejectingGates,
          integrityCaveat: metrics.integrityCaveat,
        };

        grossRanking.consider({
          ...rankingBase,
          requiredEdgeCents: ruleConfiguration.minGrossEdgeCents,
          shortfallCents: metrics.grossDistanceToQualification ?? 0,
          distance: metrics.grossDistanceToQualification,
        });
        feeRanking.consider({
          ...rankingBase,
          requiredEdgeCents:
            ruleConfiguration.feeBufferCents + MINIMUM_FEE_PASS_NET_EDGE_CENTS,
          shortfallCents: metrics.feeAdjustedDistanceToQualification ?? 0,
          distance: metrics.feeAdjustedDistanceToQualification,
        });
        bufferRanking.consider({
          ...rankingBase,
          requiredEdgeCents: ruleConfiguration.minBidOnlyEdgeCents,
          shortfallCents: metrics.bufferAdjustedDistanceToQualification ?? 0,
          distance: metrics.bufferAdjustedDistanceToQualification,
        });
        if (!metrics.sizePass) {
          executableRanking.consider({
            ...rankingBase,
            requiredEdgeCents: ruleConfiguration.minSizeContracts,
            shortfallCents:
              metrics.executableSize === null
                ? ruleConfiguration.minSizeContracts
                : Math.max(0, ruleConfiguration.minSizeContracts - metrics.executableSize),
            distance:
              metrics.executableSize === null
                ? null
                : ruleConfiguration.minSizeContracts - metrics.executableSize,
          });
        }
      }

      if (fullyQualifiedObservation) {
        finalCandidates += 1;
      }

      const classification =
        fullyQualifiedObservation
          ? "bid-only-buffer-adjusted-candidate"
          : metrics.grossParityPass
            ? "bid-only-gross-candidate"
            : metrics.bidOnlyParityValue !== null && metrics.bidOnlyParityValue > 0
              ? "bid-only-watch"
              : "bid-only-no-signal";

      if (
        classification === "bid-only-watch"
        || classification === "bid-only-gross-candidate"
        || classification === "bid-only-buffer-adjusted-candidate"
      ) {
        const classifiedRecord = toClassifiedRecord(
          context.runId,
          parsed,
          receivedAtMs,
          metrics,
          classification,
          input.config.friction.feeBufferCents,
        );

        if (shouldStartEpisode(previousCandidateRecord, classifiedRecord, input.config.lifecycle.maxGapMs)) {
          if (episodeState.draft && episodeState.draft.records.length > 0) {
            episodes.push(finalizeEpisodeDraft(episodeState.draft, episodeIndex, input.config));
            episodeIndex += 1;
          }
          episodeState.draft = null;
        }

        if (!episodeState.draft) {
          episodeState.draft = {
            runId: context.runId,
            marketTicker: classifiedRecord.marketTicker,
            classificationFamily: classifiedRecord.classificationFamily,
            records: [],
            gapsMs: [],
          };
        }

        if (episodeState.draft.records.length > 0) {
          const gap =
            classifiedRecord.receivedAtMs
            - episodeState.draft.records[episodeState.draft.records.length - 1]!.receivedAtMs;
          if (gap > 0) {
            episodeState.draft.gapsMs.push(gap);
          }
        }

        episodeState.draft.records.push(classifiedRecord);
        previousCandidateRecord = classifiedRecord;
      }

      return "continue";
    },
  });

  if (episodeState.draft && episodeState.draft.records.length > 0) {
    episodes.push(finalizeEpisodeDraft(episodeState.draft, episodeIndex, input.config));
  }

  gateCounts.episodesReachingStage.built = episodes.length;
  const grossEpisodes: ParityNearMissEpisodeRankedEntry[] = [];
  const bufferEpisodes: ParityNearMissEpisodeRankedEntry[] = [];

  for (const episode of episodes) {
    const distance = episode.maxBidOnlyEdgeCents === null
      ? null
      : input.config.friction.minGrossEdgeCents - episode.maxBidOnlyEdgeCents;
    const bufferDistance = episode.maxBidOnlyEdgeCents === null
      ? null
      : input.config.friction.minBidOnlyEdgeCents
        - (episode.maxBidOnlyEdgeCents - input.config.friction.feeBufferCents);
    persistenceBuckets[episode.episodeClassification] =
      (persistenceBuckets[episode.episodeClassification] ?? 0) + 1;

    if (episode.classificationFamily === "gross-candidate" || episode.classificationFamily === "watch") {
      gateCounts.episodesReachingStage.grossEpisode += 1;
      if (distance !== null && distance > 0) {
        grossEpisodes.push({
          rank: 0,
          episodeId: episode.episodeId,
          marketTicker: episode.marketTicker,
          startedAt: episode.startedAt,
          endedAt: episode.endedAt,
          durationMs: episode.durationMs,
          recordCount: episode.recordCount,
          maxBidOnlyEdgeCents: episode.maxBidOnlyEdgeCents,
          distance,
          distanceKind: "gross",
          firstRejectingGate:
            episode.episodeClassification === "persistent-candidate-episode"
              ? "insufficient-persistence"
              : "gross-parity-shortfall",
          episodeClassification: episode.episodeClassification,
        });
      }
      if (bufferDistance !== null && bufferDistance > 0) {
        bufferEpisodes.push({
          rank: 0,
          episodeId: episode.episodeId,
          marketTicker: episode.marketTicker,
          startedAt: episode.startedAt,
          endedAt: episode.endedAt,
          durationMs: episode.durationMs,
          recordCount: episode.recordCount,
          maxBidOnlyEdgeCents: episode.maxBidOnlyEdgeCents,
          distance: bufferDistance,
          distanceKind: "buffer-adjusted",
          firstRejectingGate: "buffer-adjusted-shortfall",
          episodeClassification: episode.episodeClassification,
        });
      }
    }

    if (episode.classificationFamily === "buffer-adjusted-candidate") {
      gateCounts.episodesReachingStage.bufferEpisode += 1;
    }
    if (episode.episodeClassification === "persistent-candidate-episode") {
      gateCounts.episodesReachingStage.persistentEpisode += 1;
      independentGatePassCounts.persistencePass += 1;
    }
  }

  grossEpisodes.sort((left, right) => left.distance - right.distance);
  grossEpisodes.forEach((entry, index) => {
    entry.rank = index + 1;
  });
  bufferEpisodes.sort((left, right) => left.distance - right.distance);
  bufferEpisodes.forEach((entry, index) => {
    entry.rank = index + 1;
  });

  const warnings = [...context.warnings];
  if (malformedLineCount > 0) {
    warnings.push(`${malformedLineCount} malformed top-of-book JSONL line(s) skipped.`);
  }

  const qualificationFunnel = buildLegacyQualificationFunnel({
    recordsScanned,
    recordsEligible,
    positiveEdgeRecords,
    sequentialFunnel,
    persistentPass: gateCounts.episodesReachingStage.persistentEpisode,
    finalCandidates,
  });

  const summary = classifyParityNearMissInterpretation({
    recordsScanned,
    recordsEligible,
    sequentialFunnel,
    independentGatePassCounts,
    gateCounts,
    closestGrossNearMiss: closestGrossNearMissCents,
    closestFeeAdjustedNearMiss: closestFeeAdjustedNearMissCents,
    closestBufferNearMiss: closestBufferNearMissCents,
    grossNearMissCount,
    feeAdjustedNearMissCount,
    bufferNearMissCount,
    selectedRunQuality: context.selectedRunQuality,
  });

  return {
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
    disclaimer: PARITY_NEAR_MISS_ANALYSIS_DISCLAIMER,
    distanceSignConvention: PARITY_NEAR_MISS_DISTANCE_SIGN_CONVENTION,
    analysisScope: "selected-run",
    selectedRunId: context.runId,
    selectedRunDirectory: captureRunDir,
    sourceRunIds: [context.runId],
    recordsScanned,
    recordsEligible,
    episodesBuilt: episodes.length,
    artifactGeneratedAt: input.generatedAt,
    ruleConfiguration,
    ruleConfigurationHash,
    inputArtifactIdentities: context.inputArtifactIdentities,
    selectedRunQuality: context.selectedRunQuality,
    independentGatePassCounts,
    sequentialQualificationFunnel: sequentialFunnel,
    qualificationFunnel,
    gateCounts,
    stalenessSummary: {
      stalenessThresholdMs: ruleConfiguration.stalenessBoundMs,
      knownFreshCount,
      knownStaleCount,
      unknownQuoteAgeCount,
      negativeQuoteAgeCount,
    },
    distanceDistributions: {
      gross: grossBuckets,
      feeAdjusted: feeBuckets,
      bufferAdjusted: bufferBuckets,
      bidSumRelationship,
      executableSize: executableSizeBuckets,
      timeRemaining: timeRemainingBuckets,
      quoteAge: quoteAgeBuckets,
      persistenceLength: persistenceBuckets,
    },
    nearMissRankings: {
      gross: grossRanking.toRankedEntries(),
      feeAdjusted: feeRanking.toRankedEntries(),
      bufferAdjusted: bufferRanking.toRankedEntries(),
      executable: executableRanking.toRankedEntries(),
      grossEpisodes: grossEpisodes.slice(0, input.config.nearMissLimit),
      bufferEpisodes: bufferEpisodes.slice(0, input.config.nearMissLimit),
    },
    perMarketBreakdown: perMarket,
    timeRemainingBreakdown: timeRemainingBuckets,
    summary,
    warnings,
  };
}

export function serializeParityNearMissAnalysisReport(
  report: ParityNearMissAnalysisReport,
): string {
  return stableStringify(report);
}

export { PARITY_NEAR_MISS_REJECTION_GATES };
