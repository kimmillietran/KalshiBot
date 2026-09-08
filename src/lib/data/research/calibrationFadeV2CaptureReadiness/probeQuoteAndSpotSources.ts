import { parseIsoTimestampMs } from "../bidOnlyCandidateLifecycle/bidOnlyCandidateLifecycleUtils";
import {
  isRecord,
  readNumber,
  readString,
} from "../calibrationFadeForwardValidation/calibrationFadeForwardValidationUtils";

import type {
  CalibrationFadeV2CaptureReadinessBoundedProbe,
  CalibrationFadeV2CaptureReadinessIo,
} from "./calibrationFadeV2CaptureReadinessTypes";

function parseJsonObject(line: string): Record<string, unknown> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  return isRecord(parsed) ? parsed : null;
}

function hasUsableTimestamp(record: Record<string, unknown>): boolean {
  if (readString(record.receivedAtLocal) && parseIsoTimestampMs(record.receivedAtLocal as string) !== null) {
    return true;
  }
  if (readNumber(record.exchangeTimestampMs) !== null) {
    return true;
  }
  const exchangeTimestamp = readString(record.exchangeTimestamp);
  if (exchangeTimestamp && parseIsoTimestampMs(exchangeTimestamp) !== null) {
    return true;
  }
  const timestamp = readString(record.timestamp);
  return Boolean(timestamp && parseIsoTimestampMs(timestamp) !== null);
}

export function isParseableReadinessQuoteRow(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  return Boolean(readString(value.marketTicker) && hasUsableTimestamp(value));
}

export function isParseableReadinessSpotRow(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  const price = readNumber(value.priceUsd) ?? readNumber(value.price);
  if (price === null) {
    return false;
  }
  return hasUsableTimestamp(value);
}

/**
 * Bounded streaming probe: stop after the first valid record so multi-GB
 * quote/spot artifacts are not loaded into memory.
 */
export async function probeJsonlForFirstValidRecord(input: {
  io: CalibrationFadeV2CaptureReadinessIo;
  path: string | null;
  isValid: (value: unknown) => boolean;
}): Promise<CalibrationFadeV2CaptureReadinessBoundedProbe> {
  if (!input.path || !input.io.fileExists(input.path)) {
    return {
      artifactPath: input.path,
      artifactPresent: false,
      nonblankLineCount: 0,
      parseableRecordCount: 0,
      stoppedAfterFirstValid: false,
    };
  }

  let nonblankLineCount = 0;
  let parseableRecordCount = 0;
  let stoppedAfterFirstValid = false;

  await input.io.iterateJsonl(input.path, {
    onLine: (line) => {
      nonblankLineCount += 1;
      const record = parseJsonObject(line);
      if (record && input.isValid(record)) {
        parseableRecordCount = 1;
        stoppedAfterFirstValid = true;
        return "stop";
      }
      return "continue";
    },
  });

  return {
    artifactPath: input.path,
    artifactPresent: true,
    nonblankLineCount,
    parseableRecordCount,
    stoppedAfterFirstValid,
  };
}
