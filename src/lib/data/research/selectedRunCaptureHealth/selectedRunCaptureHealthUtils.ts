import { CAPTURE_HEALTH_AUDIT_FILENAME } from "../captureHealthAudit/captureHealthAuditTypes";
import type { CaptureHealthAuditReport } from "../captureHealthAudit/captureHealthAuditTypes";

export function joinCapturePath(captureRunDir: string, filename: string): string {
  return `${captureRunDir.replace(/\\/g, "/").replace(/\/$/, "")}/${filename}`;
}

export function resolveSelectedRunId(captureRunDir: string): string {
  const normalized = captureRunDir.replace(/\\/g, "/").replace(/\/$/, "");
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
    return JSON.parse(readFile(path).replace(/^\uFEFF/, "")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

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
