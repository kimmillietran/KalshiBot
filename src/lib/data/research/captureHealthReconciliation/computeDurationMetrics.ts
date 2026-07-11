import type { ParsedTopOfBookRecord } from "@/lib/data/research/captureHealthAudit/captureHealthAuditTypes";
import type { LoadedCaptureHealthJson } from "@/lib/data/research/captureHealthAudit/loadCaptureRunArtifacts";
import { parseIsoTimestampMs } from "@/lib/data/research/captureHealthAudit/captureHealthAuditUtils";

import type { DurationMetrics } from "./captureHealthReconciliationTypes";

const DURATION_DEFINITIONS: DurationMetrics["definitions"] = {
  configuredDurationSeconds:
    "Configured capture duration from capture-health config (durationMinutes * 60 or durationSeconds).",
  processWallClockSeconds:
    "Wall-clock span from capture-health startedAt/endedAt when present; otherwise null with warning.",
  eventWallClockSpanSeconds:
    "Difference between earliest and latest top-of-book receivedAtLocal timestamps.",
  activeObservationSeconds:
    "Event wall-clock span minus classified probable host suspension seconds.",
  usableObservationSeconds:
    "Active observation scaled by rawTopOfBookValidShare (bookState === valid).",
  suspectedHostSuspensionSeconds:
    "Sum of heartbeat gaps classified as probable host suspension.",
  webSocketDisconnectedSeconds:
    "Not directly observable from emitted artifacts; null unless lifecycle logs exist.",
  resynchronizationSeconds:
    "Estimated time in gap-detected / awaiting-snapshot book states using inter-record gaps.",
  unknownBlindSeconds:
    "Observed active non-usable time that remains after classified resync estimates.",
};

function readIsoMs(value: unknown): number | null {
  return typeof value === "string" ? parseIsoTimestampMs(value) : null;
}

function resolveConfiguredDurationSeconds(captureHealth: LoadedCaptureHealthJson | null): number | null {
  const config = captureHealth?.config as Record<string, unknown> | undefined;
  if (!config) {
    return null;
  }

  const durationSeconds = readNumber(config.durationSeconds);
  if (durationSeconds !== null) {
    return durationSeconds;
  }

  const durationMinutes = readNumber(config.durationMinutes);
  if (durationMinutes !== null) {
    return Math.round(durationMinutes * 60);
  }

  return null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function estimateResyncSeconds(
  records: readonly ParsedTopOfBookRecord[],
): number {
  if (records.length < 2) {
    return 0;
  }

  let totalMs = 0;
  for (let index = 1; index < records.length; index += 1) {
    const previous = records[index - 1]!;
    const current = records[index]!;
    const gapMs = current.receivedAtMs - previous.receivedAtMs;
    if (gapMs <= 0) {
      continue;
    }

    if (
      current.bookState === "gap-detected"
      || current.bookState === "awaiting-snapshot"
      || previous.bookState === "gap-detected"
    ) {
      totalMs += gapMs;
    }
  }

  return Math.round(totalMs / 1000);
}

/** Computes explicit duration metrics for a selected capture run. */
export function computeDurationMetrics(input: {
  topOfBookRecords: readonly ParsedTopOfBookRecord[];
  captureHealth: LoadedCaptureHealthJson | null;
  suspectedHostSuspensionSeconds: number;
}): DurationMetrics {
  const warnings: string[] = [];
  const configuredDurationSeconds = resolveConfiguredDurationSeconds(input.captureHealth);

  const health = input.captureHealth as {
    startedAt?: string;
    endedAt?: string;
  } | null;
  const startedMs = readIsoMs(health?.startedAt);
  const endedMs = readIsoMs(health?.endedAt);
  let processWallClockSeconds: number | null = null;
  if (startedMs !== null && endedMs !== null && endedMs >= startedMs) {
    processWallClockSeconds = Math.round((endedMs - startedMs) / 1000);
  } else {
    warnings.push(
      "processWallClockSeconds unavailable: capture-health startedAt/endedAt missing.",
    );
  }

  let eventWallClockSpanSeconds: number | null = null;
  if (input.topOfBookRecords.length >= 2) {
    const timestamps = input.topOfBookRecords.map((record) => record.receivedAtMs);
    eventWallClockSpanSeconds = Math.round(
      (Math.max(...timestamps) - Math.min(...timestamps)) / 1000,
    );
  } else if (input.topOfBookRecords.length === 1) {
    eventWallClockSpanSeconds = 0;
  } else {
    warnings.push("eventWallClockSpanSeconds unavailable: no top-of-book records.");
  }

  const resynchronizationSeconds = estimateResyncSeconds(input.topOfBookRecords);

  const activeObservationSeconds =
    eventWallClockSpanSeconds === null
      ? null
      : Math.max(0, eventWallClockSpanSeconds - input.suspectedHostSuspensionSeconds);

  const validCount = input.topOfBookRecords.filter((record) => record.bookState === "valid").length;
  const validShare =
    input.topOfBookRecords.length > 0 ? validCount / input.topOfBookRecords.length : null;

  const usableObservationSeconds =
    activeObservationSeconds === null || validShare === null
      ? null
      : Math.round(activeObservationSeconds * validShare);

  const activeNonUsableSeconds =
    activeObservationSeconds === null || usableObservationSeconds === null
      ? null
      : Math.max(0, activeObservationSeconds - usableObservationSeconds);
  const unknownBlindSeconds =
    activeNonUsableSeconds === null
      ? null
      : Math.max(0, activeNonUsableSeconds - resynchronizationSeconds);

  if (
    input.captureHealth?.config?.durationSeconds
    && eventWallClockSpanSeconds !== null
    && configuredDurationSeconds !== null
    && Math.abs(eventWallClockSpanSeconds - configuredDurationSeconds) > configuredDurationSeconds * 0.2
  ) {
    warnings.push(
      "captureHealthAudit runDurationSeconds historically aliases configured duration, not event span.",
    );
  }

  return {
    configuredDurationSeconds,
    processWallClockSeconds,
    eventWallClockSpanSeconds,
    activeObservationSeconds,
    usableObservationSeconds,
    suspectedHostSuspensionSeconds: input.suspectedHostSuspensionSeconds,
    webSocketDisconnectedSeconds: null,
    resynchronizationSeconds,
    unknownBlindSeconds,
    definitions: DURATION_DEFINITIONS,
    warnings,
  };
}
