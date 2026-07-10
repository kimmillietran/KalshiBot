import {
  listInputArtifactsUsed,
  listMissingArtifacts,
  readArtifactFreshness,
  readBidOnlyCandidateCount,
  readBidPairWithSizeShare,
  readBidSizeCoverageShare,
  readBufferAdjustedCandidateCount,
  readBtcSpotCoverage,
  readCaptureDays,
  readCaptureDurationHours,
  readCandidateEpisodeMetrics,
  readExecutionConfirmationSupport,
  readMarketCount,
  readMultiDayCoverage,
  readSampleSize,
  readSettlementOutcomeCoverage,
  readTopOfBookRecordCount,
} from "./loadStrategyEvaluationInputs";
import {
  DEFAULT_BID_ONLY_PARITY_EPISODE_THRESHOLDS,
  STRATEGY_EVALUATION_READINESS_CAVEATS,
  STRATEGY_EVALUATION_READINESS_DISCLAIMER,
  type ReadinessDimensionEntry,
  type StrategyEvaluationFamilyEntry,
  type StrategyEvaluationInputPaths,
  type StrategyEvaluationLoadedInputs,
  type StrategyEvaluationReadinessReport,
  type StrategyEvaluationReadinessSummary,
  type StrategyEvaluationReadinessVerdict,
  type StrategyEvaluationRecommendedNextAction,
} from "./strategyEvaluationReadinessTypes";

function hasCaptureData(inputs: StrategyEvaluationLoadedInputs): boolean {
  const runCount = inputs.captureFallback?.runCount ?? 0;
  const topOfBook = readTopOfBookRecordCount(inputs);
  const readiness = inputs.forwardCaptureReadiness?.parsed;
  const aggregates =
    readiness && typeof readiness.aggregates === "object" && readiness.aggregates !== null
      ? readiness.aggregates as Record<string, unknown>
      : null;
  const artifactRunCount =
    typeof aggregates?.runCount === "number" ? aggregates.runCount : 0;

  return runCount > 0 || topOfBook > 0 || artifactRunCount > 0;
}

function buildDimensions(input: {
  inputs: StrategyEvaluationLoadedInputs;
  evaluatedAt: string;
}): ReadinessDimensionEntry[] {
  const thresholds = DEFAULT_BID_ONLY_PARITY_EPISODE_THRESHOLDS;
  const durationHours = readCaptureDurationHours(input.inputs);
  const captureDays = readCaptureDays(input.inputs);
  const marketCount = readMarketCount(input.inputs);
  const topOfBookRecordCount = readTopOfBookRecordCount(input.inputs);
  const btcSpotCoverage = readBtcSpotCoverage(input.inputs);
  const bidSizeCoverage = readBidSizeCoverageShare(input.inputs);
  const bidPairCoverage = readBidPairWithSizeShare(input.inputs);
  const bidOnlyCandidateCount = readBidOnlyCandidateCount(input.inputs);
  const bufferAdjustedCandidateCount = readBufferAdjustedCandidateCount(input.inputs);
  const episodeMetrics = readCandidateEpisodeMetrics(input.inputs);
  const settlement = readSettlementOutcomeCoverage(input.inputs);
  const execution = readExecutionConfirmationSupport(input.inputs);
  const sampleSize = readSampleSize(input.inputs);
  const multiDayCoverage = readMultiDayCoverage(input.inputs);
  const freshness = readArtifactFreshness({
    inputs: input.inputs,
    evaluatedAt: input.evaluatedAt,
    staleAfterHours: thresholds.artifactStaleAfterHours,
  });

  return [
    {
      id: "captureDuration",
      status:
        durationHours >= thresholds.preferredCaptureDurationHours
          ? "met"
          : durationHours >= thresholds.minCaptureDurationHours
            ? "partial"
            : durationHours > 0
              ? "blocked"
              : "blocked",
      value: durationHours,
      threshold: `>= ${thresholds.minCaptureDurationHours}h (preferred ${thresholds.preferredCaptureDurationHours}h+)`,
      rationale: `Total capture duration is ${durationHours.toFixed(2)} hours.`,
    },
    {
      id: "captureDays",
      status:
        captureDays >= thresholds.preferredDistinctDays
          ? "met"
          : captureDays >= thresholds.minDistinctDays
            ? "partial"
            : captureDays > 0
              ? "blocked"
              : "blocked",
      value: captureDays,
      threshold: `>= ${thresholds.minDistinctDays} days (preferred ${thresholds.preferredDistinctDays}+)`,
      rationale: `Distinct capture days: ${captureDays}.`,
    },
    {
      id: "marketCount",
      status:
        marketCount >= thresholds.minMarkets
          ? "met"
          : marketCount > 0
            ? "blocked"
            : "blocked",
      value: marketCount,
      threshold: `>= ${thresholds.minMarkets}`,
      rationale: `Distinct markets observed: ${marketCount}.`,
    },
    {
      id: "topOfBookRecordCount",
      status: topOfBookRecordCount > 0 ? "met" : "blocked",
      value: topOfBookRecordCount,
      threshold: "> 0",
      rationale: `Top-of-book records available: ${topOfBookRecordCount}.`,
    },
    {
      id: "btcSpotCoverage",
      status:
        btcSpotCoverage === null
          ? "unknown"
          : btcSpotCoverage >= 0.5
            ? "partial"
            : "blocked",
      value: btcSpotCoverage,
      threshold: "informational",
      rationale:
        btcSpotCoverage === null
          ? "BTC spot coverage not available from loaded inputs."
          : `BTC spot coverage share: ${Math.round(btcSpotCoverage * 1000) / 10}%.`,
    },
    {
      id: "bidSizeCoverage",
      status:
        bidSizeCoverage === null
          ? "unknown"
          : bidSizeCoverage >= thresholds.minBidPairWithSizeShare
            ? "met"
            : "blocked",
      value: bidSizeCoverage,
      threshold: `>= ${Math.round(thresholds.minBidPairWithSizeShare * 100)}% (top-of-book bid size presence)`,
      rationale:
        bidSizeCoverage === null
          ? "Bid size coverage not available; run bid-size-coverage-audit or recapture with size fields."
          : `Top-of-book bid size coverage share: ${Math.round(bidSizeCoverage * 1000) / 10}%.`,
    },
    {
      id: "bidPairCoverage",
      status:
        bidPairCoverage === null
          ? "unknown"
          : bidPairCoverage >= thresholds.minBidPairWithSizeShare
            ? "met"
            : "blocked",
      value: bidPairCoverage,
      threshold: `>= ${Math.round(thresholds.minBidPairWithSizeShare * 100)}%`,
      rationale:
        bidPairCoverage === null
          ? "Bid-pair-with-size share not available."
          : `Bid-pair-with-size share: ${Math.round(bidPairCoverage * 1000) / 10}%.`,
    },
    {
      id: "bidOnlyCandidateCount",
      status: bidOnlyCandidateCount > 0 ? "met" : "blocked",
      value: bidOnlyCandidateCount,
      threshold: `>= ${thresholds.minBidOnlyCandidates}`,
      rationale: `Bid-only parity candidates (gross + buffer-adjusted): ${bidOnlyCandidateCount}.`,
    },
    {
      id: "bufferAdjustedCandidateCount",
      status:
        bufferAdjustedCandidateCount >= thresholds.minBufferAdjustedEpisodes
          ? "met"
          : bufferAdjustedCandidateCount > 0
            ? "partial"
            : "blocked",
      value: bufferAdjustedCandidateCount,
      threshold: `>= ${thresholds.minBufferAdjustedEpisodes} for exploratory evaluation`,
      rationale: `Buffer-adjusted candidates: ${bufferAdjustedCandidateCount}.`,
    },
    {
      id: "candidateEpisodeCount",
      status:
        episodeMetrics.episodeCount >= thresholds.minCandidateEpisodes
          ? "met"
          : episodeMetrics.episodeCount > 0
            ? "partial"
            : "blocked",
      value: episodeMetrics.episodeCount,
      threshold: `>= ${thresholds.minCandidateEpisodes}`,
      rationale: `Candidate episodes: ${episodeMetrics.episodeCount}.`,
    },
    {
      id: "candidateEpisodeDuration",
      status:
        episodeMetrics.totalEpisodeDurationMs > 0
          ? "partial"
          : "blocked",
      value: episodeMetrics.totalEpisodeDurationMs,
      threshold: "informational",
      rationale: `Total candidate episode duration: ${episodeMetrics.totalEpisodeDurationMs} ms.`,
    },
    {
      id: "settlementOutcomeCoverage",
      status: settlement.available ? "met" : "blocked",
      value: settlement.coverageShare,
      threshold: "required for PnL-like evaluation",
      rationale: settlement.available
        ? `Settlement join available (${settlement.joinedEpisodeCount} episodes with outcomes).`
        : "Settlement/outcome joins are not available in loaded artifacts.",
    },
    {
      id: "executionConfirmationSupport",
      status: execution.supported ? "met" : "blocked",
      value: execution.supported,
      threshold: "required for actionability evaluation",
      rationale: execution.supported
        ? `Executable confirmation support detected (${execution.confirmedCount} confirmed candidates).`
        : "Executable confirmation support is not available; do not treat findings as actionable.",
    },
    {
      id: "sampleSize",
      status: sampleSize >= 100 ? "partial" : sampleSize > 0 ? "partial" : "blocked",
      value: sampleSize,
      threshold: "informational",
      rationale: `Sample size (top-of-book records): ${sampleSize}.`,
    },
    {
      id: "multiDayCoverage",
      status: multiDayCoverage ? "met" : "blocked",
      value: multiDayCoverage,
      threshold: `>= ${thresholds.minDistinctDays} distinct days`,
      rationale: multiDayCoverage
        ? "Multi-day capture coverage present."
        : "Insufficient multi-day coverage.",
    },
    {
      id: "artifactFreshness",
      status:
        freshness.status === "fresh"
          ? "met"
          : freshness.status === "stale"
            ? "partial"
            : "unknown",
      value: freshness.oldestArtifactHours,
      threshold: `artifacts younger than ${thresholds.artifactStaleAfterHours}h`,
      rationale:
        freshness.staleArtifacts.length > 0
          ? `Stale artifacts: ${freshness.staleArtifacts.join(", ")}`
          : freshness.status === "unknown"
            ? "No artifact timestamps available for freshness check."
            : "Loaded artifacts are within freshness window.",
    },
  ];
}

function evaluateBidOnlyParityEpisodeFamily(input: {
  inputs: StrategyEvaluationLoadedInputs;
}): StrategyEvaluationFamilyEntry {
  const thresholds = DEFAULT_BID_ONLY_PARITY_EPISODE_THRESHOLDS;
  const familyId = "bid-only-parity-episode-evaluation" as const;
  const blockingReasons: string[] = [];

  if (!hasCaptureData(input.inputs)) {
    return {
      familyId,
      verdict: "not-ready-no-capture",
      rationale: "No forward capture runs or top-of-book records found.",
      blockingReasons: ["no-capture-data"],
    };
  }

  const durationHours = readCaptureDurationHours(input.inputs);
  const captureDays = readCaptureDays(input.inputs);
  const marketCount = readMarketCount(input.inputs);

  if (
    durationHours < thresholds.minCaptureDurationHours
    || captureDays < thresholds.minDistinctDays
    || marketCount < thresholds.minMarkets
  ) {
    if (durationHours < thresholds.minCaptureDurationHours) {
      blockingReasons.push(
        `capture duration ${durationHours.toFixed(2)}h below ${thresholds.minCaptureDurationHours}h minimum`,
      );
    }
    if (captureDays < thresholds.minDistinctDays) {
      blockingReasons.push(
        `only ${captureDays} capture days; need ${thresholds.minDistinctDays}`,
      );
    }
    if (marketCount < thresholds.minMarkets) {
      blockingReasons.push(
        `only ${marketCount} markets; need ${thresholds.minMarkets}`,
      );
    }

    return {
      familyId,
      verdict: "not-ready-too-short",
      rationale:
        "Capture duration, calendar coverage, or market breadth is below first-pass strategy evaluation thresholds.",
      blockingReasons,
    };
  }

  const bidPairCoverage = readBidPairWithSizeShare(input.inputs);
  if (
    bidPairCoverage === null
    || bidPairCoverage < thresholds.minBidPairWithSizeShare
  ) {
    blockingReasons.push(
      bidPairCoverage === null
        ? "bid-pair-with-size coverage unknown"
        : `bid-pair-with-size share ${Math.round(bidPairCoverage * 1000) / 10}% below ${Math.round(thresholds.minBidPairWithSizeShare * 100)}%`,
    );

    return {
      familyId,
      verdict: "not-ready-size-coverage",
      rationale:
        "Bid-pair-with-size coverage is too low for reliable bid-only parity episode evaluation.",
      blockingReasons,
    };
  }

  const bidOnlyCandidateCount = readBidOnlyCandidateCount(input.inputs);
  if (bidOnlyCandidateCount < thresholds.minBidOnlyCandidates) {
    blockingReasons.push("no bid-only parity candidates in static parity scan");
    return {
      familyId,
      verdict: "not-ready-no-candidates",
      rationale:
        "Static parity scan found no gross or buffer-adjusted bid-only candidates.",
      blockingReasons,
    };
  }

  const episodeMetrics = readCandidateEpisodeMetrics(input.inputs);
  if (episodeMetrics.episodeCount < thresholds.minCandidateEpisodes) {
    blockingReasons.push(
      episodeMetrics.episodeCount === 0
        ? "candidate lifecycle episodes missing"
        : `only ${episodeMetrics.episodeCount} episodes; need ${thresholds.minCandidateEpisodes}`,
    );
    return {
      familyId,
      verdict: "not-ready-no-episodes",
      rationale:
        "Candidate lifecycle episodes are missing or below the minimum episode count.",
      blockingReasons,
    };
  }

  const settlement = readSettlementOutcomeCoverage(input.inputs);
  if (!settlement.available) {
    blockingReasons.push("settlement/outcome joins not available");
    return {
      familyId,
      verdict: "not-ready-no-settlements",
      rationale:
        "Settlement/outcome coverage is required for PnL-like offline strategy evaluation.",
      blockingReasons,
    };
  }

  const execution = readExecutionConfirmationSupport(input.inputs);
  const bufferAdjusted = readBufferAdjustedCandidateCount(input.inputs);

  if (
    execution.requiresConfirmation
    && !execution.supported
    && execution.confirmedCount === 0
  ) {
    if (
      bufferAdjusted >= thresholds.minBufferAdjustedEpisodes
      && episodeMetrics.bufferAdjustedEpisodeCount >= thresholds.minBufferAdjustedEpisodes
    ) {
      return {
        familyId,
        verdict: "ready-for-execution-confirmation-design",
        rationale:
          "Offline evaluation prerequisites are met; design executable confirmation before treating candidates as actionable.",
        blockingReasons: [],
      };
    }

    blockingReasons.push("executable confirmation support not available");
    return {
      familyId,
      verdict: "not-ready-no-executable-confirmation",
      rationale:
        "Executable confirmation is required for actionability evaluation and is not yet supported.",
      blockingReasons,
    };
  }

  if (
    bufferAdjusted >= thresholds.minBufferAdjustedEpisodes
    && episodeMetrics.bufferAdjustedEpisodeCount >= thresholds.minBufferAdjustedEpisodes
  ) {
    return {
      familyId,
      verdict: "ready-for-offline-strategy-evaluation",
      rationale:
        "Capture, size coverage, candidates, episodes, and settlement joins meet conservative offline evaluation thresholds.",
      blockingReasons: [],
    };
  }

  return {
    familyId,
    verdict: "ready-for-descriptive-analysis",
    rationale:
      "Sufficient capture and candidates exist for descriptive bid-only parity analysis; full offline strategy evaluation still needs more buffer-adjusted episodes.",
    blockingReasons: [],
  };
}

function resolveOverallVerdict(
  families: readonly StrategyEvaluationFamilyEntry[],
): StrategyEvaluationReadinessVerdict {
  const primary = families[0];
  return primary?.verdict ?? "not-ready-no-capture";
}

function resolveRecommendedNextAction(input: {
  verdict: StrategyEvaluationReadinessVerdict;
  inputs: StrategyEvaluationLoadedInputs;
  evaluatedAt: string;
}): StrategyEvaluationRecommendedNextAction {
  const freshness = readArtifactFreshness({
    inputs: input.inputs,
    evaluatedAt: input.evaluatedAt,
    staleAfterHours: DEFAULT_BID_ONLY_PARITY_EPISODE_THRESHOLDS.artifactStaleAfterHours,
  });

  if (freshness.status === "stale") {
    return "refresh-stale-artifacts";
  }

  switch (input.verdict) {
    case "not-ready-no-capture":
    case "not-ready-too-short":
      return "run-longer-capture";
    case "not-ready-size-coverage":
      return input.inputs.bidSizeCoverageAudit
        ? "merge-m12.8-and-recapture"
        : "run-bid-size-audit";
    case "not-ready-no-candidates":
      return "run-static-parity-scan";
    case "not-ready-no-episodes":
      return "build-candidate-lifecycle";
    case "not-ready-no-settlements":
      return "join-settlements";
    case "not-ready-no-executable-confirmation":
    case "ready-for-execution-confirmation-design":
      return "design-executable-confirmation";
    case "ready-for-descriptive-analysis":
      return "build-candidate-lifecycle";
    case "ready-for-offline-strategy-evaluation":
      return "design-executable-confirmation";
    default:
      return "continue-capture";
  }
}

function buildSummary(input: {
  inputs: StrategyEvaluationLoadedInputs;
  inputPaths: StrategyEvaluationInputPaths;
  evaluatedAt: string;
  families: readonly StrategyEvaluationFamilyEntry[];
}): StrategyEvaluationReadinessSummary {
  const overallVerdict = resolveOverallVerdict(input.families);
  const missingArtifacts = listMissingArtifacts(input.inputPaths, input.inputs);
  const warnings = [
    ...input.inputs.warnings,
    ...missingArtifacts.map((path) => `Missing artifact: ${path}`),
  ];

  const freshness = readArtifactFreshness({
    inputs: input.inputs,
    evaluatedAt: input.evaluatedAt,
    staleAfterHours: DEFAULT_BID_ONLY_PARITY_EPISODE_THRESHOLDS.artifactStaleAfterHours,
  });
  if (freshness.staleArtifacts.length > 0) {
    warnings.push(
      `Stale artifacts detected: ${freshness.staleArtifacts.join(", ")}`,
    );
  }

  const blockingReasons = input.families.flatMap((family) => family.blockingReasons);

  return {
    overallVerdict,
    recommendedNextAction: resolveRecommendedNextAction({
      verdict: overallVerdict,
      inputs: input.inputs,
      evaluatedAt: input.evaluatedAt,
    }),
    families: input.families,
    blockingReasons,
    warnings,
    inputArtifactsUsed: listInputArtifactsUsed(input.inputs),
    missingArtifacts,
  };
}

/** Evaluates strategy evaluation readiness from loaded inputs. */
export function evaluateStrategyEvaluationReadiness(input: {
  inputs: StrategyEvaluationLoadedInputs;
  inputPaths: StrategyEvaluationInputPaths;
  evaluatedAt: string;
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
}): StrategyEvaluationReadinessReport {
  const families: StrategyEvaluationFamilyEntry[] = [
    evaluateBidOnlyParityEpisodeFamily({ inputs: input.inputs }),
  ];

  const dimensions = buildDimensions({
    inputs: input.inputs,
    evaluatedAt: input.evaluatedAt,
  });

  const summary = buildSummary({
    inputs: input.inputs,
    inputPaths: input.inputPaths,
    evaluatedAt: input.evaluatedAt,
    families,
  });

  return {
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
    disclaimer: STRATEGY_EVALUATION_READINESS_DISCLAIMER,
    caveats: STRATEGY_EVALUATION_READINESS_CAVEATS,
    inputPaths: input.inputPaths,
    thresholds: DEFAULT_BID_ONLY_PARITY_EPISODE_THRESHOLDS,
    dimensions,
    summary,
  };
}
