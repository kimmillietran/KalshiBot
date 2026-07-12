export { parseIsoTimestampMs, joinPath } from "../bidOnlyCandidateLifecycle/bidOnlyCandidateLifecycleUtils";

export function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export function resolveKalshiTimestampMs(input: {
  receivedAtMs: number;
  exchangeTimestampMs: number | null;
}): number {
  return input.exchangeTimestampMs ?? input.receivedAtMs;
}

export function resolveBtcTimestampMs(input: {
  receivedAtMs: number;
  exchangeTimestampMs: number | null;
}): number {
  return input.exchangeTimestampMs ?? input.receivedAtMs;
}

export function basisPointsChange(startPrice: number, endPrice: number): number {
  if (startPrice <= 0) {
    return 0;
  }
  return ((endPrice - startPrice) / startPrice) * 10_000;
}

export function resolveBtcDirection(returnBps: number): "up" | "down" | "flat" {
  if (returnBps > 0) {
    return "up";
  }
  if (returnBps < 0) {
    return "down";
  }
  return "flat";
}

export function resolveKalshiDirection(changeCents: number | null): "up" | "down" | "flat" | "unavailable" {
  if (changeCents === null) {
    return "unavailable";
  }
  if (changeCents > 0) {
    return "up";
  }
  if (changeCents < 0) {
    return "down";
  }
  return "flat";
}

export function emptyAggregateBucket() {
  return {
    triggerCount: 0,
    eligibleTriggerCount: 0,
    directionalResponseShare: null,
    medianSignedYesMidResponseCents: null,
    meanSignedYesMidResponseCents: null,
    responseQuantiles: { p25: null, p50: null, p75: null },
    medianTimeToFirst1CentResponseMs: null,
    medianTimeToFirst2CentResponseMs: null,
    shareNo1CentResponseBy2Seconds: null,
    shareNo1CentResponseBy5Seconds: null,
    shareNo1CentResponseBy10Seconds: null,
    meanSpreadBeforeCents: null,
    meanSpreadAfterCents: null,
    meanSizeBefore: null,
    meanSizeAfter: null,
  };
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1]! + sorted[middle]!) / 2;
  }
  return sorted[middle]!;
}

export function mean(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function quantile(values: readonly number[], q: number): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = (sorted.length - 1) * q;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) {
    return sorted[lower]!;
  }
  const weight = index - lower;
  return sorted[lower]! * (1 - weight) + sorted[upper]! * weight;
}

export function resolveQuoteRetentionWindowMs(input: {
  triggerTimestampsMs: readonly number[];
  maximumBtcHorizonMs: number;
  maximumResponseWindowMs: number;
  responseMatchToleranceMs: number;
  preTriggerQuoteBufferMs?: number;
}): { startMs: number; endMs: number } | null {
  if (input.triggerTimestampsMs.length === 0) {
    return null;
  }

  const minTriggerMs = Math.min(...input.triggerTimestampsMs);
  const maxTriggerMs = Math.max(...input.triggerTimestampsMs);
  const preTriggerQuoteBufferMs = input.preTriggerQuoteBufferMs ?? 5_000;

  return {
    startMs: minTriggerMs - input.maximumBtcHorizonMs - preTriggerQuoteBufferMs,
    endMs: maxTriggerMs + input.maximumResponseWindowMs + input.responseMatchToleranceMs,
  };
}

export function publishStagedFileAtomically(
  io: {
    fileExists: (path: string) => boolean;
    unlinkFile: (path: string) => void;
    renameFile: (from: string, to: string) => void;
  },
  outputPath: string,
  stagingPath: string,
): void {
  const backupPath = `${outputPath}.${process.pid}.bak`;
  let backupCreated = false;

  try {
    if (io.fileExists(outputPath)) {
      io.renameFile(outputPath, backupPath);
      backupCreated = true;
    }

    io.renameFile(stagingPath, outputPath);

    if (backupCreated && io.fileExists(backupPath)) {
      io.unlinkFile(backupPath);
    }
  } catch (error) {
    if (io.fileExists(stagingPath)) {
      io.unlinkFile(stagingPath);
    }

    if (backupCreated && io.fileExists(backupPath) && !io.fileExists(outputPath)) {
      io.renameFile(backupPath, outputPath);
    }

    throw error;
  }
}
