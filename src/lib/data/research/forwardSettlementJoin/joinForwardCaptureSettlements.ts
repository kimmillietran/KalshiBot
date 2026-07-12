import type {
  CapturedMarketSettlementJoin,
  CapturedMarketSettlementKey,
  CandidateEpisodeSettlementJoin,
  CandidateLifecycleEpisodeInput,
  ForwardSettlementJoinSummary,
  ForwardSettlementJoinVerdict,
  ForwardSettlementRecommendedAction,
  JoinConfidence,
  KnownSettlementRecord,
  SettledOutcome,
  SettlementStatus,
} from "./forwardSettlementJoinTypes";
import type { LoadedSettlementSource } from "./loadForwardSettlementJoinInputs";

function safeShare(numerator: number, denominator: number): number | null {
  if (denominator <= 0) {
    return null;
  }

  return numerator / denominator;
}

function isCloseTimePending(closeTime: string | null, evaluatedAtMs: number): boolean {
  if (!closeTime) {
    return false;
  }

  const closeMs = Date.parse(closeTime);
  return Number.isFinite(closeMs) && closeMs > evaluatedAtMs;
}

function joinMarketRecord(input: {
  market: CapturedMarketSettlementKey;
  settlement: KnownSettlementRecord | undefined;
  importsDirPresent: boolean;
  evaluatedAtMs: number;
}): CapturedMarketSettlementJoin {
  if (input.settlement) {
    return {
      marketTicker: input.market.marketTicker,
      eventTicker: input.settlement.eventTicker ?? input.market.eventTicker,
      seriesTicker: input.settlement.seriesTicker ?? input.market.seriesTicker,
      openTime: input.settlement.openTime ?? input.market.openTime,
      closeTime: input.settlement.closeTime ?? input.market.closeTime,
      settlementStatus: "known",
      settledOutcome: input.settlement.settledOutcome,
      settlementTime: input.settlement.settlementTime,
      sourceArtifact: input.settlement.sourceArtifact,
      joinConfidence: input.settlement.joinConfidence,
      captureRunIds: input.market.captureRunIds,
    };
  }

  if (!input.importsDirPresent) {
    return {
      marketTicker: input.market.marketTicker,
      eventTicker: input.market.eventTicker,
      seriesTicker: input.market.seriesTicker,
      openTime: input.market.openTime,
      closeTime: input.market.closeTime,
      settlementStatus: "missing-source",
      settledOutcome: "unknown",
      settlementTime: null,
      sourceArtifact: null,
      joinConfidence: "none",
      captureRunIds: input.market.captureRunIds,
    };
  }

  const pending = isCloseTimePending(input.market.closeTime, input.evaluatedAtMs);
  return {
    marketTicker: input.market.marketTicker,
    eventTicker: input.market.eventTicker,
    seriesTicker: input.market.seriesTicker,
    openTime: input.market.openTime,
    closeTime: input.market.closeTime,
    settlementStatus: pending ? "pending" : "unknown",
    settledOutcome: "unknown",
    settlementTime: null,
    sourceArtifact: null,
    joinConfidence: "none",
    captureRunIds: input.market.captureRunIds,
  };
}

function joinEpisodeRecord(input: {
  episode: CandidateLifecycleEpisodeInput;
  settlement: KnownSettlementRecord | undefined;
}): CandidateEpisodeSettlementJoin {
  const settledOutcome: SettledOutcome = input.settlement?.settledOutcome ?? "unknown";
  const settlementTime = input.settlement?.settlementTime ?? null;
  const episodeEndMs = Date.parse(input.episode.episodeEnd);
  const settlementMs = settlementTime ? Date.parse(settlementTime) : Number.NaN;

  return {
    episodeId: input.episode.episodeId,
    marketTicker: input.episode.marketTicker,
    episodeStart: input.episode.episodeStart,
    episodeEnd: input.episode.episodeEnd,
    episodeClassification: input.episode.episodeClassification,
    settledOutcome,
    isOutcomeKnown: settledOutcome === "yes" || settledOutcome === "no",
    timeFromEpisodeEndToSettlementMs:
      input.settlement
      && Number.isFinite(episodeEndMs)
      && Number.isFinite(settlementMs)
        ? settlementMs - episodeEndMs
        : null,
    settlementTime,
    joinConfidence: input.settlement?.joinConfidence ?? "none",
  };
}

function classifyVerdict(input: {
  capturedMarketCount: number;
  settlementKnownMarketCount: number;
  candidateEpisodeCount: number;
  settlementKnownEpisodeCount: number;
  importsDirPresent: boolean;
  settlementCoverageShare: number | null;
  episodeSettlementCoverageShare: number | null;
  pendingMarketCount: number;
  marketOnlyJoin?: boolean;
}): {
  overallVerdict: ForwardSettlementJoinVerdict;
  recommendedNextAction: ForwardSettlementRecommendedAction;
} {
  if (input.capturedMarketCount === 0) {
    return {
      overallVerdict: "no-captured-markets",
      recommendedNextAction: "rerun-after-capture",
    };
  }

  if (!input.importsDirPresent) {
    return {
      overallVerdict: "missing-settlement-source",
      recommendedNextAction: "import-settlements",
    };
  }

  if (input.candidateEpisodeCount === 0) {
    if (!input.marketOnlyJoin) {
      return {
        overallVerdict: "no-candidate-episodes",
        recommendedNextAction: "rerun-after-capture",
      };
    }

    if (input.pendingMarketCount > 0 && (input.settlementCoverageShare ?? 0) < 1) {
      return {
        overallVerdict: "stale-or-incomplete-settlements",
        recommendedNextAction: "wait-for-markets-to-settle",
      };
    }

    if ((input.settlementCoverageShare ?? 0) >= 1) {
      return {
        overallVerdict: "settlement-join-ready",
        recommendedNextAction: "build-outcome-study",
      };
    }

    if (input.settlementKnownMarketCount > 0) {
      return {
        overallVerdict: "partial-settlement-coverage",
        recommendedNextAction: "import-settlements",
      };
    }

    return {
      overallVerdict: "stale-or-incomplete-settlements",
      recommendedNextAction: "import-settlements",
    };
  }

  if (input.pendingMarketCount > 0 && (input.settlementCoverageShare ?? 0) < 1) {
    return {
      overallVerdict: "stale-or-incomplete-settlements",
      recommendedNextAction: "wait-for-markets-to-settle",
    };
  }

  const marketReady = (input.settlementCoverageShare ?? 0) >= 0.8;
  const episodeReady = (input.episodeSettlementCoverageShare ?? 0) >= 0.8;

  if (marketReady && episodeReady) {
    return {
      overallVerdict: "settlement-join-ready",
      recommendedNextAction: "build-outcome-study",
    };
  }

  if (input.settlementKnownMarketCount > 0 || input.settlementKnownEpisodeCount > 0) {
    return {
      overallVerdict: "partial-settlement-coverage",
      recommendedNextAction: "import-settlements",
    };
  }

  return {
    overallVerdict: "stale-or-incomplete-settlements",
    recommendedNextAction: "wait-for-markets-to-settle",
  };
}

/** Joins captured markets and candidate episodes to known settlement outcomes. */
export function joinForwardCaptureSettlements(input: {
  markets: readonly CapturedMarketSettlementKey[];
  settlementSource: LoadedSettlementSource;
  episodes: readonly CandidateLifecycleEpisodeInput[];
  evaluatedAt: string;
  inputArtifactsUsed: readonly string[];
  missingArtifacts: readonly string[];
  warnings: readonly string[];
  marketOnlyJoin?: boolean;
}): {
  marketJoins: CapturedMarketSettlementJoin[];
  episodeJoins: CandidateEpisodeSettlementJoin[];
  summary: ForwardSettlementJoinSummary;
} {
  const evaluatedAtMs = Date.parse(input.evaluatedAt);
  const marketJoins = input.markets.map((market) =>
    joinMarketRecord({
      market,
      settlement: input.settlementSource.settlementsByMarket.get(market.marketTicker),
      importsDirPresent: input.settlementSource.importsDirPresent,
      evaluatedAtMs,
    }),
  );

  const episodeJoins = input.episodes.map((episode) =>
    joinEpisodeRecord({
      episode,
      settlement: input.settlementSource.settlementsByMarket.get(episode.marketTicker),
    }),
  );

  const settlementKnownMarketCount = marketJoins.filter(
    (join) => join.settlementStatus === "known",
  ).length;
  const settlementKnownEpisodeCount = episodeJoins.filter((join) => join.isOutcomeKnown).length;
  const pendingMarketCount = marketJoins.filter(
    (join) => join.settlementStatus === "pending",
  ).length;

  const missingSettlementMarkets = marketJoins
    .filter((join) => join.settlementStatus !== "known")
    .map((join) => join.marketTicker);

  const settlementCoverageShare = safeShare(
    settlementKnownMarketCount,
    marketJoins.length,
  );
  const episodeSettlementCoverageShare = safeShare(
    settlementKnownEpisodeCount,
    episodeJoins.length,
  );

  const { overallVerdict, recommendedNextAction } = classifyVerdict({
    capturedMarketCount: marketJoins.length,
    settlementKnownMarketCount,
    candidateEpisodeCount: episodeJoins.length,
    settlementKnownEpisodeCount,
    importsDirPresent: input.settlementSource.importsDirPresent,
    settlementCoverageShare,
    episodeSettlementCoverageShare,
    pendingMarketCount,
    marketOnlyJoin: input.marketOnlyJoin,
  });

  const inputArtifactsUsed = [
    ...new Set([
      ...input.inputArtifactsUsed,
      ...input.settlementSource.sourceArtifacts,
    ]),
  ];

  const warnings = [
    ...input.warnings,
    ...input.settlementSource.warnings,
  ];

  const summary: ForwardSettlementJoinSummary = {
    overallVerdict,
    recommendedNextAction,
    capturedMarketCount: marketJoins.length,
    settlementKnownMarketCount,
    settlementCoverageShare,
    candidateEpisodeCount: episodeJoins.length,
    settlementKnownEpisodeCount,
    episodeSettlementCoverageShare,
    missingSettlementMarkets,
    inputArtifactsUsed,
    missingArtifacts: input.missingArtifacts,
    warnings,
  };

  return {
    marketJoins,
    episodeJoins,
    summary,
  };
}

export function mergeDuplicateSettlementRecords(
  records: readonly KnownSettlementRecord[],
): KnownSettlementRecord | null {
  if (records.length === 0) {
    return null;
  }

  return records.reduce((best, current) => {
    const bestMs = best.settlementTime ? Date.parse(best.settlementTime) : Number.NEGATIVE_INFINITY;
    const currentMs = current.settlementTime
      ? Date.parse(current.settlementTime)
      : Number.NEGATIVE_INFINITY;
    return currentMs >= bestMs ? current : best;
  });
}

export function settlementStatusForJoin(join: CapturedMarketSettlementJoin): SettlementStatus {
  return join.settlementStatus;
}

export function joinConfidenceForOutcome(
  settlement: KnownSettlementRecord | undefined,
): JoinConfidence {
  return settlement?.joinConfidence ?? "none";
}
