import {
  loadForwardCaptureRunsWithWarnings,
  loadRun,
} from "@/lib/data/research/forwardCaptureReadiness/loadForwardCaptureRuns";
import { bidPairShare } from "@/lib/data/research/forwardCaptureReadiness/runTopOfBookStats";
import {
  summarizeForwardCaptureRuns,
} from "@/lib/data/research/forwardCaptureReadiness/loadForwardCaptureRuns";
import { safeShare } from "@/lib/data/research/forwardCaptureReadiness/forwardCaptureReadinessMath";

import {
  artifactMatchesSelectedRun,
  isArtifactStale,
  parseArtifactScope,
} from "../downstreamAnalysisScope/downstreamAnalysisScopeUtils";
import { validateInputArtifacts } from "../downstreamAnalysisScope/validateInputArtifacts";
import type {
  LoadedStrategyEvaluationArtifact,
  StrategyEvaluationInputPaths,
  StrategyEvaluationLoadedInputs,
  StrategyEvaluationReadinessIo,
} from "./strategyEvaluationReadinessTypes";
import {
  DEFAULT_BID_ONLY_PARITY_EPISODE_THRESHOLDS,
} from "./strategyEvaluationReadinessTypes";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function parseArtifactJson(
  path: string,
  raw: string,
): LoadedStrategyEvaluationArtifact {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      path,
      generatedAt: null,
      parsed: null,
      malformed: true,
    };
  }

  if (!isRecord(parsed)) {
    return {
      path,
      generatedAt: null,
      parsed: null,
      malformed: true,
    };
  }

  return {
    path,
    generatedAt: readString(parsed.generatedAt),
    parsed,
    malformed: false,
  };
}

function tryLoadArtifact(
  io: StrategyEvaluationReadinessIo,
  path: string,
): LoadedStrategyEvaluationArtifact | null {
  if (!io.fileExists(path)) {
    return null;
  }

  try {
    return parseArtifactJson(path, io.readFile(path));
  } catch {
    return {
      path,
      generatedAt: null,
      parsed: null,
      malformed: true,
    };
  }
}

function excludeInvalidSelectedRunArtifact(input: {
  artifact: LoadedStrategyEvaluationArtifact | null;
  excludedPaths: ReadonlySet<string>;
}): LoadedStrategyEvaluationArtifact | null {
  if (!input.artifact || !input.excludedPaths.has(input.artifact.path)) {
    return input.artifact;
  }

  return {
    ...input.artifact,
    excludedByValidation: true,
  };
}

function readUsableParsedArtifact(
  artifact: LoadedStrategyEvaluationArtifact | null,
): Record<string, unknown> | null {
  if (!artifact?.parsed || artifact.malformed || artifact.excludedByValidation) {
    return null;
  }

  return artifact.parsed;
}

function scanBidPairWithSizeFromCapture(
  io: StrategyEvaluationReadinessIo,
  forwardQuotesDir: string,
  runs?: ReturnType<typeof loadForwardCaptureRunsWithWarnings>["runs"],
): {
  bidPairWithSizeShare: number | null;
  bidSizeCoverageShare: number | null;
} {
  const loadedRuns = runs
    ?? loadForwardCaptureRunsWithWarnings(io, {
      forwardQuotesDir,
      kalshiWsSpikeDir: forwardQuotesDir,
    }).runs;

  if (loadedRuns.length === 0) {
    return { bidPairWithSizeShare: null, bidSizeCoverageShare: null };
  }

  const metrics = summarizeForwardCaptureRuns(loadedRuns);
  const stats = metrics.topOfBookStats;

  let bidPairWithSize = 0;
  let bidPairTotal = 0;
  let bidSizePresent = 0;
  let recordsScanned = 0;

  for (const run of loadedRuns) {
    const topOfBookPath = `${run.sourceRoot}/${run.runId}/top-of-book.jsonl`;
    if (!io.fileExists(topOfBookPath)) {
      continue;
    }

    const lines = io.readFile(topOfBookPath).split(/\r?\n/);
    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }

      let record: unknown;
      try {
        record = JSON.parse(line);
      } catch {
        continue;
      }

      if (!isRecord(record)) {
        continue;
      }

      recordsScanned += 1;
      const yesBid = readNumber(record.yesBestBidCents);
      const noBid = readNumber(record.noBestBidCents);
      const yesSize = readNumber(record.yesBestBidSize);
      const noSize = readNumber(record.noBestBidSize);

      if (yesBid !== null && noBid !== null) {
        bidPairTotal += 1;
        if (
          yesSize !== null
          && noSize !== null
          && yesSize >= 1
          && noSize >= 1
        ) {
          bidPairWithSize += 1;
        }
      }

      if (yesSize !== null || noSize !== null) {
        bidSizePresent += 1;
      }
    }
  }

  if (recordsScanned === 0) {
    return {
      bidPairWithSizeShare: bidPairShare(stats),
      bidSizeCoverageShare: safeShare(bidSizePresent, stats.recordCount),
    };
  }

  return {
    bidPairWithSizeShare: safeShare(bidPairWithSize, bidPairTotal),
    bidSizeCoverageShare: safeShare(bidSizePresent, recordsScanned),
  };
}

function resolveCaptureSourceRoot(captureRunDir: string, forwardQuotesDir: string): string {
  const normalizedCapture = captureRunDir.replace(/\\/g, "/");
  const normalizedForward = forwardQuotesDir.replace(/\\/g, "/");

  if (normalizedCapture.includes(normalizedForward)) {
    return normalizedForward;
  }

  const parts = normalizedCapture.split("/");
  return parts.slice(0, -1).join("/") || normalizedForward;
}

function buildCaptureFallback(
  io: StrategyEvaluationReadinessIo,
  inputPaths: StrategyEvaluationInputPaths,
): StrategyEvaluationLoadedInputs["captureFallback"] {
  const filteredRuns = inputPaths.captureRunDir
    ? (() => {
        const loaded = loadRun(
          io,
          inputPaths.captureRunDir,
          resolveCaptureSourceRoot(inputPaths.captureRunDir, inputPaths.forwardQuotesDir),
        );
        return loaded.run ? [loaded.run] : [];
      })()
    : loadForwardCaptureRunsWithWarnings(io, {
        forwardQuotesDir: inputPaths.forwardQuotesDir,
        kalshiWsSpikeDir: inputPaths.forwardQuotesDir,
      }).runs;

  if (filteredRuns.length === 0) {
    return null;
  }

  const metrics = summarizeForwardCaptureRuns(filteredRuns);
  const stats = metrics.topOfBookStats;
  const totalDurationMinutes = filteredRuns.reduce((sum, run) => {
    const durationSeconds =
      run.health.config?.durationSeconds
      ?? (run.health.config?.durationMinutes ?? 0) * 60;
    return sum + durationSeconds / 60;
  }, 0);

  const captureDirForSizeScan = inputPaths.captureRunDir ?? inputPaths.forwardQuotesDir;
  const sizeShares = scanBidPairWithSizeFromCapture(io, captureDirForSizeScan, filteredRuns);

  return {
    runCount: filteredRuns.length,
    totalDurationMinutes,
    daysCovered: metrics.calendarDays.size,
    marketCount: stats.marketTickers.size,
    topOfBookRecordCount: stats.recordCount,
    btcSpotCoverageShare: safeShare(
      metrics.btcSpotRecordCount,
      Math.max(stats.recordCount, 1),
    ),
    bidPairWithSizeShare: sizeShares.bidPairWithSizeShare,
    bidSizeCoverageShare: sizeShares.bidSizeCoverageShare,
  };
}

/** Loads optional research artifacts and capture fallback inputs. */
export function loadStrategyEvaluationInputs(input: {
  io: StrategyEvaluationReadinessIo;
  inputPaths: StrategyEvaluationInputPaths;
  evaluatedAt: string;
}): StrategyEvaluationLoadedInputs {
  const warnings: string[] = [];
  const { io, inputPaths } = input;
  const selection = {
    analysisScope: inputPaths.captureRunDir ? "selected-run" as const : "aggregate" as const,
    forwardQuotesDir: inputPaths.forwardQuotesDir,
    captureRunDir: inputPaths.captureRunDir,
    selectedRunId: inputPaths.captureRunDir
      ? inputPaths.captureRunDir.split("/").pop() ?? null
      : null,
  };

  const forwardCaptureReadiness = tryLoadArtifact(
    io,
    inputPaths.artifacts.forwardCaptureReadiness,
  );
  const staticParityScan = tryLoadArtifact(
    io,
    inputPaths.artifacts.staticParityScan,
  );
  const bidSizeCoverageAudit = tryLoadArtifact(
    io,
    inputPaths.artifacts.bidSizeCoverageAudit,
  );
  const bidOnlyCandidateLifecycle = tryLoadArtifact(
    io,
    inputPaths.artifacts.bidOnlyCandidateLifecycle,
  );
  const captureQualityValidation = tryLoadArtifact(
    io,
    inputPaths.artifacts.captureQualityValidation,
  );
  const validBookCoverageInvestigation = tryLoadArtifact(
    io,
    inputPaths.artifacts.validBookCoverageInvestigation,
  );

  const malformedArtifacts = [
    forwardCaptureReadiness,
    staticParityScan,
    bidSizeCoverageAudit,
    bidOnlyCandidateLifecycle,
    captureQualityValidation,
    validBookCoverageInvestigation,
  ]
    .filter((artifact): artifact is LoadedStrategyEvaluationArtifact =>
      artifact !== null && artifact.malformed,
    )
    .map((artifact) => artifact.path);

  if (malformedArtifacts.length > 0) {
    warnings.push(`Malformed artifacts: ${malformedArtifacts.join(", ")}`);
  }

  const artifactValidation = selection.analysisScope === "selected-run"
    ? validateInputArtifacts({
      io: {
        readFile: io.readFile,
        fileExists: io.fileExists,
      },
      selection,
      artifactPaths: [
        inputPaths.artifacts.forwardCaptureReadiness,
        inputPaths.artifacts.staticParityScan,
        inputPaths.artifacts.bidOnlyCandidateLifecycle,
        inputPaths.artifacts.bidSizeCoverageAudit,
        inputPaths.artifacts.captureQualityValidation,
        inputPaths.artifacts.validBookCoverageInvestigation,
      ].filter((path) => io.fileExists(path)),
      evaluatedAt: input.evaluatedAt,
      staleAfterHours: DEFAULT_BID_ONLY_PARITY_EPISODE_THRESHOLDS.artifactStaleAfterHours,
      requireIdentityInSelectedRun: true,
    })
    : {
      identities: [],
      mismatchedArtifacts: [] as string[],
      malformedArtifacts,
      missingArtifacts: [] as string[],
      warnings: [] as string[],
      staleArtifacts: [] as string[],
      usablePaths: [] as string[],
    };

  if (artifactValidation.mismatchedArtifacts.length > 0) {
    warnings.push(
      `Artifact scope mismatch in selected-run mode: ${artifactValidation.mismatchedArtifacts.join(", ")}`,
    );
  }

  const selectedRunValidatedArtifactPaths = selection.analysisScope === "selected-run"
    ? [
      inputPaths.artifacts.forwardCaptureReadiness,
      inputPaths.artifacts.staticParityScan,
      inputPaths.artifacts.bidOnlyCandidateLifecycle,
      inputPaths.artifacts.bidSizeCoverageAudit,
      inputPaths.artifacts.captureQualityValidation,
      inputPaths.artifacts.validBookCoverageInvestigation,
    ].filter((path) => io.fileExists(path))
    : [];
  const usableArtifactPaths = new Set(artifactValidation.usablePaths);
  const excludedArtifactPaths = new Set(
    selectedRunValidatedArtifactPaths.filter((path) => !usableArtifactPaths.has(path)),
  );

  if (excludedArtifactPaths.size > 0) {
    warnings.push(
      `Excluded invalid selected-run artifacts from readiness metrics: ${[
        ...excludedArtifactPaths,
      ].join(", ")}`,
    );
  }

  if (!forwardCaptureReadiness && !staticParityScan) {
    warnings.push(
      "No forward-capture-readiness or static-parity-scan artifact; using capture directory fallback when available.",
    );
  }

  const captureFallback = buildCaptureFallback(io, inputPaths);

  return {
    forwardCaptureReadiness: excludeInvalidSelectedRunArtifact({
      artifact: forwardCaptureReadiness,
      excludedPaths: excludedArtifactPaths,
    }),
    staticParityScan: excludeInvalidSelectedRunArtifact({
      artifact: staticParityScan,
      excludedPaths: excludedArtifactPaths,
    }),
    bidSizeCoverageAudit: excludeInvalidSelectedRunArtifact({
      artifact: bidSizeCoverageAudit,
      excludedPaths: excludedArtifactPaths,
    }),
    bidOnlyCandidateLifecycle: excludeInvalidSelectedRunArtifact({
      artifact: bidOnlyCandidateLifecycle,
      excludedPaths: excludedArtifactPaths,
    }),
    captureQualityValidation: excludeInvalidSelectedRunArtifact({
      artifact: captureQualityValidation,
      excludedPaths: excludedArtifactPaths,
    }),
    validBookCoverageInvestigation: excludeInvalidSelectedRunArtifact({
      artifact: validBookCoverageInvestigation,
      excludedPaths: excludedArtifactPaths,
    }),
    captureFallback,
    selection,
    artifactValidation,
    warnings,
  };
}

export function readBidPairWithSizeShare(
  inputs: StrategyEvaluationLoadedInputs,
): number | null {
  const audit = readUsableParsedArtifact(inputs.bidSizeCoverageAudit);
  if (audit) {
    const comparison = isRecord(audit.comparison) ? audit.comparison : null;
    const summary = isRecord(audit.summary) ? audit.summary : null;
    const withSize =
      readNumber(comparison?.bidPairWithSizeCount)
      ?? readNumber(summary?.bidPairWithSizeCount);
    const withoutSize =
      readNumber(comparison?.bidPairWithoutSizeCount)
      ?? readNumber(summary?.bidPairWithoutSizeCount);

    if (withSize !== null && withoutSize !== null) {
      return safeShare(withSize, withSize + withoutSize);
    }

    const directShare =
      readNumber(comparison?.bidSizeCoverageShare)
      ?? readNumber(summary?.bidSizeCoverageShare);
    if (directShare !== null) {
      return directShare;
    }
  }

  return inputs.captureFallback?.bidPairWithSizeShare ?? null;
}

export function readBidSizeCoverageShare(
  inputs: StrategyEvaluationLoadedInputs,
): number | null {
  const audit = readUsableParsedArtifact(inputs.bidSizeCoverageAudit);
  if (audit) {
    const comparison = isRecord(audit.comparison) ? audit.comparison : null;
    const share =
      readNumber(comparison?.topOfBookBidSizeCoverageShare)
      ?? readNumber(comparison?.bidSizeCoverageShare);
    if (share !== null) {
      return share;
    }
  }

  return inputs.captureFallback?.bidSizeCoverageShare ?? null;
}

export function readCaptureDurationHours(
  inputs: StrategyEvaluationLoadedInputs,
): number {
  const readiness = readUsableParsedArtifact(inputs.forwardCaptureReadiness);
  const aggregates = readiness && isRecord(readiness.aggregates)
    ? readiness.aggregates
    : null;
  const minutes = readNumber(aggregates?.totalDurationMinutes);
  if (minutes !== null) {
    return minutes / 60;
  }

  return (inputs.captureFallback?.totalDurationMinutes ?? 0) / 60;
}

export function readCaptureDays(
  inputs: StrategyEvaluationLoadedInputs,
): number {
  const readiness = readUsableParsedArtifact(inputs.forwardCaptureReadiness);
  const aggregates = readiness && isRecord(readiness.aggregates)
    ? readiness.aggregates
    : null;
  const days = readNumber(aggregates?.daysCovered);
  if (days !== null) {
    return days;
  }

  return inputs.captureFallback?.daysCovered ?? 0;
}

export function readMarketCount(
  inputs: StrategyEvaluationLoadedInputs,
): number {
  const readiness = readUsableParsedArtifact(inputs.forwardCaptureReadiness);
  const aggregates = readiness && isRecord(readiness.aggregates)
    ? readiness.aggregates
    : null;
  const markets = readNumber(aggregates?.marketCount);
  if (markets !== null) {
    return markets;
  }

  const parityScan = readUsableParsedArtifact(inputs.staticParityScan);
  const parityMetrics = parityScan && isRecord(parityScan.metrics)
    ? parityScan.metrics
    : null;
  const involved = parityMetrics?.marketsInvolved;
  if (Array.isArray(involved)) {
    return involved.filter((value) => typeof value === "string").length;
  }

  return inputs.captureFallback?.marketCount ?? 0;
}

export function readTopOfBookRecordCount(
  inputs: StrategyEvaluationLoadedInputs,
): number {
  const readiness = readUsableParsedArtifact(inputs.forwardCaptureReadiness);
  const aggregates = readiness && isRecord(readiness.aggregates)
    ? readiness.aggregates
    : null;
  const count = readNumber(aggregates?.topOfBookRecordCount);
  if (count !== null) {
    return count;
  }

  const parityScan = readUsableParsedArtifact(inputs.staticParityScan);
  const parityMetrics = parityScan && isRecord(parityScan.metrics)
    ? parityScan.metrics
    : null;
  const scanned = readNumber(parityMetrics?.topOfBookRecordsScanned);
  if (scanned !== null) {
    return scanned;
  }

  return inputs.captureFallback?.topOfBookRecordCount ?? 0;
}

export function readBtcSpotCoverage(
  inputs: StrategyEvaluationLoadedInputs,
): number | null {
  const readiness = readUsableParsedArtifact(inputs.forwardCaptureReadiness);
  const aggregates = readiness && isRecord(readiness.aggregates)
    ? readiness.aggregates
    : null;
  const share = readNumber(aggregates?.btcSpotCoverageShare);
  if (share !== null) {
    return share;
  }

  return inputs.captureFallback?.btcSpotCoverageShare ?? null;
}

export function readBidOnlyCandidateCount(
  inputs: StrategyEvaluationLoadedInputs,
): number {
  const parityScan = readUsableParsedArtifact(inputs.staticParityScan);
  const metrics = parityScan && isRecord(parityScan.metrics)
    ? parityScan.metrics
    : null;
  if (!metrics) {
    return 0;
  }

  const gross = readNumber(metrics.bidOnlyGrossCandidateCount) ?? 0;
  const buffer = readNumber(metrics.bidOnlyBufferAdjustedCandidateCount) ?? 0;
  const legacyGross = readNumber(metrics.grossParityCandidateCount) ?? 0;
  const legacyBuffer = readNumber(metrics.bufferAdjustedCandidateCount) ?? 0;

  return gross + buffer + legacyGross + legacyBuffer;
}

export function readBufferAdjustedCandidateCount(
  inputs: StrategyEvaluationLoadedInputs,
): number {
  const parityScan = readUsableParsedArtifact(inputs.staticParityScan);
  const metrics = parityScan && isRecord(parityScan.metrics)
    ? parityScan.metrics
    : null;
  if (!metrics) {
    return 0;
  }

  return (
    (readNumber(metrics.bidOnlyBufferAdjustedCandidateCount) ?? 0)
    + (readNumber(metrics.bufferAdjustedCandidateCount) ?? 0)
  );
}

export function readCandidateEpisodeMetrics(inputs: StrategyEvaluationLoadedInputs): {
  episodeCount: number;
  bufferAdjustedEpisodeCount: number;
  totalEpisodeDurationMs: number;
} {
  const lifecycle = readUsableParsedArtifact(inputs.bidOnlyCandidateLifecycle);
  if (!lifecycle) {
    return {
      episodeCount: 0,
      bufferAdjustedEpisodeCount: 0,
      totalEpisodeDurationMs: 0,
    };
  }

  const metrics = isRecord(lifecycle.metrics) ? lifecycle.metrics : null;
  const summary = isRecord(lifecycle.summary) ? lifecycle.summary : null;
  const episodes = Array.isArray(lifecycle.episodes) ? lifecycle.episodes : null;

  const episodeCount =
    readNumber(metrics?.episodesBuilt)
    ?? readNumber(metrics?.episodeCount)
    ?? readNumber(metrics?.candidateEpisodeCount)
    ?? readNumber(summary?.episodeCount)
    ?? readNumber(summary?.candidateEpisodeCount)
    ?? episodes?.length
    ?? 0;

  const bufferAdjustedEpisodeCount =
    readNumber(metrics?.bufferAdjustedCandidateEpisodes)
    ?? readNumber(metrics?.bufferAdjustedEpisodeCount)
    ?? readNumber(summary?.bufferAdjustedEpisodeCount)
    ?? 0;

  const totalEpisodeDurationMs =
    readNumber(metrics?.totalCandidateTimeMs)
    ?? readNumber(metrics?.totalEpisodeDurationMs)
    ?? readNumber(summary?.totalEpisodeDurationMs)
    ?? 0;

  return {
    episodeCount,
    bufferAdjustedEpisodeCount,
    totalEpisodeDurationMs,
  };
}

export function readSettlementOutcomeCoverage(
  inputs: StrategyEvaluationLoadedInputs,
): {
  available: boolean;
  coverageShare: number | null;
  joinedEpisodeCount: number;
} {
  const lifecycle = readUsableParsedArtifact(inputs.bidOnlyCandidateLifecycle);
  if (lifecycle) {
    const settlementJoin = isRecord(lifecycle.settlementJoin)
      ? lifecycle.settlementJoin
      : isRecord(lifecycle.settlementOutcome)
        ? lifecycle.settlementOutcome
        : null;

    if (settlementJoin) {
      const joined =
        readNumber(settlementJoin.joinedEpisodeCount)
        ?? readNumber(settlementJoin.episodesWithOutcome)
        ?? 0;
      const share =
        readNumber(settlementJoin.coverageShare)
        ?? readNumber(settlementJoin.outcomeCoverageShare);

      return {
        available: joined > 0 || (share !== null && share > 0),
        coverageShare: share,
        joinedEpisodeCount: joined,
      };
    }
  }

  return {
    available: false,
    coverageShare: null,
    joinedEpisodeCount: 0,
  };
}

export function readExecutionConfirmationSupport(
  inputs: StrategyEvaluationLoadedInputs,
): {
  supported: boolean;
  confirmedCount: number;
  requiresConfirmation: boolean;
} {
  const scan = readUsableParsedArtifact(inputs.staticParityScan);
  if (!scan) {
    return {
      supported: false,
      confirmedCount: 0,
      requiresConfirmation: true,
    };
  }

  const friction = isRecord(scan.friction) ? scan.friction : null;
  const metrics = isRecord(scan.metrics) ? scan.metrics : null;
  const summary = isRecord(scan.summary) ? scan.summary : null;

  const confirmedCount = readNumber(metrics?.executableConfirmedCandidateCount) ?? 0;
  const requiresConfirmation =
    friction?.requireExecutableConfirmation === true
    || summary?.requiresExecutableConfirmation === true;

  const explicitSupport = readString(
    isRecord(scan.executionConfirmation) ? scan.executionConfirmation.supportLevel : null,
  );

  const supported =
    explicitSupport === "available"
    || confirmedCount > 0
    || (isRecord(scan.executionConfirmation)
      && scan.executionConfirmation.infrastructureReady === true);

  return {
    supported,
    confirmedCount,
    requiresConfirmation,
  };
}

export function readSampleSize(inputs: StrategyEvaluationLoadedInputs): number {
  return readTopOfBookRecordCount(inputs);
}

export function readMultiDayCoverage(inputs: StrategyEvaluationLoadedInputs): boolean {
  return readCaptureDays(inputs) >= 2;
}

export function readArtifactFreshness(input: {
  inputs: StrategyEvaluationLoadedInputs;
  evaluatedAt: string;
  staleAfterHours: number;
}): {
  status: "fresh" | "stale" | "unknown";
  oldestArtifactHours: number | null;
  staleArtifacts: string[];
  mismatchedArtifacts: string[];
  malformedArtifacts: string[];
} {
  const evaluatedAtMs = Date.parse(input.evaluatedAt);
  const staleArtifacts: string[] = [];
  const mismatchedArtifacts: string[] = [];
  const malformedArtifacts: string[] = [];
  let oldestMs: number | null = null;

  const artifacts = [
    input.inputs.forwardCaptureReadiness,
    input.inputs.staticParityScan,
    input.inputs.bidSizeCoverageAudit,
    input.inputs.bidOnlyCandidateLifecycle,
    input.inputs.captureQualityValidation,
    input.inputs.validBookCoverageInvestigation,
  ];

  for (const artifact of artifacts) {
    if (!artifact) {
      continue;
    }

    if (artifact.malformed) {
      malformedArtifacts.push(artifact.path);
      continue;
    }

    if (
      input.inputs.selection.analysisScope === "selected-run"
      && input.inputs.selection.selectedRunId
      && artifact.parsed
    ) {
      const scope = parseArtifactScope(artifact.parsed);
      if (
        scope.analysisScope === "aggregate"
        || (scope.sourceRunIds.length > 0
          && !artifactMatchesSelectedRun(scope, input.inputs.selection.selectedRunId))
      ) {
        mismatchedArtifacts.push(artifact.path);
      }
    }

    if (!artifact.generatedAt) {
      continue;
    }

    const generatedMs = Date.parse(artifact.generatedAt);
    if (!Number.isFinite(generatedMs)) {
      continue;
    }

    if (oldestMs === null || generatedMs < oldestMs) {
      oldestMs = generatedMs;
    }

    if (isArtifactStale(artifact.generatedAt, input.evaluatedAt, input.staleAfterHours)) {
      staleArtifacts.push(artifact.path);
    }
  }

  if (oldestMs === null) {
    return {
      status: "unknown",
      oldestArtifactHours: null,
      staleArtifacts,
      mismatchedArtifacts,
      malformedArtifacts,
    };
  }

  const oldestArtifactHours = (evaluatedAtMs - oldestMs) / (1000 * 60 * 60);
  return {
    status: staleArtifacts.length > 0 ? "stale" : "fresh",
    oldestArtifactHours,
    staleArtifacts,
    mismatchedArtifacts,
    malformedArtifacts,
  };
}

export function listInputArtifactsUsed(
  inputs: StrategyEvaluationLoadedInputs,
): string[] {
  return [
    inputs.forwardCaptureReadiness,
    inputs.staticParityScan,
    inputs.bidSizeCoverageAudit,
    inputs.bidOnlyCandidateLifecycle,
    inputs.captureQualityValidation,
    inputs.validBookCoverageInvestigation,
  ]
    .filter((artifact): artifact is LoadedStrategyEvaluationArtifact =>
      artifact !== null && !artifact.malformed && !artifact.excludedByValidation,
    )
    .map((artifact) => artifact.path);
}

export function listMissingArtifacts(
  inputPaths: StrategyEvaluationInputPaths,
  inputs: StrategyEvaluationLoadedInputs,
): string[] {
  const entries: Array<[string, LoadedStrategyEvaluationArtifact | null]> = [
    [inputPaths.artifacts.forwardCaptureReadiness, inputs.forwardCaptureReadiness],
    [inputPaths.artifacts.staticParityScan, inputs.staticParityScan],
    [inputPaths.artifacts.bidSizeCoverageAudit, inputs.bidSizeCoverageAudit],
    [inputPaths.artifacts.bidOnlyCandidateLifecycle, inputs.bidOnlyCandidateLifecycle],
    [inputPaths.artifacts.captureQualityValidation, inputs.captureQualityValidation],
    [
      inputPaths.artifacts.validBookCoverageInvestigation,
      inputs.validBookCoverageInvestigation,
    ],
  ];

  return entries
    .filter(([, artifact]) => artifact === null)
    .map(([path]) => path);
}
