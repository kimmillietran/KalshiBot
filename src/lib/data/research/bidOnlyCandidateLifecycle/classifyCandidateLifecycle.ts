import type {
  BidOnlyCandidateEpisode,
  BidOnlyCandidateLifecycleConfig,
  BidOnlyClassifiedRecord,
  EpisodeClassification,
} from "./bidOnlyCandidateLifecycleTypes";

function episodeHasClassification(
  records: readonly BidOnlyClassifiedRecord[],
  classification: string,
): boolean {
  return records.some((record) => record.classification === classification);
}

/** Classifies a bid-only candidate episode for offline strategy evaluation readiness. */
export function classifyCandidateEpisode(
  episode: BidOnlyCandidateEpisode,
  records: readonly BidOnlyClassifiedRecord[],
  config: BidOnlyCandidateLifecycleConfig,
): EpisodeClassification {
  if (episode.classificationFamily === "insufficient-depth") {
    return "insufficient-depth";
  }

  if (episode.classificationFamily === "invalid-price" || episode.classificationFamily === "no-signal") {
    return "no-candidate";
  }

  if (episode.durationMs < config.minEpisodeDurationMs) {
    return "too-brief";
  }

  const hasBufferAdjusted = episodeHasClassification(
    records,
    "bid-only-buffer-adjusted-candidate",
  );
  const hasGross = episodeHasClassification(records, "bid-only-gross-candidate");
  const hasWatch = episodeHasClassification(records, "bid-only-watch");

  const isPersistent =
    episode.durationMs >= config.persistentEpisodeDurationMs
    && episode.recordCount >= config.persistentEpisodeMinRecords
    && (hasBufferAdjusted || hasGross);

  if (isPersistent) {
    return "persistent-candidate-episode";
  }

  if (hasBufferAdjusted) {
    return config.requireExecutableConfirmation
      ? "needs-executable-confirmation"
      : "buffer-adjusted-candidate-episode";
  }

  if (hasGross) {
    return config.requireExecutableConfirmation
      ? "needs-executable-confirmation"
      : "gross-candidate-episode";
  }

  if (hasWatch && (episode.maxBidOnlyEdgeCents ?? 0) > 0) {
    return config.requireExecutableConfirmation
      ? "needs-executable-confirmation"
      : "no-candidate";
  }

  return "no-candidate";
}
