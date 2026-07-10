import type {
  BidOnlyCandidateEpisode,
  BidOnlyCandidateLifecycleConfig,
  BidOnlyClassifiedRecord,
} from "./bidOnlyCandidateLifecycleTypes";
import type { LoadedBidOnlyRunInput, LoadedBtcSpotPoint } from "./loadBidOnlyParityInputs";
import { classifyCandidateEpisode } from "./classifyCandidateLifecycle";
import {
  mean,
  median,
  percentile,
  resolveBtcMoveBucket,
  resolveTimeToCloseBucket,
  stabilityScore,
} from "./bidOnlyCandidateLifecycleUtils";

type EpisodeDraft = {
  runId: string;
  marketTicker: string;
  eventTicker: string | null;
  classificationFamily: string;
  records: BidOnlyClassifiedRecord[];
  gapsMs: number[];
};

function findNearestBtcPrice(
  timestampMs: number,
  btcSpots: readonly LoadedBtcSpotPoint[],
): number | null {
  if (btcSpots.length === 0) {
    return null;
  }

  let nearest = btcSpots[0]!;
  let nearestDistance = Math.abs(timestampMs - nearest.timestampMs);
  for (const spot of btcSpots) {
    const distance = Math.abs(timestampMs - spot.timestampMs);
    if (distance < nearestDistance) {
      nearest = spot;
      nearestDistance = distance;
    }
  }

  return nearest.priceUsd;
}

function finalizeEpisode(
  draft: EpisodeDraft,
  episodeIndex: number,
  run: LoadedBidOnlyRunInput,
  config: BidOnlyCandidateLifecycleConfig,
): BidOnlyCandidateEpisode {
  const sorted = [...draft.records].sort((left, right) => left.receivedAtMs - right.receivedAtMs);
  const startedAt = sorted[0]!.receivedAtLocal;
  const endedAt = sorted[sorted.length - 1]!.receivedAtLocal;
  const durationMs = sorted[sorted.length - 1]!.receivedAtMs - sorted[0]!.receivedAtMs;

  const edges = sorted
    .map((record) => record.bidOnlyEdgeCents)
    .filter((value): value is number => value !== null);
  const sizes = sorted
    .map((record) => record.minBidSizeContracts)
    .filter((value): value is number => value !== null);
  const bidSums = sorted
    .map((record) => record.bidSumCents)
    .filter((value): value is number => value !== null);

  const metadata = run.marketMetadata.get(draft.marketTicker);
  const timeToCloseAtStartMs =
    metadata?.closeTimeMs !== null && metadata?.closeTimeMs !== undefined
      ? metadata.closeTimeMs - sorted[0]!.receivedAtMs
      : null;
  const timeToCloseAtEndMs =
    metadata?.closeTimeMs !== null && metadata?.closeTimeMs !== undefined
      ? metadata.closeTimeMs - sorted[sorted.length - 1]!.receivedAtMs
      : null;

  const btcStartPrice = findNearestBtcPrice(sorted[0]!.receivedAtMs, run.btcSpots);
  const btcEndPrice = findNearestBtcPrice(sorted[sorted.length - 1]!.receivedAtMs, run.btcSpots);
  const btcMoveDuringEpisode =
    btcStartPrice !== null && btcEndPrice !== null ? btcEndPrice - btcStartPrice : null;

  const minSize = sizes.length > 0 ? Math.min(...sizes) : null;
  const maxSize = sizes.length > 0 ? Math.max(...sizes) : null;
  const medianSize = median(sizes);

  const episode: BidOnlyCandidateEpisode = {
    episodeId: `${draft.runId}:${draft.marketTicker}:${draft.classificationFamily}:${episodeIndex}`,
    runId: draft.runId,
    marketTicker: draft.marketTicker,
    eventTicker: draft.eventTicker,
    classificationFamily: draft.classificationFamily,
    episodeClassification: "no-candidate",
    startedAt,
    endedAt,
    durationMs: Math.max(0, durationMs),
    recordCount: sorted.length,
    maxBidOnlyEdgeCents: edges.length > 0 ? Math.max(...edges) : null,
    meanBidOnlyEdgeCents: mean(edges),
    medianBidOnlyEdgeCents: median(edges),
    p95BidOnlyEdgeCents: percentile(edges, 95),
    minBidSizeContracts: minSize,
    medianBidSizeContracts: medianSize,
    maxBidSizeContracts: maxSize,
    firstBidSumCents: bidSums[0] ?? null,
    lastBidSumCents: bidSums[bidSums.length - 1] ?? null,
    edgeStabilityScore: stabilityScore(edges),
    sizeStabilityScore:
      minSize !== null && maxSize !== null && maxSize > 0 ? minSize / maxSize : null,
    gapCount: draft.gapsMs.length,
    maxGapMs: draft.gapsMs.length > 0 ? Math.max(...draft.gapsMs) : null,
    btcStartPrice,
    btcEndPrice,
    btcMoveDuringEpisode,
    btcMoveBucket: resolveBtcMoveBucket(btcMoveDuringEpisode),
    timeToCloseAtStartMs,
    timeToCloseAtEndMs,
    timeToCloseBucket: resolveTimeToCloseBucket(timeToCloseAtStartMs),
    requiresExecutableConfirmation: config.requireExecutableConfirmation,
  };

  episode.episodeClassification = classifyCandidateEpisode(episode, sorted, config);
  return episode;
}

function shouldStartNewEpisode(
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

/** Groups classified bid-only records into lifecycle episodes. */
export function buildBidOnlyCandidateEpisodes(
  runs: readonly LoadedBidOnlyRunInput[],
  config: BidOnlyCandidateLifecycleConfig,
): BidOnlyCandidateEpisode[] {
  const episodes: BidOnlyCandidateEpisode[] = [];

  for (const run of runs) {
    let draft: EpisodeDraft | null = null;
    let episodeIndex = 0;
    let previousRecord: BidOnlyClassifiedRecord | null = null;

    for (const record of run.records) {
      if (shouldStartNewEpisode(previousRecord, record, config.maxGapMs)) {
        if (draft && draft.records.length > 0) {
          episodes.push(finalizeEpisode(draft, episodeIndex, run, config));
          episodeIndex += 1;
        }
        draft = null;
      }

      if (!draft) {
        draft = {
          runId: record.runId,
          marketTicker: record.marketTicker,
          eventTicker: record.eventTicker,
          classificationFamily: record.classificationFamily,
          records: [],
          gapsMs: [],
        };
      }

      if (draft.records.length > 0) {
        const gap = record.receivedAtMs - draft.records[draft.records.length - 1]!.receivedAtMs;
        if (gap > 0) {
          draft.gapsMs.push(gap);
        }
      }

      draft.records.push(record);
      previousRecord = record;
    }

    if (draft && draft.records.length > 0) {
      episodes.push(finalizeEpisode(draft, episodeIndex, run, config));
    }
  }

  return episodes.sort((left, right) => left.startedAt.localeCompare(right.startedAt));
}
