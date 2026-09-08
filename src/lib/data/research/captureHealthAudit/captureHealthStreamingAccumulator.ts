import type {
  CaptureHealthAuditConfig,
  CaptureSegmentMetrics,
  ParsedBtcSpotRecord,
  ParsedTopOfBookRecord,
} from "./captureHealthAuditTypes";
import {
  findNearestBtcDistanceMsIndexed,
  indexBtcTimestampsForNearestLookup,
  resolveKalshiTimestampMs,
  roundShare,
  type IndexedBtcTimestamp,
} from "./captureHealthAuditUtils";
import type { ComputedCaptureMetrics } from "./computeCaptureHealthMetrics";
import {
  continuityFromTimestamps,
  GrowableFloat64Array,
  medianFromUnsorted,
  medianGapFromTimestamps,
  percentileSorted,
} from "./growableFloat64Array";
import type { LoadedCaptureHealthJson } from "./loadCaptureRunArtifacts";
import {
  isCrossedOrInverted,
  isMissingBidOrAsk,
  isZeroSpread,
  segmentKey,
} from "./parseCaptureHealthRecords";

/**
 * Memory model (canonical 8h / ~11.25M TOB rows):
 *
 * OLD: O(N × ParsedTopOfBookRecord) plus multiple duplicated O(N) JS arrays
 *      and full-record group maps (market/event/hour/bookState).
 *
 * NEW: O(unique segment keys) counters
 *      + O(BTC records) for nearest-join lookup
 *      + compact Float64 timestamp/distance buffers that scale with N
 *
 * Remaining O(N) state is typed-array scalars only:
 *   global receivedAtMs          ≈ 90 MB
 *   4 segment timestamp buffers  ≈ 360 MB total (each row belongs to one key/dimension)
 *   BTC join distances           ≈ 90 MB
 * Peak during sort/copy stays well under a normal Node heap (~0.7 GB).
 *
 * No ParsedTopOfBookRecord[] is retained. Each parsed row is discarded after add().
 */
export type CaptureHealthAccumulatorDiagnostics = {
  retainedParsedRecordCount: number;
  globalTimestampCount: number;
  joinDistanceCount: number;
  segmentKeyCounts: {
    marketTicker: number;
    eventTicker: number;
    hour: number;
    bookState: number;
  };
  segmentTimestampCounts: {
    marketTicker: number;
    eventTicker: number;
    hour: number;
    bookState: number;
  };
};

type SegmentAccumulator = {
  recordCount: number;
  validCount: number;
  zeroSpreadCount: number;
  timestamps: GrowableFloat64Array;
};

export class CaptureHealthAccumulator {
  private readonly config: CaptureHealthAuditConfig;
  private readonly captureHealth: LoadedCaptureHealthJson | null;
  private readonly btcSpotRecordCount: number;
  private readonly btcSpotRequested: boolean;
  private readonly sortedBtc: IndexedBtcTimestamp[];

  private topOfBookCount = 0;
  private validCount = 0;
  private gapDetectedCount = 0;
  private zeroSpreadCount = 0;
  private crossedCount = 0;
  private missingBidAskCount = 0;
  private joinHits = 0;

  private minReceivedAtMs: number | null = null;
  private maxReceivedAtMs: number | null = null;
  private firstTimestamp: string | null = null;
  private lastTimestamp: string | null = null;

  private readonly marketTickers = new Set<string>();
  private readonly eventTickers = new Set<string>();

  private readonly timestamps = new GrowableFloat64Array();
  private readonly joinDistances = new GrowableFloat64Array();

  private readonly byMarket = new Map<string, SegmentAccumulator>();
  private readonly byEvent = new Map<string, SegmentAccumulator>();
  private readonly byHour = new Map<string, SegmentAccumulator>();
  private readonly byBookState = new Map<string, SegmentAccumulator>();

  constructor(input: {
    config: CaptureHealthAuditConfig;
    btcSpotRecords: readonly ParsedBtcSpotRecord[];
    captureHealth: LoadedCaptureHealthJson | null;
  }) {
    this.config = input.config;
    this.captureHealth = input.captureHealth;
    this.btcSpotRecordCount = input.btcSpotRecords.length;
    this.btcSpotRequested = resolveBtcSpotRequested(input.captureHealth, input.btcSpotRecords);
    this.sortedBtc = indexBtcTimestampsForNearestLookup(
      input.btcSpotRecords.map((record) => record.exchangeTimestampMs ?? record.receivedAtMs),
    );
  }

  add(record: ParsedTopOfBookRecord): void {
    this.topOfBookCount += 1;
    this.timestamps.push(record.receivedAtMs);

    if (record.bookState === "valid") {
      this.validCount += 1;
    }
    if (record.bookState === "gap-detected") {
      this.gapDetectedCount += 1;
    }
    if (isZeroSpread(record)) {
      this.zeroSpreadCount += 1;
    }
    if (isCrossedOrInverted(record)) {
      this.crossedCount += 1;
    }
    if (isMissingBidOrAsk(record)) {
      this.missingBidAskCount += 1;
    }

    this.marketTickers.add(record.marketTicker);
    if (record.eventTicker !== null) {
      this.eventTickers.add(record.eventTicker);
    }

    if (this.minReceivedAtMs === null || record.receivedAtMs < this.minReceivedAtMs) {
      this.minReceivedAtMs = record.receivedAtMs;
      this.firstTimestamp = record.receivedAtLocal;
    }
    if (this.maxReceivedAtMs === null || record.receivedAtMs > this.maxReceivedAtMs) {
      this.maxReceivedAtMs = record.receivedAtMs;
      this.lastTimestamp = record.receivedAtLocal;
    }

    addToSegment(this.byMarket, record.marketTicker, record);
    addToSegment(this.byEvent, segmentKey(record.eventTicker), record);
    addToSegment(this.byHour, record.hourBucket, record);
    addToSegment(this.byBookState, record.bookState, record);

    const distance = findNearestBtcDistanceMsIndexed(
      resolveKalshiTimestampMs(record),
      this.sortedBtc,
    );
    if (distance === null) {
      return;
    }
    this.joinDistances.push(distance);
    if (distance <= this.config.thresholds.btcJoinMaxDistanceMs) {
      this.joinHits += 1;
    }
  }

  get topOfBookRecordCount(): number {
    return this.topOfBookCount;
  }

  diagnostics(): CaptureHealthAccumulatorDiagnostics {
    return {
      retainedParsedRecordCount: 0,
      globalTimestampCount: this.timestamps.length,
      joinDistanceCount: this.joinDistances.length,
      segmentKeyCounts: {
        marketTicker: this.byMarket.size,
        eventTicker: this.byEvent.size,
        hour: this.byHour.size,
        bookState: this.byBookState.size,
      },
      segmentTimestampCounts: {
        marketTicker: countSegmentTimestamps(this.byMarket),
        eventTicker: countSegmentTimestamps(this.byEvent),
        hour: countSegmentTimestamps(this.byHour),
        bookState: countSegmentTimestamps(this.byBookState),
      },
    };
  }

  finalize(): ComputedCaptureMetrics {
    const continuity = continuityFromTimestamps(this.timestamps.snapshot());
    const joinSnapshot = this.joinDistances.snapshot();
    const sortedJoinDistances = joinSnapshot.slice();
    sortedJoinDistances.sort();

    return {
      runDurationSeconds: resolveRunDurationSeconds({
        topOfBookCount: this.topOfBookCount,
        minReceivedAtMs: this.minReceivedAtMs,
        maxReceivedAtMs: this.maxReceivedAtMs,
        captureHealth: this.captureHealth,
      }),
      firstTimestamp: this.firstTimestamp,
      lastTimestamp: this.lastTimestamp,
      marketsCovered: this.marketTickers.size,
      eventTickersCovered: this.eventTickers.size,
      continuity,
      bookState: {
        validBookShare: roundShare(this.validCount, this.topOfBookCount),
        gapDetectedShare: roundShare(this.gapDetectedCount, this.topOfBookCount),
        sequenceGapCount: this.captureHealth?.orderbook?.sequenceGapCount ?? null,
        outOfOrderCount: this.captureHealth?.orderbook?.outOfOrderCount ?? null,
        reconnectCount:
          (this.captureHealth as { connection?: { reconnectCount?: number } } | null)?.connection
            ?.reconnectCount
          ?? this.captureHealth?.orderbook?.reconnectCount
          ?? null,
      },
      spread: {
        nonZeroSpreadShare: roundShare(
          this.topOfBookCount - this.zeroSpreadCount,
          this.topOfBookCount,
        ),
        zeroSpreadShare: roundShare(this.zeroSpreadCount, this.topOfBookCount),
        crossedOrInvertedBookCount: this.crossedCount,
        missingBidOrAskShare: roundShare(this.missingBidAskCount, this.topOfBookCount),
      },
      btcJoin: {
        btcSpotRequested: this.btcSpotRequested,
        btcSpotRecordCount: this.btcSpotRecordCount,
        joinCoverageShare:
          this.topOfBookCount > 0 && this.btcSpotRecordCount > 0
            ? roundShare(this.joinHits, this.topOfBookCount)
            : this.btcSpotRequested
              ? roundShare(0, Math.max(this.topOfBookCount, 1))
              : null,
        medianKalshiToBtcDistanceMs: medianFromUnsorted(joinSnapshot),
        p90KalshiToBtcDistanceMs: percentileSorted(sortedJoinDistances, 90),
      },
      segments: {
        marketTicker: finalizeSegments(this.byMarket),
        eventTicker: finalizeSegments(this.byEvent),
        hour: finalizeSegments(this.byHour),
        bookState: finalizeSegments(this.byBookState),
      },
    };
  }
}

export function createCaptureHealthAccumulator(input: {
  config: CaptureHealthAuditConfig;
  btcSpotRecords: readonly ParsedBtcSpotRecord[];
  captureHealth: LoadedCaptureHealthJson | null;
}): CaptureHealthAccumulator {
  return new CaptureHealthAccumulator(input);
}

function createSegmentAccumulator(): SegmentAccumulator {
  return {
    recordCount: 0,
    validCount: 0,
    zeroSpreadCount: 0,
    timestamps: new GrowableFloat64Array(),
  };
}

function addToSegment(
  groups: Map<string, SegmentAccumulator>,
  key: string,
  record: ParsedTopOfBookRecord,
): void {
  const segment = groups.get(key) ?? createSegmentAccumulator();
  segment.recordCount += 1;
  if (record.bookState === "valid") {
    segment.validCount += 1;
  }
  if (isZeroSpread(record)) {
    segment.zeroSpreadCount += 1;
  }
  segment.timestamps.push(record.receivedAtMs);
  groups.set(key, segment);
}

function finalizeSegments(
  groups: Map<string, SegmentAccumulator>,
): Record<string, CaptureSegmentMetrics> {
  const result: Record<string, CaptureSegmentMetrics> = {};
  for (const [key, segment] of groups) {
    result[key] = {
      recordCount: segment.recordCount,
      validBookShare: roundShare(segment.validCount, segment.recordCount),
      zeroSpreadShare: roundShare(segment.zeroSpreadCount, segment.recordCount),
      medianGapMs: medianGapFromTimestamps(segment.timestamps.snapshot()),
    };
  }
  return result;
}

function countSegmentTimestamps(groups: Map<string, SegmentAccumulator>): number {
  let count = 0;
  for (const segment of groups.values()) {
    count += segment.timestamps.length;
  }
  return count;
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
  topOfBookCount: number;
  minReceivedAtMs: number | null;
  maxReceivedAtMs: number | null;
  captureHealth: LoadedCaptureHealthJson | null;
}): number | null {
  if (typeof input.captureHealth?.config?.durationSeconds === "number") {
    return input.captureHealth.config.durationSeconds;
  }

  if (input.topOfBookCount < 2) {
    if (input.topOfBookCount === 1) {
      return 0;
    }
    return null;
  }

  if (input.minReceivedAtMs === null || input.maxReceivedAtMs === null) {
    return null;
  }

  return Math.max(0, Math.round((input.maxReceivedAtMs - input.minReceivedAtMs) / 1000));
}
