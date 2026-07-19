import { CAPTURE_HEALTH_AUDIT_FILENAME } from "../captureHealthAudit/captureHealthAuditTypes";
import type { CaptureHealthAuditReport } from "../captureHealthAudit/captureHealthAuditTypes";

import {
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

export function parseCaptureHealthAuditReport(
  record: Record<string, unknown> | null,
): CaptureHealthAuditReport | null {
  if (!record || typeof record.summary !== "object" || record.summary === null) {
    return null;
  }
  return record as unknown as CaptureHealthAuditReport;
}

export function assertCaptureHealthAuditNotStale(input: {
  auditRecord: Record<string, unknown>;
  io: SelectedRunCaptureHealthIo;
  sourceLabel: string;
}): string[] {
  const warnings: string[] = [];
  const identities = input.auditRecord.inputArtifactIdentities;
  if (!Array.isArray(identities) || identities.length === 0) {
    warnings.push(
      `${input.sourceLabel} lacks source artifact fingerprints; staleness cannot be verified.`,
    );
    return warnings;
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

  return warnings;
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
