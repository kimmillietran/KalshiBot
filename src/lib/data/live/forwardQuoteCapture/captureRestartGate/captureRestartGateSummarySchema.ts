import { stableStringify } from "@/lib/trading/config/hashConfig";

import type { CaptureRestartGateSummary } from "./captureRestartGateTypes";

/** Serializes the operator summary deterministically (stable key order). */
export function serializeCaptureRestartGateSummary(
  summary: CaptureRestartGateSummary,
): string {
  return `${stableStringify(summary)}\n`;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isNullableBoolean(value: unknown): value is boolean | null {
  return value === null || typeof value === "boolean";
}

const NULLABLE_NUMBER_FIELDS = [
  "durationSeconds",
  "expectedDurationSeconds",
  "topOfBookCount",
  "btcSpotCount",
  "validBookShare",
  "btcJoinCoverageShare",
  "gapEpisodeCount",
  "recoveryRequestCount",
  "recoverySuccessCount",
  "recoveryFailureCount",
  "suppressedWhileResyncingCount",
  "writerBackpressureCount",
] as const;

const NULLABLE_STRING_FIELDS = [
  "runId",
  "nativeHealthStatus",
  "runStatusState",
  "auditVerdict",
] as const;

/**
 * Strict fail-closed parser for the machine-readable restart summary. Any
 * missing or mistyped field returns null so automation can never act on a
 * partial or corrupted summary.
 */
export function parseCaptureRestartGateSummary(
  text: string,
): CaptureRestartGateSummary | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const record = parsed as Record<string, unknown>;

  if (record.schemaVersion !== 1) {
    return null;
  }
  if (typeof record.generatedAt !== "string" || record.generatedAt.length === 0) {
    return null;
  }
  if (typeof record.runDir !== "string" || record.runDir.length === 0) {
    return null;
  }
  for (const field of NULLABLE_STRING_FIELDS) {
    if (!isNullableString(record[field])) {
      return null;
    }
  }
  for (const field of NULLABLE_NUMBER_FIELDS) {
    if (!isNullableFiniteNumber(record[field])) {
      return null;
    }
  }
  if (!isNullableBoolean(record.allStreamsDrained)) {
    return null;
  }
  if (typeof record.auditFingerprintsVerified !== "boolean") {
    return null;
  }
  if (typeof record.restartEightHourCaptures !== "boolean") {
    return null;
  }
  if (
    !Array.isArray(record.failureReasons)
    || record.failureReasons.some((entry) => typeof entry !== "string")
  ) {
    return null;
  }
  // The gate must never claim readiness while carrying failure reasons.
  if (record.restartEightHourCaptures && record.failureReasons.length > 0) {
    return null;
  }

  return record as unknown as CaptureRestartGateSummary;
}
