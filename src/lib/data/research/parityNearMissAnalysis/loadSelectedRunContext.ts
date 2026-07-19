import { joinPath, parseIsoTimestampMs } from "../bidOnlyCandidateLifecycle/bidOnlyCandidateLifecycleUtils";
import {
  GLOBAL_CAPTURE_HEALTH_AUDIT_PATH,
  SelectedRunCaptureHealthError,
  validateSelectedRunCaptureDirectory,
} from "../selectedRunCaptureHealth";
import type {
  ParityNearMissAnalysisIo,
  ParityNearMissInputArtifactIdentities,
  ParityNearMissSelectedRunQuality,
} from "./parityNearMissAnalysisTypes";
import { ParityNearMissAnalysisError } from "./parityNearMissAnalysisTypes";

const CAPTURE_HEALTH_RECONCILIATION_PATH =
  "data/research-results/capture-health-reconciliation.json";
const BID_SIZE_COVERAGE_AUDIT_PATH = "data/research-results/bid-size-coverage-audit.json";

function mapCaptureHealthError(error: unknown): never {
  if (error instanceof SelectedRunCaptureHealthError) {
    throw new ParityNearMissAnalysisError(error.message);
  }
  throw error;
}

function readJsonRecord(io: ParityNearMissAnalysisIo, path: string): Record<string, unknown> | null {
  if (!io.fileExists(path)) {
    return null;
  }

  try {
    return JSON.parse(io.readFile(path).replace(/^\uFEFF/, "")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function resolveRunIdFromArtifact(
  artifact: Record<string, unknown> | null,
  summary: Record<string, unknown> | null,
): string | null {
  return (
    readString(artifact?.selectedRunId)
    ?? readString(summary?.selectedRunId)
    ?? readString(artifact?.captureRunDir)?.split("/").pop()
    ?? null
  );
}

function artifactMatchesRun(
  artifact: Record<string, unknown> | null,
  runId: string,
): boolean {
  if (!artifact) {
    return false;
  }

  const summary =
    artifact.summary && typeof artifact.summary === "object"
      ? (artifact.summary as Record<string, unknown>)
      : null;
  const artifactRunId = resolveRunIdFromArtifact(artifact, summary);
  if (artifactRunId === runId) {
    return true;
  }

  const sourceRunIds = artifact.sourceRunIds;
  return Array.isArray(sourceRunIds) && sourceRunIds.includes(runId);
}

function resolveReconciledValidBookShare(
  reconciliation: Record<string, unknown> | null,
): number | null {
  const metrics = reconciliation?.validBookMetrics;
  if (!Array.isArray(metrics)) {
    return null;
  }

  for (const entry of metrics) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const metric = entry as Record<string, unknown>;
    if (metric.metricId === "rawTopOfBookValidShare") {
      return readNumber(metric.value);
    }
  }

  return null;
}

function warnMissingField(
  warnings: string[],
  artifactPath: string,
  runId: string,
  fieldName: string,
  reason: string,
): void {
  warnings.push(
    `selected-run quality field "${fieldName}" unavailable from ${artifactPath} for run ${runId}: ${reason}`,
  );
}

export function resolveSelectedRunId(captureRunDir: string): string {
  return captureRunDir.replaceAll("\\", "/").split("/").pop() ?? captureRunDir;
}

export function validateSelectedRunDirectory(
  io: ParityNearMissAnalysisIo,
  captureRunDir: string,
): string {
  try {
    return validateSelectedRunCaptureDirectory({ io, captureRunDir }).captureRunDir;
  } catch (error) {
    mapCaptureHealthError(error);
  }
}

export function loadSelectedRunContext(input: {
  io: ParityNearMissAnalysisIo;
  captureRunDir: string;
}): {
  runId: string;
  selectedRunQuality: ParityNearMissSelectedRunQuality;
  inputArtifactIdentities: ParityNearMissInputArtifactIdentities;
  marketCloseTimes: Map<string, number | null>;
  warnings: string[];
} {
  let captureRunDir: string;
  let resolvedHealth;
  try {
    const validated = validateSelectedRunCaptureDirectory({ io: input.io, captureRunDir: input.captureRunDir });
    captureRunDir = validated.captureRunDir;
    resolvedHealth = validated.health;
  } catch (error) {
    mapCaptureHealthError(error);
  }

  const warnings = [...resolvedHealth.warnings];
  const healthRunId = resolvedHealth.selectedRunId;

  const reconciliation = readJsonRecord(input.io, CAPTURE_HEALTH_RECONCILIATION_PATH);
  const reconciliationSummary =
    reconciliation?.summary && typeof reconciliation.summary === "object"
      ? (reconciliation.summary as Record<string, unknown>)
      : null;
  const reconciliationMatches = artifactMatchesRun(reconciliation, healthRunId);
  if (reconciliation && !reconciliationMatches) {
    warnings.push(
      `capture-health-reconciliation.json selectedRunId does not match selected run.`,
    );
  }

  const bidSize = readJsonRecord(input.io, BID_SIZE_COVERAGE_AUDIT_PATH);
  const bidSizeComparison =
    bidSize?.comparison && typeof bidSize.comparison === "object"
      ? (bidSize.comparison as Record<string, unknown>)
      : null;
  const bidSizeMatches = artifactMatchesRun(bidSize, healthRunId);
  if (bidSize && !bidSizeMatches) {
    warnings.push(
      `bid-size-coverage-audit.json run identity does not match selected run; ignoring comparison fields.`,
    );
  }

  const durations =
    reconciliation?.durations && typeof reconciliation.durations === "object"
      ? (reconciliation.durations as Record<string, unknown>)
      : null;
  const suspension =
    reconciliation?.suspension && typeof reconciliation.suspension === "object"
      ? (reconciliation.suspension as Record<string, unknown>)
      : null;

  const runDurationSeconds =
    resolvedHealth.runDurationSeconds
    ?? (reconciliationMatches ? readNumber(durations?.configuredDurationSeconds) : null);
  if (runDurationSeconds === null) {
    warnMissingField(
      warnings,
      resolvedHealth.nativeHealthPath ?? joinPath(captureRunDir, "capture-health.json"),
      healthRunId,
      "runDurationSeconds",
      "not present in matching artifacts",
    );
  }

  const validBookShare =
    resolvedHealth.validBookShare
    ?? (reconciliationMatches ? resolveReconciledValidBookShare(reconciliation) : null);
  if (validBookShare === null) {
    warnMissingField(
      warnings,
      resolvedHealth.nativeHealthPath ?? joinPath(captureRunDir, "capture-health.json"),
      healthRunId,
      "validBookShare",
      "could not derive from matching artifacts",
    );
  }

  const btcJoinCoverageShare = resolvedHealth.btcJoinCoverageShare;
  if (btcJoinCoverageShare === null) {
    warnMissingField(
      warnings,
      resolvedHealth.runScopedAuditPath
        ?? resolvedHealth.globalAuditPath
        ?? GLOBAL_CAPTURE_HEALTH_AUDIT_PATH,
      healthRunId,
      "btcJoinCoverageShare",
      "field missing from resolved capture health",
    );
  }

  const bidSizeCoverageShare = bidSizeMatches
    ? (
      readNumber(bidSizeComparison?.bidSizeCoverageShare)
      ?? readNumber(bidSizeComparison?.topOfBookBidSizeCoverageShare)
    )
    : null;
  if (bidSizeCoverageShare === null) {
    warnMissingField(
      warnings,
      BID_SIZE_COVERAGE_AUDIT_PATH,
      healthRunId,
      "bidSizeCoverageShare",
      bidSizeMatches ? "field missing" : "matching audit artifact unavailable",
    );
  }

  const reconnectCount = resolvedHealth.reconnectCount;
  if (reconnectCount === null) {
    warnMissingField(
      warnings,
      resolvedHealth.nativeHealthPath ?? joinPath(captureRunDir, "capture-health.json"),
      healthRunId,
      "reconnectCount",
      "not present in matching artifacts",
    );
  }

  const suspectedSystemSleepSeconds = reconciliationMatches
    ? readNumber(suspension?.suspectedSystemSleepSeconds)
    : null;
  if (suspectedSystemSleepSeconds === null) {
    warnMissingField(
      warnings,
      CAPTURE_HEALTH_RECONCILIATION_PATH,
      healthRunId,
      "suspectedSystemSleepSeconds",
      reconciliationMatches ? "field missing" : "matching reconciliation artifact unavailable",
    );
  }

  const sequenceGapCount = resolvedHealth.sequenceGapCount;
  if (sequenceGapCount === null) {
    warnMissingField(
      warnings,
      resolvedHealth.nativeHealthPath ?? joinPath(captureRunDir, "capture-health.json"),
      healthRunId,
      "sequenceGapCount",
      "not present in matching artifacts",
    );
  }

  const captureVerdict = resolvedHealth.captureVerdict;
  const reconciliationVerdict = reconciliationMatches
    ? readString(reconciliationSummary?.overallVerdict)
    : null;

  const selectedRunQuality: ParityNearMissSelectedRunQuality = {
    selectedRunId: healthRunId,
    captureHealthSource: resolvedHealth.healthSource,
    runDurationSeconds,
    validBookShare,
    btcJoinCoverageShare,
    bidSizeCoverageShare,
    reconnectCount,
    suspectedSystemSleepSeconds,
    sequenceGapCount,
    captureVerdict,
    reconciliationVerdict,
  };

  const marketCloseTimes = new Map<string, number | null>();
  const metadataPath = joinPath(captureRunDir, "market-metadata.jsonl");
  if (input.io.fileExists(metadataPath)) {
    for (const line of input.io.readFile(metadataPath).split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      try {
        const parsed = JSON.parse(trimmed) as { marketTicker?: string; closeTime?: string | null };
        if (typeof parsed.marketTicker === "string") {
          marketCloseTimes.set(
            parsed.marketTicker,
            parsed.closeTime ? parseIsoTimestampMs(parsed.closeTime) : null,
          );
        }
      } catch {
        warnings.push("Skipped malformed market-metadata.jsonl line.");
      }
    }
  }

  return {
    runId: selectedRunQuality.selectedRunId,
    selectedRunQuality,
    inputArtifactIdentities: {
      captureHealthPath: resolvedHealth.nativeHealthPath,
      captureHealthRunId: resolvedHealth.nativeHealthPath ? healthRunId : null,
      captureHealthAuditPath:
        resolvedHealth.runScopedAuditPath
        ?? (input.io.fileExists(GLOBAL_CAPTURE_HEALTH_AUDIT_PATH)
          ? GLOBAL_CAPTURE_HEALTH_AUDIT_PATH
          : null),
      captureHealthReconciliationPath: input.io.fileExists(CAPTURE_HEALTH_RECONCILIATION_PATH)
        ? CAPTURE_HEALTH_RECONCILIATION_PATH
        : null,
      bidSizeCoverageAuditPath: input.io.fileExists(BID_SIZE_COVERAGE_AUDIT_PATH)
        ? BID_SIZE_COVERAGE_AUDIT_PATH
        : null,
    },
    marketCloseTimes,
    warnings,
  };
}

export function loadNearestBtcPrice(
  io: ParityNearMissAnalysisIo,
  captureRunDir: string,
  receivedAtMs: number,
): number | null {
  const path = joinPath(captureRunDir, "btc-spot.jsonl");
  if (!io.fileExists(path)) {
    return null;
  }

  let nearest: { distance: number; price: number } | null = null;
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
      if (timestampMs === null || typeof parsed.priceUsd !== "number") {
        continue;
      }
      const distance = Math.abs(receivedAtMs - timestampMs);
      if (!nearest || distance < nearest.distance) {
        nearest = { distance, price: parsed.priceUsd };
      }
    } catch {
      // skip
    }
  }

  return nearest?.price ?? null;
}
