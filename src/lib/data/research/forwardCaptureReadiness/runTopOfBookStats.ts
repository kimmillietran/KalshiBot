import {
  parseIsoTimestampMs,
  safeShare,
  utcDateKey,
} from "./forwardCaptureReadinessMath";
import type { ParsedTopOfBookRecord } from "./loadForwardCaptureRuns";

export type RunTopOfBookStats = {
  recordCount: number;
  validRecordCount: number;
  economicallyValidRecordCount: number;
  parityUsableRecordCount: number;
  nonZeroSpreadRecordCount: number;
  hasDepthFields: boolean;
  marketTickers: Set<string>;
  eventTickers: Set<string>;
  seriesTickers: Set<string>;
  calendarDays: Set<string>;
  gapsMs: number[];
  minTimestampMs: number | null;
  maxTimestampMs: number | null;
  malformedLineCount: number;
};

export type RunBtcSpotStats = {
  recordCount: number;
  calendarDays: Set<string>;
  malformedLineCount: number;
};

export function createEmptyRunTopOfBookStats(): RunTopOfBookStats {
  return {
    recordCount: 0,
    validRecordCount: 0,
    economicallyValidRecordCount: 0,
    parityUsableRecordCount: 0,
    nonZeroSpreadRecordCount: 0,
    hasDepthFields: false,
    marketTickers: new Set(),
    eventTickers: new Set(),
    seriesTickers: new Set(),
    calendarDays: new Set(),
    gapsMs: [],
    minTimestampMs: null,
    maxTimestampMs: null,
    malformedLineCount: 0,
  };
}

export function createEmptyRunBtcSpotStats(): RunBtcSpotStats {
  return {
    recordCount: 0,
    calendarDays: new Set(),
    malformedLineCount: 0,
  };
}

function hasDepthFields(record: ParsedTopOfBookRecord): boolean {
  return (
    record.yesBestBidSize !== null
    && record.yesBestBidSize !== undefined
    && record.yesBestAskSize !== null
    && record.yesBestAskSize !== undefined
    && record.noBestBidSize !== null
    && record.noBestBidSize !== undefined
    && record.noBestAskSize !== null
    && record.noBestAskSize !== undefined
  );
}

function isNonZeroSpread(record: ParsedTopOfBookRecord): boolean {
  const spreads = [record.yesSpreadCents, record.noSpreadCents].filter(
    (value): value is number => value !== null && value !== undefined,
  );
  if (spreads.length === 0) {
    const yesBid = record.yesBestBidCents;
    const yesAsk = record.yesBestAskCents;
    if (yesBid !== null && yesBid !== undefined && yesAsk !== null && yesAsk !== undefined) {
      return yesAsk > yesBid;
    }

    return false;
  }

  return spreads.some((spread) => spread > 0);
}

function updateTimestampRange(
  stats: RunTopOfBookStats,
  timestampMs: number,
  previousTimestampMs: number | null,
): number | null {
  stats.minTimestampMs =
    stats.minTimestampMs === null
      ? timestampMs
      : Math.min(stats.minTimestampMs, timestampMs);
  stats.maxTimestampMs =
    stats.maxTimestampMs === null
      ? timestampMs
      : Math.max(stats.maxTimestampMs, timestampMs);

  if (previousTimestampMs !== null && timestampMs >= previousTimestampMs) {
    stats.gapsMs.push(timestampMs - previousTimestampMs);
  }

  return timestampMs;
}

function isEconomicallyValidRecord(record: ParsedTopOfBookRecord): boolean {
  if (record.isEconomicallyValid !== undefined) {
    return record.isEconomicallyValid;
  }

  return record.bookState === "valid";
}

function isParityUsableRecord(record: ParsedTopOfBookRecord): boolean {
  if (record.isParityUsable !== undefined) {
    return record.isParityUsable;
  }

  return isEconomicallyValidRecord(record);
}

export function accumulateTopOfBookRecord(
  stats: RunTopOfBookStats,
  record: ParsedTopOfBookRecord,
  previousTimestampMs: number | null,
): number | null {
  stats.recordCount += 1;

  if (record.bookState === "valid") {
    stats.validRecordCount += 1;
  }

  if (isEconomicallyValidRecord(record)) {
    stats.economicallyValidRecordCount += 1;
  }

  if (isParityUsableRecord(record)) {
    stats.parityUsableRecordCount += 1;
  }

  if (isNonZeroSpread(record)) {
    stats.nonZeroSpreadRecordCount += 1;
  }

  if (hasDepthFields(record)) {
    stats.hasDepthFields = true;
  }

  stats.marketTickers.add(record.marketTicker);
  if (record.eventTicker) {
    stats.eventTickers.add(record.eventTicker);
  }
  if (record.seriesTicker) {
    stats.seriesTickers.add(record.seriesTicker);
  }

  const day = utcDateKey(record.receivedAtLocal);
  if (day) {
    stats.calendarDays.add(day);
  }

  const timestampMs = parseIsoTimestampMs(record.receivedAtLocal);
  if (timestampMs === null) {
    return previousTimestampMs;
  }

  return updateTimestampRange(stats, timestampMs, previousTimestampMs);
}

export function mergeRunTopOfBookStats(
  left: RunTopOfBookStats,
  right: RunTopOfBookStats,
): RunTopOfBookStats {
  return {
    recordCount: left.recordCount + right.recordCount,
    validRecordCount: left.validRecordCount + right.validRecordCount,
    economicallyValidRecordCount:
      left.economicallyValidRecordCount + right.economicallyValidRecordCount,
    parityUsableRecordCount:
      left.parityUsableRecordCount + right.parityUsableRecordCount,
    nonZeroSpreadRecordCount:
      left.nonZeroSpreadRecordCount + right.nonZeroSpreadRecordCount,
    hasDepthFields: left.hasDepthFields || right.hasDepthFields,
    marketTickers: new Set([...left.marketTickers, ...right.marketTickers]),
    eventTickers: new Set([...left.eventTickers, ...right.eventTickers]),
    seriesTickers: new Set([...left.seriesTickers, ...right.seriesTickers]),
    calendarDays: new Set([...left.calendarDays, ...right.calendarDays]),
    gapsMs: [...left.gapsMs, ...right.gapsMs],
    minTimestampMs:
      left.minTimestampMs === null
        ? right.minTimestampMs
        : right.minTimestampMs === null
          ? left.minTimestampMs
          : Math.min(left.minTimestampMs, right.minTimestampMs),
    maxTimestampMs:
      left.maxTimestampMs === null
        ? right.maxTimestampMs
        : right.maxTimestampMs === null
          ? left.maxTimestampMs
          : Math.max(left.maxTimestampMs, right.maxTimestampMs),
    malformedLineCount: left.malformedLineCount + right.malformedLineCount,
  };
}

export function mergeRunBtcSpotStats(
  left: RunBtcSpotStats,
  right: RunBtcSpotStats,
): RunBtcSpotStats {
  return {
    recordCount: left.recordCount + right.recordCount,
    calendarDays: new Set([...left.calendarDays, ...right.calendarDays]),
    malformedLineCount: left.malformedLineCount + right.malformedLineCount,
  };
}

export function validBookShare(stats: RunTopOfBookStats): number | null {
  if (stats.economicallyValidRecordCount > 0 || stats.recordCount === 0) {
    return safeShare(stats.economicallyValidRecordCount, stats.recordCount);
  }

  return safeShare(stats.validRecordCount, stats.recordCount);
}

export function nonZeroSpreadShare(stats: RunTopOfBookStats): number | null {
  return safeShare(stats.nonZeroSpreadRecordCount, stats.recordCount);
}

export {
  hasDepthFields,
  isNonZeroSpread,
};
