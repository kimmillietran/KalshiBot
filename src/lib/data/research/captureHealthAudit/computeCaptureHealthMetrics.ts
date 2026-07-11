import type {
  CaptureBookStateMetrics,
  CaptureBtcJoinMetrics,
  CaptureContinuityMetrics,
  CaptureHealthAuditConfig,
  CaptureSegmentBreakdown,
  CaptureSegmentMetrics,
  CaptureSpreadMetrics,
  ParsedBtcSpotRecord,
  ParsedTopOfBookRecord,
} from "./captureHealthAuditTypes";
import type { LoadedCaptureHealthJson } from "./loadCaptureRunArtifacts";
import {
  computeSortedGaps,
  findNearestBtcDistanceMs,
  median,
  percentile,
  resolveKalshiTimestampMs,
  roundShare,
} from "./captureHealthAuditUtils";

export type ComputedCaptureMetrics = {
  runDurationSeconds: number | null;
  firstTimestamp: string | null;
  lastTimestamp: string | null;
  marketsCovered: number;
  eventTickersCovered: number;
  continuity: CaptureContinuityMetrics;
  bookState: CaptureBookStateMetrics;
  spread: CaptureSpreadMetrics;
  btcJoin: CaptureBtcJoinMetrics;
  segments: CaptureSegmentBreakdown;
};

function isZeroSpread(record: ParsedTopOfBookRecord): boolean {
  if (record.yesSpreadCents === 0) {
    return true;
  }

  if (record.noSpreadCents === 0) {
    return true;
  }

  if (
    record.yesBestBidCents !== null
    && record.yesBestAskCents !== null
    && record.yesBestBidCents === record.yesBestAskCents
  ) {
    return true;
  }

  return false;
}

function isCrossedOrInverted(record: ParsedTopOfBookRecord): boolean {
  if (
    record.yesBestBidCents !== null
    && record.yesBestAskCents !== null
    && record.yesBestBidCents >= record.yesBestAskCents
  ) {
    return true;
  }

  return false;
}

function isMissingBidOrAsk(record: ParsedTopOfBookRecord): boolean {
  return record.yesBestBidCents === null || record.yesBestAskCents === null;
}

function segmentKey(value: string | null, fallback = "unknown"): string {
  return value?.trim() ? value : fallback;
}

function buildSegmentMetrics(records: readonly ParsedTopOfBookRecord[]): CaptureSegmentMetrics {
  if (records.length === 0) {
    return {
      recordCount: 0,
      validBookShare: null,
      zeroSpreadShare: null,
      medianGapMs: null,
    };
  }

  const validCount = records.filter((record) => record.bookState === "valid").length;
  const zeroSpreadCount = records.filter(isZeroSpread).length;
  const gaps = computeSortedGaps(records.map((record) => record.receivedAtMs));

  return {
    recordCount: records.length,
    validBookShare: roundShare(validCount, records.length),
    zeroSpreadShare: roundShare(zeroSpreadCount, records.length),
    medianGapMs: median(gaps),
  };
}

function groupRecords<T extends string>(
  records: readonly ParsedTopOfBookRecord[],
  selector: (record: ParsedTopOfBookRecord) => T,
): Record<T, ParsedTopOfBookRecord[]> {
  const grouped = {} as Record<T, ParsedTopOfBookRecord[]>;

  for (const record of records) {
    const key = selector(record);
    grouped[key] = [...(grouped[key] ?? []), record];
  }

  return grouped;
}

function resolveBtcSpotRequested(
  captureHealth: LoadedCaptureHealthJson | null,
  btcSpotRecords: readonly ParsedBtcSpotRecord[],
): boolean {
  if (captureHealth?.config?.captureBtcSpot === true) {
    return true;
  }

  if (captureHealth?.btcSpot?.status === "enabled") {
    return true;
  }

  return btcSpotRecords.length > 0;
}

function resolveRunDurationSeconds(input: {
  topOfBookRecords: readonly ParsedTopOfBookRecord[];
  captureHealth: LoadedCaptureHealthJson | null;
}): number | null {
  if (typeof input.captureHealth?.config?.durationSeconds === "number") {
    return input.captureHealth.config.durationSeconds;
  }

  if (input.topOfBookRecords.length < 2) {
    if (input.topOfBookRecords.length === 1) {
      return 0;
    }

    return null;
  }

  const timestamps = input.topOfBookRecords.map((record) => record.receivedAtMs);
  const min = Math.min(...timestamps);
  const max = Math.max(...timestamps);
  return Math.max(0, Math.round((max - min) / 1000));
}

/** Computes continuity, spread, BTC join, and segmented capture metrics. */
export function computeCaptureHealthMetrics(input: {
  config: CaptureHealthAuditConfig;
  topOfBookRecords: readonly ParsedTopOfBookRecord[];
  btcSpotRecords: readonly ParsedBtcSpotRecord[];
  captureHealth: LoadedCaptureHealthJson | null;
}): ComputedCaptureMetrics {
  const { topOfBookRecords, btcSpotRecords, captureHealth, config } = input;
  const gaps = computeSortedGaps(topOfBookRecords.map((record) => record.receivedAtMs));
  const sortedGaps = [...gaps].sort((left, right) => left - right);

  const validCount = topOfBookRecords.filter((record) => record.bookState === "valid").length;
  const gapDetectedCount = topOfBookRecords.filter(
    (record) => record.bookState === "gap-detected",
  ).length;
  const zeroSpreadCount = topOfBookRecords.filter(isZeroSpread).length;
  const nonZeroSpreadCount = topOfBookRecords.length - zeroSpreadCount;
  const crossedCount = topOfBookRecords.filter(isCrossedOrInverted).length;
  const missingBidAskCount = topOfBookRecords.filter(isMissingBidOrAsk).length;

  const marketTickers = new Set(topOfBookRecords.map((record) => record.marketTicker));
  const eventTickers = new Set(
    topOfBookRecords
      .map((record) => record.eventTicker)
      .filter((value): value is string => value !== null),
  );

  const firstTimestamp =
    topOfBookRecords.length > 0
      ? topOfBookRecords.reduce((earliest, record) =>
          record.receivedAtMs < earliest.receivedAtMs ? record : earliest,
        ).receivedAtLocal
      : null;
  const lastTimestamp =
    topOfBookRecords.length > 0
      ? topOfBookRecords.reduce((latest, record) =>
          record.receivedAtMs > latest.receivedAtMs ? record : latest,
        ).receivedAtLocal
      : null;

  const btcSpotRequested = resolveBtcSpotRequested(captureHealth, btcSpotRecords);
  const btcTimestampsMs = btcSpotRecords.map(
    (record) => record.exchangeTimestampMs ?? record.receivedAtMs,
  );

  const joinDistances: number[] = [];
  let joinHits = 0;

  for (const record of topOfBookRecords) {
    const kalshiTimestampMs = resolveKalshiTimestampMs(record);
    const distance = findNearestBtcDistanceMs(kalshiTimestampMs, btcTimestampsMs);
    if (distance === null) {
      continue;
    }

    joinDistances.push(distance);
    if (distance <= config.thresholds.btcJoinMaxDistanceMs) {
      joinHits += 1;
    }
  }

  const sortedJoinDistances = [...joinDistances].sort((left, right) => left - right);

  const marketGroups = groupRecords(topOfBookRecords, (record) => record.marketTicker);
  const eventGroups = groupRecords(topOfBookRecords, (record) =>
    segmentKey(record.eventTicker),
  );
  const hourGroups = groupRecords(topOfBookRecords, (record) => record.hourBucket);
  const bookStateGroups = groupRecords(topOfBookRecords, (record) => record.bookState);

  const toSegmentMap = (
    groups: Record<string, ParsedTopOfBookRecord[]>,
  ): Record<string, CaptureSegmentMetrics> => {
    const result: Record<string, CaptureSegmentMetrics> = {};
    for (const [key, records] of Object.entries(groups)) {
      result[key] = buildSegmentMetrics(records);
    }

    return result;
  };

  return {
    runDurationSeconds: resolveRunDurationSeconds({ topOfBookRecords, captureHealth }),
    firstTimestamp,
    lastTimestamp,
    marketsCovered: marketTickers.size,
    eventTickersCovered: eventTickers.size,
    continuity: {
      medianTopOfBookGapMs: median(gaps),
      p90TopOfBookGapMs: percentile(sortedGaps, 90),
      maxTopOfBookGapMs: sortedGaps.length > 0 ? sortedGaps[sortedGaps.length - 1]! : null,
    },
    bookState: {
      validBookShare: roundShare(validCount, topOfBookRecords.length),
      gapDetectedShare: roundShare(gapDetectedCount, topOfBookRecords.length),
      sequenceGapCount: captureHealth?.orderbook?.sequenceGapCount ?? null,
      outOfOrderCount: captureHealth?.orderbook?.outOfOrderCount ?? null,
      reconnectCount:
        (captureHealth as { connection?: { reconnectCount?: number } } | null)?.connection
          ?.reconnectCount
        ?? captureHealth?.orderbook?.reconnectCount
        ?? null,
    },
    spread: {
      nonZeroSpreadShare: roundShare(nonZeroSpreadCount, topOfBookRecords.length),
      zeroSpreadShare: roundShare(zeroSpreadCount, topOfBookRecords.length),
      crossedOrInvertedBookCount: crossedCount,
      missingBidOrAskShare: roundShare(missingBidAskCount, topOfBookRecords.length),
    },
    btcJoin: {
      btcSpotRequested,
      btcSpotRecordCount: btcSpotRecords.length,
      joinCoverageShare:
        topOfBookRecords.length > 0 && btcSpotRecords.length > 0
          ? roundShare(joinHits, topOfBookRecords.length)
          : btcSpotRequested
            ? roundShare(0, Math.max(topOfBookRecords.length, 1))
            : null,
      medianKalshiToBtcDistanceMs: median(joinDistances),
      p90KalshiToBtcDistanceMs: percentile(sortedJoinDistances, 90),
    },
    segments: {
      marketTicker: toSegmentMap(marketGroups),
      eventTicker: toSegmentMap(eventGroups),
      hour: toSegmentMap(hourGroups),
      bookState: toSegmentMap(bookStateGroups),
    },
  };
}
