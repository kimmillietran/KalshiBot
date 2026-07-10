import {
  createBidOnlyCandidateLifecycleConfig,
  resolveRecommendedNextAction,
} from "./bidOnlyCandidateLifecycleConfig";
import { buildBidOnlyCandidateEpisodes } from "./buildBidOnlyCandidateEpisodes";
import type {
  BidOnlyCandidateLifecycleConfig,
  BidOnlyCandidateLifecycleIo,
  BidOnlyCandidateLifecycleMetrics,
  BidOnlyCandidateLifecycleReport,
  EpisodeClassification,
} from "./bidOnlyCandidateLifecycleTypes";
import {
  BID_ONLY_CANDIDATE_LIFECYCLE_CAVEATS,
  BID_ONLY_CANDIDATE_LIFECYCLE_DISCLAIMER,
  BTC_MOVE_BUCKETS,
  EPISODE_CLASSIFICATIONS,
  TIME_TO_CLOSE_BUCKETS,
} from "./bidOnlyCandidateLifecycleTypes";
import {
  countBidOnlyCandidateRecords,
  loadBidOnlyParityInputs,
} from "./loadBidOnlyParityInputs";
import { median, percentile } from "./bidOnlyCandidateLifecycleUtils";

function createEmptyEpisodesByClassification(): Record<EpisodeClassification, number> {
  return Object.fromEntries(
    EPISODE_CLASSIFICATIONS.map((classification) => [classification, 0]),
  ) as Record<EpisodeClassification, number>;
}

function createBucketCounts<T extends string>(buckets: readonly T[]): Record<T, number> {
  return Object.fromEntries(buckets.map((bucket) => [bucket, 0])) as Record<T, number>;
}

function buildMetrics(input: {
  runs: ReturnType<typeof loadBidOnlyParityInputs>["runs"];
  episodes: ReturnType<typeof buildBidOnlyCandidateEpisodes>;
  warnings: string[];
}): BidOnlyCandidateLifecycleMetrics {
  const markets = new Set<string>();
  let recordsScanned = 0;
  let bidOnlyCandidateRecords = 0;
  let malformedLineCount = 0;

  for (const run of input.runs) {
    for (const record of run.records) {
      markets.add(record.marketTicker);
    }
    recordsScanned += run.records.length;
    bidOnlyCandidateRecords += countBidOnlyCandidateRecords(run.records);
    malformedLineCount += run.malformedLineCount;
  }

  const episodesByClassification = createEmptyEpisodesByClassification();
  for (const episode of input.episodes) {
    episodesByClassification[episode.episodeClassification] += 1;
  }

  const durations = input.episodes.map((episode) => episode.durationMs);
  const edges = input.episodes
    .map((episode) => episode.maxBidOnlyEdgeCents)
    .filter((value): value is number => value !== null);

  const episodesByMarket = new Map<string, number>();
  for (const episode of input.episodes) {
    episodesByMarket.set(
      episode.marketTicker,
      (episodesByMarket.get(episode.marketTicker) ?? 0) + 1,
    );
  }

  const timeToCloseBucketDistribution = createBucketCounts(TIME_TO_CLOSE_BUCKETS);
  const btcMoveBucketDistribution = createBucketCounts(BTC_MOVE_BUCKETS);

  for (const episode of input.episodes) {
    timeToCloseBucketDistribution[episode.timeToCloseBucket] += 1;
    btcMoveBucketDistribution[episode.btcMoveBucket] += 1;
  }

  return {
    runsScanned: input.runs.length,
    marketsScanned: markets.size,
    recordsScanned,
    bidOnlyCandidateRecords,
    episodesBuilt: input.episodes.length,
    episodesByClassification,
    grossCandidateEpisodes: episodesByClassification["gross-candidate-episode"],
    bufferAdjustedCandidateEpisodes:
      episodesByClassification["buffer-adjusted-candidate-episode"],
    persistentCandidateEpisodes: episodesByClassification["persistent-candidate-episode"],
    maxEpisodeDurationMs: durations.length > 0 ? Math.max(...durations) : null,
    medianEpisodeDurationMs: median(durations),
    p95EpisodeDurationMs: percentile(durations, 95),
    maxEdgeCents: edges.length > 0 ? Math.max(...edges) : null,
    medianEdgeCents: median(edges),
    p95EdgeCents: percentile(edges, 95),
    totalCandidateTimeMs: durations.reduce((sum, value) => sum + value, 0),
    marketsWithRepeatedEpisodes: [...episodesByMarket.values()].filter((count) => count > 1)
      .length,
    timeToCloseBucketDistribution,
    btcMoveBucketDistribution,
    malformedLineCount,
    warnings: input.warnings,
  };
}

/** Builds the full bid-only candidate lifecycle report. */
export function buildBidOnlyCandidateLifecycleReport(input: {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  config?: BidOnlyCandidateLifecycleConfig;
  io: BidOnlyCandidateLifecycleIo;
}): BidOnlyCandidateLifecycleReport {
  const config = input.config ?? createBidOnlyCandidateLifecycleConfig();
  const loaded = loadBidOnlyParityInputs({ config, io: input.io });
  const episodes = buildBidOnlyCandidateEpisodes(loaded.runs, config);
  const metrics = buildMetrics({
    runs: loaded.runs,
    episodes,
    warnings: loaded.warnings,
  });

  const enoughForStrategyEvaluation =
    metrics.persistentCandidateEpisodes > 0
    || metrics.bufferAdjustedCandidateEpisodes > 0
    || metrics.grossCandidateEpisodes > 0;

  return {
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
    disclaimer: BID_ONLY_CANDIDATE_LIFECYCLE_DISCLAIMER,
    caveats: [...BID_ONLY_CANDIDATE_LIFECYCLE_CAVEATS],
    config,
    summary: {
      recommendedNextAction: resolveRecommendedNextAction({
        persistentCandidateEpisodes: metrics.persistentCandidateEpisodes,
        bufferAdjustedCandidateEpisodes: metrics.bufferAdjustedCandidateEpisodes,
        grossCandidateEpisodes: metrics.grossCandidateEpisodes,
        episodesBuilt: metrics.episodesBuilt,
        runsScanned: metrics.runsScanned,
      }),
      enoughForStrategyEvaluation,
      requiresExecutableConfirmation: config.requireExecutableConfirmation,
    },
    metrics,
    episodes,
  };
}
