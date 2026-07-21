import {
  GLOBAL_CAPTURE_HEALTH_AUDIT_PATH,
  SelectedRunCaptureHealthError,
  validateSelectedRunCaptureDirectory,
} from "../selectedRunCaptureHealth";
import {
  CalibrationFadeForwardValidationError,
  type CalibrationFadeForwardValidationIo,
  type CalibrationFadeSelectedRunQuality,
} from "./calibrationFadeForwardValidationTypes";
import { joinPath, readNumber, readString, resolveSelectedRunId } from "./calibrationFadeForwardValidationUtils";

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

function mapCaptureHealthError(error: unknown): never {
  if (error instanceof SelectedRunCaptureHealthError) {
    throw new CalibrationFadeForwardValidationError(error.message);
  }
  throw error;
}

export function validateSelectedRunDirectory(
  io: CalibrationFadeForwardValidationIo,
  captureRunDir: string,
): string {
  try {
    return validateSelectedRunCaptureDirectory({ io, captureRunDir }).captureRunDir;
  } catch (error) {
    mapCaptureHealthError(error);
  }
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
  let captureRunDir: string;
  let resolvedHealth;
  try {
    const validated = validateSelectedRunCaptureDirectory({ io: input.io, captureRunDir: input.captureRunDir });
    captureRunDir = validated.captureRunDir;
    resolvedHealth = validated.health;
  } catch (error) {
    mapCaptureHealthError(error);
  }

  const runId = resolveSelectedRunId(captureRunDir);
  const warnings = [...resolvedHealth.warnings];
  const healthRunId = resolvedHealth.selectedRunId;

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
    captureHealthSource: resolvedHealth.healthSource,
    runDurationSeconds:
      resolvedHealth.runDurationSeconds
      ?? (reconciliationMatches ? readNumber(durations?.configuredDurationSeconds) : null),
    validBookShare: resolvedHealth.validBookShare,
    btcJoinCoverageShare: resolvedHealth.btcJoinCoverageShare,
    bidSizeCoverageShare: bidSizeMatches
      ? readNumber(bidSizeComparison?.bidSizeCoverageShare)
      : null,
    reconnectCount: resolvedHealth.reconnectCount,
    sequenceGapCount: resolvedHealth.sequenceGapCount,
    suspectedSystemSleepSeconds: reconciliationMatches
      ? readNumber(suspension?.suspectedSystemSleepSeconds)
      : null,
    captureVerdict: resolvedHealth.captureVerdict,
    reconciliationVerdict: reconciliationMatches
      ? readString((reconciliation?.summary as Record<string, unknown> | undefined)?.verdict)
      : null,
    nativeCaptureVerdict: resolvedHealth.nativeCaptureVerdict,
    captureEndReason: resolvedHealth.captureEndReason,
    terminalFailureReason: resolvedHealth.terminalFailureReason,
    completedNormally: resolvedHealth.completedNormally,
    researchReadyVerified: resolvedHealth.researchReadyVerified,
    auditFingerprintsVerified: resolvedHealth.auditFingerprintsVerified,
  };

  return {
    runId,
    selectedRunQuality,
    inputArtifactIdentities: [
      {
        path: resolvedHealth.nativeHealthPath ?? joinPath(captureRunDir, "capture-health.json"),
        selectedRunId: healthRunId,
        present: resolvedHealth.nativeHealthPath !== null,
      },
      {
        path: resolvedHealth.runScopedAuditPath ?? joinPath(captureRunDir, "capture-health-audit.json"),
        matchesSelectedRun:
          resolvedHealth.healthSource === "run-scoped-capture-health-audit"
          || (resolvedHealth.healthSource === "native-capture-health"
            && resolvedHealth.runScopedAuditPath !== null),
        present: resolvedHealth.runScopedAuditPath !== null,
        fingerprintsVerified:
          resolvedHealth.runScopedAuditPath !== null
            ? resolvedHealth.auditFingerprintsVerified
            : null,
      },
      {
        path: resolvedHealth.globalAuditPath ?? GLOBAL_CAPTURE_HEALTH_AUDIT_PATH,
        matchesSelectedRun:
          resolvedHealth.healthSource === "matching-global-capture-health-audit"
          || (resolvedHealth.healthSource === "native-capture-health"
            && resolvedHealth.globalAuditPath !== null),
        present: resolvedHealth.globalAuditPath !== null,
        fingerprintsVerified:
          resolvedHealth.globalAuditPath !== null
            ? resolvedHealth.auditFingerprintsVerified
            : null,
      },
      { path: CAPTURE_HEALTH_RECONCILIATION_PATH, matchesSelectedRun: reconciliationMatches },
      { path: BID_SIZE_COVERAGE_AUDIT_PATH, matchesSelectedRun: bidSizeMatches },
    ],
    warnings,
  };
}
