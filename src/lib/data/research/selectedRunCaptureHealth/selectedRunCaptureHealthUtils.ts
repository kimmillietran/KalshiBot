import {
  CAPTURE_HEALTH_AUDIT_FILENAME,
  CAPTURE_READINESS_VERDICTS,
} from "../captureHealthAudit/captureHealthAuditTypes";
import type { CaptureHealthAuditReport } from "../captureHealthAudit/captureHealthAuditTypes";

import {
  RESEARCH_READY_CAPTURE_VERDICT,
  SelectedRunCaptureHealthError,
  type SelectedRunCaptureHealthIo,
} from "./selectedRunCaptureHealthTypes";

export function joinCapturePath(captureRunDir: string, filename: string): string {
  return `${normalizeCapturePath(captureRunDir)}/${filename}`;
}

export function normalizeCapturePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/$/, "");
}

export function resolveSelectedRunId(captureRunDir: string): string {
  const normalized = normalizeCapturePath(captureRunDir);
  const parts = normalized.split("/");
  return parts[parts.length - 1] ?? captureRunDir;
}

export function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export function readJsonRecord(
  readFile: (path: string) => string,
  fileExists: (path: string) => boolean,
  path: string,
): Record<string, unknown> | null {
  if (!fileExists(path)) {
    return null;
  }
  try {
    const parsed = JSON.parse(readFile(path).replace(/^\uFEFF/, "")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new SelectedRunCaptureHealthError(`Malformed JSON object at ${path}`);
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof SelectedRunCaptureHealthError) {
      throw error;
    }
    throw new SelectedRunCaptureHealthError(`Malformed JSON at ${path}`);
  }
}

/** Loose identity helper for optional secondary artifacts (reconciliation / bid-size). */
export function artifactMatchesRun(
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

/**
 * Strict identity for capture-health audits used as selected-run health sources.
 * Requires exact selectedRunId, singleton sourceRunIds, and captureRunDir basename match.
 */
export function captureHealthAuditMatchesSelectedRun(
  artifact: Record<string, unknown> | null,
  selectedRunId: string,
  selectedCaptureRunDir: string,
): boolean {
  if (!artifact) {
    return false;
  }

  const artifactSelectedRunId = readString(artifact.selectedRunId);
  if (artifactSelectedRunId !== selectedRunId) {
    return false;
  }

  const sourceRunIds = artifact.sourceRunIds;
  if (
    !Array.isArray(sourceRunIds)
    || sourceRunIds.length !== 1
    || sourceRunIds[0] !== selectedRunId
  ) {
    return false;
  }

  const artifactCaptureRunDir = readString(artifact.captureRunDir);
  if (!artifactCaptureRunDir) {
    return false;
  }

  if (resolveSelectedRunId(artifactCaptureRunDir) !== selectedRunId) {
    return false;
  }

  const normalizedSelected = normalizeCapturePath(selectedCaptureRunDir);
  const normalizedArtifact = normalizeCapturePath(artifactCaptureRunDir);
  if (normalizedSelected === normalizedArtifact) {
    return true;
  }

  // Allow absolute vs relative path forms when both resolve to the same run id.
  return (
    resolveSelectedRunId(normalizedSelected) === selectedRunId
    && resolveSelectedRunId(normalizedArtifact) === selectedRunId
  );
}

export function resolveRunScopedCaptureHealthAuditPath(captureRunDir: string): string {
  return joinCapturePath(captureRunDir, CAPTURE_HEALTH_AUDIT_FILENAME);
}

function objectOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isNullableNonNegativeNumber(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isNullableShare(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

/**
 * Strict runtime validation for capture-health audits used as formal research
 * health sources. Rejects NaN/infinite values, negative counts, shares outside
 * 0-1, malformed identity records, mismatched run identities, and (for
 * capture-research-ready verdicts) missing required quality metrics, so a bare
 * `{ summary: { verdict: "capture-research-ready" } }` cannot grant readiness.
 */
export function parseCaptureHealthAuditReport(
  record: Record<string, unknown> | null,
): { report: CaptureHealthAuditReport | null; errors: string[] } {
  const errors: string[] = [];
  if (!record) {
    return { report: null, errors: ["audit is not a JSON object"] };
  }

  const selectedRunId = readString(record.selectedRunId);
  if (!selectedRunId) {
    errors.push("selectedRunId must be a non-empty string");
  }

  const captureRunDir = readString(record.captureRunDir);
  if (!captureRunDir) {
    errors.push("captureRunDir must be a non-empty string");
  } else if (selectedRunId && resolveSelectedRunId(captureRunDir) !== selectedRunId) {
    errors.push("captureRunDir basename does not match selectedRunId");
  }

  const sourceRunIds = record.sourceRunIds;
  if (
    !Array.isArray(sourceRunIds)
    || sourceRunIds.length !== 1
    || typeof sourceRunIds[0] !== "string"
    || sourceRunIds[0].trim().length === 0
  ) {
    errors.push("sourceRunIds must be a singleton array containing the selected run id");
  } else if (selectedRunId && sourceRunIds[0] !== selectedRunId) {
    errors.push("sourceRunIds does not match selectedRunId");
  }

  if (!readString(record.analysisVersion)) {
    errors.push("analysisVersion must be a non-empty string");
  }

  const identities = record.inputArtifactIdentities;
  if (!Array.isArray(identities)) {
    errors.push("inputArtifactIdentities must be an array");
  } else {
    identities.forEach((entry, index) => {
      const identity = objectOrNull(entry);
      if (!identity) {
        errors.push(`inputArtifactIdentities[${index}] must be an object`);
        return;
      }
      if (!readString(identity.path)) {
        errors.push(`inputArtifactIdentities[${index}].path must be a non-empty string`);
      }
      if (!readString(identity.role)) {
        errors.push(`inputArtifactIdentities[${index}].role must be a non-empty string`);
      }
      for (const field of ["sizeBytes", "mtimeMs", "recordCount"] as const) {
        if (!isNullableNonNegativeNumber(identity[field])) {
          errors.push(
            `inputArtifactIdentities[${index}].${field} must be null or a finite non-negative number`,
          );
        }
      }
    });
  }

  const summary = objectOrNull(record.summary);
  if (!summary) {
    errors.push("summary must be an object");
    return { report: null, errors };
  }

  const verdict = readString(summary.verdict);
  if (!verdict || !(CAPTURE_READINESS_VERDICTS as readonly string[]).includes(verdict)) {
    errors.push(`summary.verdict must be one of: ${CAPTURE_READINESS_VERDICTS.join(", ")}`);
  }
  if (!readString(summary.recommendedNextAction)) {
    errors.push("summary.recommendedNextAction must be a non-empty string");
  }

  const bookState = objectOrNull(summary.bookState);
  const btcJoin = objectOrNull(summary.btcJoin);
  const continuity = objectOrNull(summary.continuity);
  if (!bookState) {
    errors.push("summary.bookState must be an object");
  }
  if (!btcJoin) {
    errors.push("summary.btcJoin must be an object");
  }
  if (!continuity) {
    errors.push("summary.continuity must be an object");
  }

  const nonNegativeFields: [unknown, string][] = [
    [summary.runDurationSeconds, "summary.runDurationSeconds"],
    [summary.topOfBookCount, "summary.topOfBookCount"],
    [summary.btcSpotCount, "summary.btcSpotCount"],
    [bookState?.reconnectCount, "summary.bookState.reconnectCount"],
    [bookState?.sequenceGapCount, "summary.bookState.sequenceGapCount"],
    [continuity?.p90TopOfBookGapMs, "summary.continuity.p90TopOfBookGapMs"],
  ];
  for (const [value, label] of nonNegativeFields) {
    if (!isNullableNonNegativeNumber(value)) {
      errors.push(`${label} must be null or a finite non-negative number`);
    }
  }
  const shareFields: [unknown, string][] = [
    [bookState?.validBookShare, "summary.bookState.validBookShare"],
    [btcJoin?.joinCoverageShare, "summary.btcJoin.joinCoverageShare"],
  ];
  for (const [value, label] of shareFields) {
    if (!isNullableShare(value)) {
      errors.push(`${label} must be null or a finite share within 0-1`);
    }
  }

  // A capture-research-ready verdict is a formal claim; every quality metric
  // the frozen research policy relies on must be present, not merely typed.
  if (verdict === RESEARCH_READY_CAPTURE_VERDICT) {
    const btcRequired = btcJoin?.btcSpotRequested !== false;
    const requiredForReadiness: [unknown, string][] = [
      [summary.runDurationSeconds, "summary.runDurationSeconds"],
      [summary.topOfBookCount, "summary.topOfBookCount"],
      [bookState?.validBookShare, "summary.bookState.validBookShare"],
      [bookState?.reconnectCount, "summary.bookState.reconnectCount"],
      [bookState?.sequenceGapCount, "summary.bookState.sequenceGapCount"],
      [continuity?.p90TopOfBookGapMs, "summary.continuity.p90TopOfBookGapMs"],
      ...(btcRequired
        ? ([
            [summary.btcSpotCount, "summary.btcSpotCount"],
            [btcJoin?.joinCoverageShare, "summary.btcJoin.joinCoverageShare"],
          ] as [unknown, string][])
        : []),
    ];
    for (const [value, label] of requiredForReadiness) {
      if (value === null || value === undefined) {
        errors.push(`${label} is required for a ${RESEARCH_READY_CAPTURE_VERDICT} verdict`);
      }
    }
  }

  if (errors.length > 0) {
    return { report: null, errors };
  }
  return { report: record as unknown as CaptureHealthAuditReport, errors: [] };
}

/**
 * Verifies audit freshness against current source artifacts. Throws on a
 * definite staleness proof (missing artifact, size or mtime drift); returns
 * `fingerprintsVerified: false` with warnings when freshness could not be
 * positively verified (missing/incomplete fingerprints or unavailable stats).
 */
export function verifyCaptureHealthAuditFreshness(input: {
  auditRecord: Record<string, unknown>;
  io: SelectedRunCaptureHealthIo;
  sourceLabel: string;
}): { warnings: string[]; fingerprintsVerified: boolean } {
  const warnings: string[] = [];
  const identities = input.auditRecord.inputArtifactIdentities;
  if (!Array.isArray(identities) || identities.length === 0) {
    warnings.push(
      `${input.sourceLabel} lacks source artifact fingerprints; staleness cannot be verified.`,
    );
    return { warnings, fingerprintsVerified: false };
  }

  const trackedRoles = new Set(["top-of-book", "btc-spot", "market-metadata"]);
  let fingerprintChecked = false;

  for (const entry of identities) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const identity = entry as Record<string, unknown>;
    const role = readString(identity.role);
    const path = readString(identity.path);
    if (!role || !path || !trackedRoles.has(role)) {
      continue;
    }

    const expectedSize = readNumber(identity.sizeBytes);
    const expectedMtime = readNumber(identity.mtimeMs);
    if (expectedSize === null && expectedMtime === null) {
      warnings.push(
        `${input.sourceLabel} fingerprint incomplete for ${role}; staleness cannot be fully verified.`,
      );
      continue;
    }

    fingerprintChecked = true;
    const normalizedPath = normalizeCapturePath(path);
    if (!input.io.fileExists(normalizedPath) && !input.io.fileExists(path)) {
      throw new SelectedRunCaptureHealthError(
        `${input.sourceLabel} is stale: missing source artifact ${path}`,
      );
    }

    const existingPath = input.io.fileExists(normalizedPath) ? normalizedPath : path;
    const currentSize = input.io.fileSizeBytes?.(existingPath) ?? null;
    const currentMtime = input.io.fileMtimeMs?.(existingPath) ?? null;

    if (expectedSize !== null && currentSize !== null && expectedSize !== currentSize) {
      throw new SelectedRunCaptureHealthError(
        `${input.sourceLabel} is stale: ${role} size changed (${expectedSize} -> ${currentSize}).`,
      );
    }
    if (expectedMtime !== null && currentMtime !== null && expectedMtime !== currentMtime) {
      throw new SelectedRunCaptureHealthError(
        `${input.sourceLabel} is stale: ${role} mtime changed (${expectedMtime} -> ${currentMtime}).`,
      );
    }
    if (
      (expectedSize !== null && currentSize === null)
      || (expectedMtime !== null && currentMtime === null)
    ) {
      warnings.push(
        `${input.sourceLabel} fingerprint for ${role} could not be revalidated; IO lacks file stats.`,
      );
    }
  }

  if (!fingerprintChecked) {
    warnings.push(
      `${input.sourceLabel} lacks usable source artifact fingerprints; staleness cannot be verified.`,
    );
  }

  // Any warning above means at least one tracked fingerprint could not be
  // positively revalidated, so freshness is unverified rather than proven.
  return { warnings, fingerprintsVerified: fingerprintChecked && warnings.length === 0 };
}

/**
 * Single research-ready policy shared by forward (M13.2) and cross-run (M13.3)
 * validation: a run is research-ready only when a capture-research-ready
 * verdict comes from a verified source (matching identity, valid audit schema,
 * and positively verified freshness), never from the verdict string alone.
 */
export function isVerifiedResearchReady(input: {
  captureVerdict: string | null;
  researchReadyVerified: boolean | null | undefined;
}): boolean {
  return (
    input.captureVerdict === RESEARCH_READY_CAPTURE_VERDICT
    && input.researchReadyVerified === true
  );
}

export function computeValidBookShareFromNativeHealth(
  health: Record<string, unknown> | null,
): number | null {
  if (!health) {
    return null;
  }
  const orderbook =
    health.orderbook && typeof health.orderbook === "object"
      ? (health.orderbook as Record<string, unknown>)
      : null;
  const capture =
    health.capture && typeof health.capture === "object"
      ? (health.capture as Record<string, unknown>)
      : null;
  const validCount = readNumber(orderbook?.validTopOfBookRecords);
  const totalCount =
    readNumber(capture?.topOfBookRecordCount)
    ?? readNumber(orderbook?.topOfBookRecordsEmitted);
  if (validCount === null || totalCount === null || totalCount <= 0) {
    return null;
  }
  return Math.round((validCount / totalCount) * 10_000) / 10_000;
}

export function resolveConfiguredDurationSecondsFromNative(
  health: Record<string, unknown> | null,
): number | null {
  if (!health) {
    return null;
  }
  const config =
    health.config && typeof health.config === "object"
      ? (health.config as Record<string, unknown>)
      : null;
  const durationSeconds = readNumber(config?.durationSeconds);
  if (durationSeconds !== null) {
    return durationSeconds;
  }
  const durationMinutes = readNumber(config?.durationMinutes);
  if (durationMinutes !== null) {
    return Math.round(durationMinutes * 60);
  }
  const legacyDuration =
    health.duration && typeof health.duration === "object"
      ? (health.duration as Record<string, unknown>)
      : null;
  return readNumber(legacyDuration?.runDurationSeconds);
}

export function resolveReconnectCountFromNative(
  health: Record<string, unknown> | null,
): number | null {
  if (!health) {
    return null;
  }
  const watchdog =
    health.watchdog && typeof health.watchdog === "object"
      ? (health.watchdog as Record<string, unknown>)
      : null;
  const connection =
    health.connection && typeof health.connection === "object"
      ? (health.connection as Record<string, unknown>)
      : null;
  const orderbook =
    health.orderbook && typeof health.orderbook === "object"
      ? (health.orderbook as Record<string, unknown>)
      : null;
  return (
    readNumber(watchdog?.recoveryAttemptCount)
    ?? readNumber(connection?.reconnectCount)
    ?? readNumber(orderbook?.reconnectCount)
  );
}
