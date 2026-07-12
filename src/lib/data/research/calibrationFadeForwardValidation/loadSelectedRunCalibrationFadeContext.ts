import {
  CalibrationFadeForwardValidationError,
  type CalibrationFadeForwardValidationIo,
  type CalibrationFadeSelectedRunQuality,
} from "./calibrationFadeForwardValidationTypes";
import { joinPath, readNumber, readString, resolveSelectedRunId } from "./calibrationFadeForwardValidationUtils";

const CAPTURE_HEALTH_AUDIT_PATH = "data/research-results/capture-health-audit.json";
const CAPTURE_HEALTH_RECONCILIATION_PATH =
  "data/research-results/capture-health-reconciliation.json";
const BID_SIZE_COVERAGE_AUDIT_PATH = "data/research-results/bid-size-coverage-audit.json";

function readJsonRecord(io: CalibrationFadeForwardValidationIo, path: string): Record<string, unknown> | null {
  if (!io.fileExists(path)) {
    return null;
  }
  try {
    return JSON.parse(io.readFile(path).replace(/^\uFEFF/, "")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function artifactMatchesRun(artifact: Record<string, unknown> | null, runId: string): boolean {
  if (!artifact) {
    return false;
  }
  const summary =
    artifact.summary && typeof artifact.summary === "object"
      ? (artifact.summary as Record<string, unknown>)
      : null;
  const artifactRunId =
    readString(artifact.selectedRunId)
    ?? readString(summary?.selectedRunId)
    ?? readString(artifact.captureRunDir)?.split("/").pop()
    ?? null;
  if (artifactRunId === runId) {
    return true;
  }
  const sourceRunIds = artifact.sourceRunIds;
  return Array.isArray(sourceRunIds) && sourceRunIds.includes(runId);
}

export function validateSelectedRunDirectory(
  io: CalibrationFadeForwardValidationIo,
  captureRunDir: string,
): string {
  const normalized = captureRunDir.replace(/\\/g, "/");
  if (!io.isDirectory(normalized)) {
    throw new CalibrationFadeForwardValidationError(`Unknown capture run directory: ${captureRunDir}`);
  }
  for (const required of ["capture-health.json", "top-of-book.jsonl", "btc-spot.jsonl"]) {
    if (!io.fileExists(joinPath(normalized, required))) {
      throw new CalibrationFadeForwardValidationError(`Missing required capture artifact: ${required}`);
    }
  }
  return normalized;
}

export function loadSelectedRunCalibrationFadeContext(input: {
  io: CalibrationFadeForwardValidationIo;
  captureRunDir: string;
}): {
  runId: string;
  selectedRunQuality: CalibrationFadeSelectedRunQuality;
  inputArtifactIdentities: readonly Record<string, unknown>[];
  warnings: string[];
} {
  const captureRunDir = validateSelectedRunDirectory(input.io, input.captureRunDir);
  const runId = resolveSelectedRunId(captureRunDir);
  const warnings: string[] = [];
  const health = readJsonRecord(input.io, joinPath(captureRunDir, "capture-health.json"));
  const healthRunId = readString(health?.runId) ?? runId;

  const audit = readJsonRecord(input.io, CAPTURE_HEALTH_AUDIT_PATH);
  const auditSummary =
    audit?.summary && typeof audit.summary === "object"
      ? (audit.summary as Record<string, unknown>)
      : null;
  const auditMatches = artifactMatchesRun(audit, healthRunId);
  if (audit && !auditMatches) {
    warnings.push("capture-health-audit.json run identity does not match selected run.");
  }

  const reconciliation = readJsonRecord(input.io, CAPTURE_HEALTH_RECONCILIATION_PATH);
  const reconciliationMatches = artifactMatchesRun(reconciliation, healthRunId);
  if (reconciliation && !reconciliationMatches) {
    warnings.push("capture-health-reconciliation.json run identity does not match selected run.");
  }

  const bidSize = readJsonRecord(input.io, BID_SIZE_COVERAGE_AUDIT_PATH);
  const bidSizeComparison =
    bidSize?.comparison && typeof bidSize.comparison === "object"
      ? (bidSize.comparison as Record<string, unknown>)
      : null;
  const bidSizeMatches = artifactMatchesRun(bidSize, healthRunId);
  if (bidSize && !bidSizeMatches) {
    warnings.push("bid-size-coverage-audit.json run identity does not match selected run.");
  }

  const orderbook =
    health?.orderbook && typeof health.orderbook === "object"
      ? (health.orderbook as Record<string, unknown>)
      : null;
  const auditBookState =
    auditSummary?.bookState && typeof auditSummary.bookState === "object"
      ? (auditSummary.bookState as Record<string, unknown>)
      : null;
  const auditBtcJoin =
    auditSummary?.btcJoin && typeof auditSummary.btcJoin === "object"
      ? (auditSummary.btcJoin as Record<string, unknown>)
      : null;
  const durations =
    reconciliation?.durations && typeof reconciliation.durations === "object"
      ? (reconciliation.durations as Record<string, unknown>)
      : null;
  const suspension =
    reconciliation?.suspension && typeof reconciliation.suspension === "object"
      ? (reconciliation.suspension as Record<string, unknown>)
      : null;

  const selectedRunQuality: CalibrationFadeSelectedRunQuality = {
    selectedRunId: healthRunId,
    runDurationSeconds:
      (auditMatches ? readNumber(auditSummary?.runDurationSeconds) : null)
      ?? (reconciliationMatches ? readNumber(durations?.configuredDurationSeconds) : null)
      ?? readNumber((health?.config as Record<string, unknown> | undefined)?.durationSeconds),
    validBookShare: auditMatches ? readNumber(auditBookState?.validBookShare) : null,
    btcJoinCoverageShare: auditMatches ? readNumber(auditBtcJoin?.joinCoverageShare) : null,
    bidSizeCoverageShare: bidSizeMatches
      ? readNumber(bidSizeComparison?.bidSizeCoverageShare)
      : null,
    reconnectCount:
      (auditMatches ? readNumber(auditBookState?.reconnectCount) : null)
      ?? readNumber(orderbook?.reconnectCount),
    sequenceGapCount:
      (auditMatches ? readNumber(auditBookState?.sequenceGapCount) : null)
      ?? readNumber(orderbook?.sequenceGapCount),
    suspectedSystemSleepSeconds: reconciliationMatches
      ? readNumber(suspension?.suspectedSystemSleepSeconds)
      : null,
    captureVerdict: auditMatches ? readString(auditSummary?.verdict) : null,
    reconciliationVerdict: reconciliationMatches
      ? readString((reconciliation?.summary as Record<string, unknown> | undefined)?.verdict)
      : null,
  };

  return {
    runId,
    selectedRunQuality,
    inputArtifactIdentities: [
      { path: joinPath(captureRunDir, "capture-health.json"), selectedRunId: healthRunId },
      { path: CAPTURE_HEALTH_AUDIT_PATH, matchesSelectedRun: auditMatches },
      { path: CAPTURE_HEALTH_RECONCILIATION_PATH, matchesSelectedRun: reconciliationMatches },
      { path: BID_SIZE_COVERAGE_AUDIT_PATH, matchesSelectedRun: bidSizeMatches },
    ],
    warnings,
  };
}
