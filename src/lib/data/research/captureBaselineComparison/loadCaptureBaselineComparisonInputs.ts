import type {
  CaptureBaselineArtifactKey,
  CaptureBaselineComparisonConfig,
  CaptureBaselineComparisonIo,
  CaptureBaselineSnapshot,
} from "./captureBaselineComparisonTypes";
import { hasExecutableBidPairSize } from "@/lib/data/live/forwardQuoteCapture/orderbookLevelSize";
import {
  CaptureBaselineComparisonError,
  DEFAULT_CONFIGURED_BASELINE,
} from "./captureBaselineComparisonTypes";
import {
  isRecord,
  joinPath,
  readNumber,
  readString,
  safeShare,
} from "./captureBaselineComparisonUtils";

export type LoadedCaptureBaselineArtifact = {
  key: CaptureBaselineArtifactKey;
  path: string;
  generatedAt: string | null;
  parsed: Record<string, unknown>;
};

export type DiscoveredCaptureRun = {
  runId: string;
  runDir: string;
  generatedAt: string | null;
};

export type LoadedCaptureBaselineComparisonInputs = {
  artifacts: Partial<Record<CaptureBaselineArtifactKey, LoadedCaptureBaselineArtifact>>;
  runs: DiscoveredCaptureRun[];
  warnings: string[];
  missingArtifacts: CaptureBaselineArtifactKey[];
  corruptArtifacts: string[];
};

type ParseArtifactResult =
  | { ok: true; artifact: LoadedCaptureBaselineArtifact }
  | { ok: false; path: string };

const SELECTED_RUN_AGGREGATE_ARTIFACT_WARNING =
  "selected-run-comparison: aggregate artifact candidate/readiness fields excluded from run verdicts";

function parseArtifact(
  key: CaptureBaselineArtifactKey,
  path: string,
  raw: string,
): ParseArtifactResult {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) {
      return { ok: false, path };
    }

    return {
      ok: true,
      artifact: {
        key,
        path,
        generatedAt: readString(parsed.generatedAt),
        parsed,
      },
    };
  } catch {
    return { ok: false, path };
  }
}

function discoverRuns(
  io: CaptureBaselineComparisonIo,
  forwardQuotesDir: string,
): DiscoveredCaptureRun[] {
  if (!io.fileExists(forwardQuotesDir) || !io.isDirectory(forwardQuotesDir)) {
    return [];
  }

  const runs: DiscoveredCaptureRun[] = [];
  for (const entry of io.readdir(forwardQuotesDir)) {
    const runDir = joinPath(forwardQuotesDir, entry);
    const healthPath = joinPath(runDir, "capture-health.json");
    if (!io.isDirectory(runDir) || !io.fileExists(healthPath)) {
      continue;
    }

    let generatedAt: string | null = null;
    let runId = entry;
    try {
      const health = JSON.parse(io.readFile(healthPath)) as unknown;
      if (isRecord(health)) {
        runId = readString(health.runId) ?? entry;
        generatedAt = readString(health.generatedAt) ?? readString(health.startedAt);
      }
    } catch {
      // keep directory name
    }

    runs.push({ runId, runDir, generatedAt });
  }

  return runs.sort((left, right) => {
    const leftKey = left.generatedAt ?? left.runId;
    const rightKey = right.generatedAt ?? right.runId;
    return rightKey.localeCompare(leftKey);
  });
}

function scanRunTopOfBookMetrics(
  io: CaptureBaselineComparisonIo,
  runDir: string,
): Pick<
  CaptureBaselineSnapshot,
  | "topOfBookCount"
  | "bidPairWithSizeCount"
  | "bidPairWithoutSizeCount"
  | "bidSizeCoverageShare"
  | "validBookShare"
  | "marketCount"
> {
  const topOfBookPath = joinPath(runDir, "top-of-book.jsonl");
  if (!io.fileExists(topOfBookPath)) {
    return {
      topOfBookCount: null,
      bidPairWithSizeCount: null,
      bidPairWithoutSizeCount: null,
      bidSizeCoverageShare: null,
      validBookShare: null,
      marketCount: null,
    };
  }

  let topOfBookCount = 0;
  let validBookCount = 0;
  let bidPairWithSize = 0;
  let bidPairWithoutSize = 0;
  const markets = new Set<string>();

  for (const line of io.readFile(topOfBookPath).split(/\r?\n/)) {
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

    topOfBookCount += 1;
    const marketTicker = readString(record.marketTicker);
    if (marketTicker) {
      markets.add(marketTicker);
    }

    if (record.bookState === "valid") {
      validBookCount += 1;
    }

    const yesBid = readNumber(record.yesBestBidCents);
    const noBid = readNumber(record.noBestBidCents);
    const yesSize = readNumber(record.yesBestBidSize);
    const noSize = readNumber(record.noBestBidSize);

    if (yesBid !== null && noBid !== null) {
      if (hasExecutableBidPairSize(yesSize, noSize)) {
        bidPairWithSize += 1;
      } else {
        bidPairWithoutSize += 1;
      }
    }
  }

  return {
    topOfBookCount,
    bidPairWithSizeCount: bidPairWithSize,
    bidPairWithoutSizeCount: bidPairWithoutSize,
    bidSizeCoverageShare: safeShare(bidPairWithSize, topOfBookCount),
    validBookShare: safeShare(validBookCount, topOfBookCount),
    marketCount: markets.size,
  };
}

function readCaptureHealthSnapshot(
  io: CaptureBaselineComparisonIo,
  run: DiscoveredCaptureRun,
): Partial<CaptureBaselineSnapshot> {
  const healthPath = joinPath(run.runDir, "capture-health.json");
  const topOfBookMetrics = scanRunTopOfBookMetrics(io, run.runDir);

  let captureDurationSeconds: number | null = null;
  let captureHealthVerdict: string | null = null;
  let topOfBookCount = topOfBookMetrics.topOfBookCount;
  let btcSpotCount: number | null = null;
  let marketCount = topOfBookMetrics.marketCount;

  if (io.fileExists(healthPath)) {
    try {
      const health = JSON.parse(io.readFile(healthPath)) as unknown;
      if (isRecord(health)) {
        captureHealthVerdict = readString(health.verdict);
        const config = health.config;
        if (isRecord(config)) {
          const durationSeconds = readNumber(config.durationSeconds);
          const durationMinutes = readNumber(config.durationMinutes);
          captureDurationSeconds =
            durationSeconds ?? (durationMinutes !== null ? durationMinutes * 60 : null);
        }

        const capture = health.capture;
        if (isRecord(capture)) {
          topOfBookCount =
            readNumber(capture.topOfBookRecordCount) ?? topOfBookCount;
        }

        const marketDiscovery = health.marketDiscovery;
        if (isRecord(marketDiscovery)) {
          const subscribed = readNumber(marketDiscovery.marketsSubscribed);
          if (subscribed !== null) {
            marketCount = subscribed;
          }
        }

        const btcSpot = health.btcSpot;
        if (isRecord(btcSpot)) {
          btcSpotCount = readNumber(btcSpot.recordsCaptured);
        }
      }
    } catch {
      // fall through to top-of-book scan
    }
  }

  const btcSpotPath = joinPath(run.runDir, "btc-spot.jsonl");
  if (btcSpotCount === null && io.fileExists(btcSpotPath)) {
    btcSpotCount = io
      .readFile(btcSpotPath)
      .split(/\r?\n/)
      .filter((line) => line.trim()).length;
  }

  return {
    label: `capture run ${run.runId}`,
    source: "capture-run",
    runId: run.runId,
    ...topOfBookMetrics,
    captureDurationSeconds,
    marketCount: marketCount ?? topOfBookMetrics.marketCount,
    topOfBookCount: topOfBookCount ?? topOfBookMetrics.topOfBookCount,
    btcSpotCount,
    captureHealthVerdict,
  };
}

function readNestedRecord(
  root: Record<string, unknown>,
  path: readonly string[],
): Record<string, unknown> | null {
  let current: unknown = root;
  for (const segment of path) {
    if (!isRecord(current)) {
      return null;
    }
    current = current[segment];
  }

  return isRecord(current) ? current : null;
}

function buildArtifactSnapshot(
  artifacts: Partial<Record<CaptureBaselineArtifactKey, LoadedCaptureBaselineArtifact>>,
): Partial<CaptureBaselineSnapshot> {
  const snapshot: Partial<CaptureBaselineSnapshot> = {
    label: "research artifacts",
    source: "research-artifacts",
    runId: null,
  };

  const captureHealth = artifacts.captureHealthAudit?.parsed;
  if (captureHealth) {
    const summary = readNestedRecord(captureHealth, ["summary"]);
    if (summary) {
      snapshot.captureDurationSeconds = readNumber(summary.runDurationSeconds);
      snapshot.marketCount = readNumber(summary.marketsCovered);
      snapshot.topOfBookCount = readNumber(summary.topOfBookCount);
      snapshot.btcSpotCount = readNumber(summary.btcSpotCount);
      snapshot.captureHealthVerdict = readString(summary.verdict);
      const continuity = readNestedRecord(summary, ["continuity"]);
      snapshot.p90TopOfBookGapMs = continuity
        ? readNumber(continuity.p90TopOfBookGapMs)
        : null;
      const bookState = readNestedRecord(summary, ["bookState"]);
      snapshot.validBookShare = bookState ? readNumber(bookState.validBookShare) : null;
      const btcJoin = readNestedRecord(summary, ["btcJoin"]);
      snapshot.btcJoinCoverageShare = btcJoin
        ? readNumber(btcJoin.joinCoverageShare)
        : null;
    }
  }

  const bidSize = artifacts.bidSizeCoverageAudit?.parsed;
  if (bidSize) {
    const summary = readNestedRecord(bidSize, ["summary"]);
    const comparison = readNestedRecord(bidSize, ["comparison"]);
    if (summary) {
      snapshot.bidPairWithSizeCount = readNumber(summary.bidPairWithSizeCount);
      snapshot.bidPairWithoutSizeCount = readNumber(summary.bidPairWithoutSizeCount);
    }
    if (comparison) {
      snapshot.bidSizeCoverageShare =
        readNumber(comparison.bidSizeCoverageShare)
        ?? readNumber(comparison.topOfBookBidSizeCoverageShare);
      snapshot.bidPairWithSizeCount =
        readNumber(comparison.bidPairWithSizeCount) ?? snapshot.bidPairWithSizeCount;
      snapshot.bidPairWithoutSizeCount =
        readNumber(comparison.bidPairWithoutSizeCount) ?? snapshot.bidPairWithoutSizeCount;
    }
  }

  const parity = artifacts.staticParityScan?.parsed;
  if (parity) {
    const metrics = readNestedRecord(parity, ["metrics"]);
    if (metrics) {
      snapshot.validBidOnlySnapshots = readNumber(metrics.validParitySnapshots);
      snapshot.grossCandidates =
        readNumber(metrics.bidOnlyGrossCandidateCount)
        ?? readNumber(metrics.grossParityCandidateCount);
      snapshot.bufferAdjustedCandidates =
        readNumber(metrics.bidOnlyBufferAdjustedCandidateCount)
        ?? readNumber(metrics.bufferAdjustedCandidateCount);
      snapshot.topOfBookCount =
        readNumber(metrics.topOfBookRecordsScanned) ?? snapshot.topOfBookCount;
    }
  }

  const lifecycle = artifacts.bidOnlyCandidateLifecycle?.parsed;
  if (lifecycle) {
    const metrics = readNestedRecord(lifecycle, ["metrics"]);
    if (metrics) {
      snapshot.candidateEpisodes = readNumber(metrics.episodesBuilt);
      snapshot.persistentCandidateEpisodes = readNumber(
        metrics.persistentCandidateEpisodes,
      );
      snapshot.validBidOnlySnapshots =
        readNumber(metrics.recordsScanned) ?? snapshot.validBidOnlySnapshots;
    }
  }

  const strategy = artifacts.strategyEvaluationReadiness?.parsed;
  if (strategy) {
    const summary = readNestedRecord(strategy, ["summary"]);
    if (summary) {
      snapshot.strategyReadinessVerdict = readString(summary.overallVerdict);
    }
  }

  const executable = artifacts.executableConfirmationDesign?.parsed;
  if (executable) {
    const summary = readNestedRecord(executable, ["summary"]);
    if (summary) {
      snapshot.executableConfirmationStatus = readString(summary.confirmationStatus);
    }
  }

  const forward = artifacts.forwardCaptureReadiness?.parsed;
  if (forward) {
    const summary = readNestedRecord(forward, ["summary"]);
    const aggregates = readNestedRecord(forward, ["aggregates"]);
    if (summary) {
      snapshot.forwardCaptureReadinessVerdict = readString(summary.overallVerdict);
    }
    if (aggregates) {
      snapshot.marketCount = readNumber(aggregates.marketCount) ?? snapshot.marketCount;
      snapshot.topOfBookCount =
        readNumber(aggregates.topOfBookRecordCount) ?? snapshot.topOfBookCount;
      snapshot.btcSpotCount = readNumber(aggregates.btcSpotRecordCount) ?? snapshot.btcSpotCount;
      snapshot.validBookShare = readNumber(aggregates.validBookShare) ?? snapshot.validBookShare;
      snapshot.p90TopOfBookGapMs =
        readNumber(aggregates.p90TopOfBookGapMs) ?? snapshot.p90TopOfBookGapMs;
      snapshot.btcJoinCoverageShare =
        readNumber(aggregates.btcSpotCoverageShare) ?? snapshot.btcJoinCoverageShare;
    }
  }

  return snapshot;
}

const AGGREGATE_READINESS_ARTIFACT_KEYS: readonly CaptureBaselineArtifactKey[] = [
  "staticParityScan",
  "bidOnlyCandidateLifecycle",
  "strategyEvaluationReadiness",
  "executableConfirmationDesign",
  "forwardCaptureReadiness",
];

function artifactHasExcludedReadinessSignals(
  key: CaptureBaselineArtifactKey,
  parsed: Record<string, unknown>,
): boolean {
  switch (key) {
    case "staticParityScan": {
      const metrics = readNestedRecord(parsed, ["metrics"]);
      if (!metrics) {
        return false;
      }

      return (
        (readNumber(metrics.bidOnlyGrossCandidateCount)
          ?? readNumber(metrics.grossParityCandidateCount)
          ?? 0) > 0
        || (readNumber(metrics.bidOnlyBufferAdjustedCandidateCount)
          ?? readNumber(metrics.bufferAdjustedCandidateCount)
          ?? 0) > 0
      );
    }
    case "bidOnlyCandidateLifecycle": {
      const metrics = readNestedRecord(parsed, ["metrics"]);
      if (!metrics) {
        return false;
      }

      return (
        (readNumber(metrics.episodesBuilt) ?? 0) > 0
        || (readNumber(metrics.persistentCandidateEpisodes) ?? 0) > 0
      );
    }
    case "strategyEvaluationReadiness": {
      const summary = readNestedRecord(parsed, ["summary"]);
      return summary !== null && readString(summary.overallVerdict) !== null;
    }
    case "executableConfirmationDesign": {
      const summary = readNestedRecord(parsed, ["summary"]);
      return summary !== null && readString(summary.confirmationStatus) !== null;
    }
    case "forwardCaptureReadiness": {
      const summary = readNestedRecord(parsed, ["summary"]);
      return summary !== null && readString(summary.overallVerdict) !== null;
    }
    default:
      return false;
  }
}

function hasAggregateArtifactReadinessSignals(
  artifacts: Partial<Record<CaptureBaselineArtifactKey, LoadedCaptureBaselineArtifact>>,
): boolean {
  return AGGREGATE_READINESS_ARTIFACT_KEYS.some((key) => {
    const artifact = artifacts[key];
    return artifact ? artifactHasExcludedReadinessSignals(key, artifact.parsed) : false;
  });
}

function emptyCaptureBaselineSnapshotFields(): Omit<
  CaptureBaselineSnapshot,
  "label" | "source" | "runId"
> {
  return {
    captureDurationSeconds: null,
    marketCount: null,
    topOfBookCount: null,
    btcSpotCount: null,
    btcJoinCoverageShare: null,
    validBookShare: null,
    p90TopOfBookGapMs: null,
    bidPairWithSizeCount: null,
    bidPairWithoutSizeCount: null,
    bidSizeCoverageShare: null,
    validBidOnlySnapshots: null,
    grossCandidates: null,
    bufferAdjustedCandidates: null,
    candidateEpisodes: null,
    persistentCandidateEpisodes: null,
    strategyReadinessVerdict: null,
    executableConfirmationStatus: null,
    captureHealthVerdict: null,
    forwardCaptureReadinessVerdict: null,
  };
}

function warnWhenAggregateArtifactsExcludedFromSelectedRun(input: {
  artifacts: Partial<Record<CaptureBaselineArtifactKey, LoadedCaptureBaselineArtifact>>;
  warnings?: string[];
}): void {
  if (!hasAggregateArtifactReadinessSignals(input.artifacts)) {
    return;
  }

  input.warnings?.push(SELECTED_RUN_AGGREGATE_ARTIFACT_WARNING);
}

export function validateExplicitRunIds(input: {
  config: CaptureBaselineComparisonConfig;
  runs: readonly DiscoveredCaptureRun[];
}): void {
  if (input.config.baselineRunId) {
    const baselineRun = resolveSelectedRun(input.runs, input.config.baselineRunId, false);
    if (!baselineRun) {
      throw new CaptureBaselineComparisonError(
        `Unknown baseline run id: ${input.config.baselineRunId}`,
      );
    }
  }

  if (input.config.comparisonRunId) {
    const comparisonRun = resolveSelectedRun(input.runs, input.config.comparisonRunId, false);
    if (!comparisonRun) {
      throw new CaptureBaselineComparisonError(
        `Unknown comparison run id: ${input.config.comparisonRunId}`,
      );
    }
  }
}

export function resolveSelectedRun(
  runs: readonly DiscoveredCaptureRun[],
  runId: string | null,
  useLatest: boolean,
): DiscoveredCaptureRun | null {
  if (runId) {
    return runs.find((run) => run.runId === runId) ?? null;
  }

  if (useLatest && runs.length > 0) {
    return runs[0] ?? null;
  }

  return null;
}

export function buildBaselineSnapshot(input: {
  config: CaptureBaselineComparisonConfig;
  artifacts: Partial<Record<CaptureBaselineArtifactKey, LoadedCaptureBaselineArtifact>>;
  runs: readonly DiscoveredCaptureRun[];
  io: CaptureBaselineComparisonIo;
  warnings?: string[];
}): CaptureBaselineSnapshot {
  if (input.config.baselineRunId) {
    const run = resolveSelectedRun(input.runs, input.config.baselineRunId, false);
    if (!run) {
      throw new CaptureBaselineComparisonError(
        `Unknown baseline run id: ${input.config.baselineRunId}`,
      );
    }

    warnWhenAggregateArtifactsExcludedFromSelectedRun({
      artifacts: input.artifacts,
      warnings: input.warnings,
    });

    return {
      ...DEFAULT_CONFIGURED_BASELINE,
      ...emptyCaptureBaselineSnapshotFields(),
      ...readCaptureHealthSnapshot(input.io, run),
      label: `baseline run ${run.runId}`,
      source: "capture-run",
      runId: run.runId,
    };
  }

  if (input.config.useConfiguredBaseline) {
    return { ...DEFAULT_CONFIGURED_BASELINE };
  }

  return {
    ...DEFAULT_CONFIGURED_BASELINE,
    ...buildArtifactSnapshot(input.artifacts),
    label: "artifact-derived baseline",
    source: "research-artifacts",
  };
}

export function buildComparisonSnapshot(input: {
  config: CaptureBaselineComparisonConfig;
  artifacts: Partial<Record<CaptureBaselineArtifactKey, LoadedCaptureBaselineArtifact>>;
  runs: readonly DiscoveredCaptureRun[];
  io: CaptureBaselineComparisonIo;
  warnings?: string[];
}): CaptureBaselineSnapshot {
  const artifactOverlay = buildArtifactSnapshot(input.artifacts);
  const selectedRun = resolveSelectedRun(
    input.runs,
    input.config.comparisonRunId,
    input.config.useLatestComparisonRun,
  );

  if (selectedRun) {
    warnWhenAggregateArtifactsExcludedFromSelectedRun({
      artifacts: input.artifacts,
      warnings: input.warnings,
    });

    return {
      ...emptyCaptureBaselineSnapshotFields(),
      ...readCaptureHealthSnapshot(input.io, selectedRun),
      label: `comparison run ${selectedRun.runId}`,
      source: "capture-run",
      runId: selectedRun.runId,
    };
  }

  return {
    label: "research artifacts",
    source: "research-artifacts",
    runId: null,
    ...emptyCaptureBaselineSnapshotFields(),
    ...artifactOverlay,
  };
}

/** Loads research artifacts and discovers capture runs for baseline comparison. */
export function loadCaptureBaselineComparisonInputs(input: {
  config: CaptureBaselineComparisonConfig;
  io: CaptureBaselineComparisonIo;
}): LoadedCaptureBaselineComparisonInputs {
  const artifacts: Partial<Record<CaptureBaselineArtifactKey, LoadedCaptureBaselineArtifact>> =
    {};
  const warnings: string[] = [];
  const missingArtifacts: CaptureBaselineArtifactKey[] = [];
  const corruptArtifacts: string[] = [];

  for (const [key, path] of Object.entries(input.config.artifacts) as Array<
    [CaptureBaselineArtifactKey, string]
  >) {
    if (!input.io.fileExists(path)) {
      missingArtifacts.push(key);
      continue;
    }

    const parsed = parseArtifact(key, path, input.io.readFile(path));
    if (!parsed.ok) {
      warnings.push(`corrupt-artifact-json: ${path}`);
      corruptArtifacts.push(path);
      missingArtifacts.push(key);
      continue;
    }

    artifacts[key] = parsed.artifact;
  }

  if (missingArtifacts.length > 0) {
    warnings.push(`Missing artifacts: ${missingArtifacts.join(", ")}`);
  }

  const runs = discoverRuns(input.io, input.config.forwardQuotesDir);
  if (runs.length === 0) {
    warnings.push(`No capture runs found under ${input.config.forwardQuotesDir}`);
  }

  return {
    artifacts,
    runs,
    warnings,
    missingArtifacts,
    corruptArtifacts,
  };
}
