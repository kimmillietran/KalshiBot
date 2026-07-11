import type { ParsedTopOfBookRecord } from "@/lib/data/research/captureHealthAudit/captureHealthAuditTypes";
import type { LoadedCaptureHealthJson } from "@/lib/data/research/captureHealthAudit/loadCaptureRunArtifacts";
import { documentCounterSemantics } from "./documentCounterSemantics";
import type {
  CaptureHealthReconciliationConfig,
  CaptureHealthReconciliationIo,
  ConnectionAttributionSummary,
  SuspensionInterval,
  TimelineBucketCounters,
} from "./captureHealthReconciliationTypes";

function bucketKey(timestampMs: number, bucketMs: number): number {
  return Math.floor(timestampMs / bucketMs) * bucketMs;
}

function bucketIso(bucketStartMs: number, bucketMs: number): { start: string; end: string } {
  return {
    start: new Date(bucketStartMs).toISOString(),
    end: new Date(bucketStartMs + bucketMs).toISOString(),
  };
}

function isInsideSuspension(
  timestampMs: number,
  intervals: readonly SuspensionInterval[],
): boolean {
  return intervals.some((interval) => {
    const startMs = Date.parse(interval.startedAt);
    const endMs = Date.parse(interval.endedAt);
    return timestampMs >= startMs && timestampMs <= endMs;
  });
}

function createEmptyBucket(bucketStartMs: number, bucketMs: number): TimelineBucketCounters {
  const { start, end } = bucketIso(bucketStartMs, bucketMs);
  return {
    bucketStart: start,
    bucketEnd: end,
    btcHeartbeatCount: 0,
    topOfBookCount: 0,
    rawWsMessageCount: 0,
    gapDetectedTopOfBookCount: 0,
    validTopOfBookCount: 0,
    sequenceGapTopOfBookProxyCount: 0,
    suspectedSuspension: false,
    classification: "unknown",
  };
}

function classifyBucket(bucket: TimelineBucketCounters): TimelineBucketCounters["classification"] {
  if (bucket.suspectedSuspension) {
    return "blind";
  }

  if (bucket.topOfBookCount === 0) {
    return "unknown";
  }

  const validShare = bucket.validTopOfBookCount / bucket.topOfBookCount;
  if (validShare >= 0.9 && bucket.gapDetectedTopOfBookCount === 0) {
    return "usable";
  }

  if (validShare >= 0.5) {
    return "degraded";
  }

  return "blind";
}

function countSequenceGapEpisodes(records: readonly ParsedTopOfBookRecord[]): number {
  let episodes = 0;
  let inEpisode = false;

  for (const record of records) {
    if (record.bookState === "gap-detected") {
      if (!inEpisode) {
        episodes += 1;
        inEpisode = true;
      }
      continue;
    }

    inEpisode = false;
  }

  return episodes;
}

function parseIntervalMs(interval: SuspensionInterval): { startMs: number; endMs: number } | null {
  const startMs = Date.parse(interval.startedAt);
  const endMs = Date.parse(interval.endedAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return null;
  }

  return { startMs, endMs };
}

/** Attributes connection events and builds timeline buckets for a selected run. */
export async function attributeConnectionEvents(input: {
  io: CaptureHealthReconciliationIo;
  config: CaptureHealthReconciliationConfig;
  topOfBookRecords: readonly ParsedTopOfBookRecord[];
  captureHealth: LoadedCaptureHealthJson | null;
  rawWsPath: string | null;
  btcSpotPath: string | null;
  suspensionIntervals: readonly SuspensionInterval[];
}): Promise<ConnectionAttributionSummary> {
  const bucketMap = new Map<number, TimelineBucketCounters>();
  const bucketMs = input.config.timelineBucketMs;

  const getBucket = (timestampMs: number): TimelineBucketCounters => {
    const key = bucketKey(timestampMs, bucketMs);
    const existing = bucketMap.get(key);
    if (existing) {
      return existing;
    }

    const created = createEmptyBucket(key, bucketMs);
    bucketMap.set(key, created);
    return created;
  };

  let eventsInsideSuspensionWindows = 0;
  let eventsOutsideSuspensionWindows = 0;

  for (const interval of input.suspensionIntervals) {
    const parsed = parseIntervalMs(interval);
    if (!parsed) {
      continue;
    }

    const firstBucketStartMs = bucketKey(parsed.startMs, bucketMs);
    const lastBucketStartMs = bucketKey(parsed.endMs, bucketMs);
    for (
      let bucketStartMs = firstBucketStartMs;
      bucketStartMs <= lastBucketStartMs;
      bucketStartMs += bucketMs
    ) {
      getBucket(bucketStartMs).suspectedSuspension = true;
    }
  }

  for (const record of input.topOfBookRecords) {
    const bucket = getBucket(record.receivedAtMs);
    bucket.topOfBookCount += 1;
    if (record.bookState === "valid") {
      bucket.validTopOfBookCount += 1;
    }
    if (record.bookState === "gap-detected") {
      bucket.gapDetectedTopOfBookCount += 1;
      bucket.sequenceGapTopOfBookProxyCount += 1;
    }

    if (isInsideSuspension(record.receivedAtMs, input.suspensionIntervals)) {
      bucket.suspectedSuspension = true;
      eventsInsideSuspensionWindows += 1;
    } else {
      eventsOutsideSuspensionWindows += 1;
    }
  }

  if (input.btcSpotPath && input.io.fileExists(input.btcSpotPath)) {
    await input.io.streamJsonl(input.btcSpotPath, {
      onLine: (line) => {
        try {
          const parsed = JSON.parse(line) as Record<string, unknown>;
          const receivedAtLocal =
            typeof parsed.receivedAtLocal === "string" ? parsed.receivedAtLocal : null;
          if (!receivedAtLocal) {
            return "skip";
          }
          const receivedAtMs = Date.parse(receivedAtLocal);
          if (!Number.isFinite(receivedAtMs)) {
            return "skip";
          }
          getBucket(receivedAtMs).btcHeartbeatCount += 1;
          return "continue";
        } catch {
          return "skip";
        }
      },
    });
  }

  if (input.rawWsPath && input.io.fileExists(input.rawWsPath)) {
    await input.io.streamJsonl(input.rawWsPath, {
      onLine: (line) => {
        try {
          const parsed = JSON.parse(line) as Record<string, unknown>;
          const receivedAtLocal =
            typeof parsed.receivedAtLocal === "string" ? parsed.receivedAtLocal : null;
          if (!receivedAtLocal) {
            return "continue";
          }
          const receivedAtMs = Date.parse(receivedAtLocal);
          if (!Number.isFinite(receivedAtMs)) {
            return "continue";
          }
          getBucket(receivedAtMs).rawWsMessageCount += 1;
          return "continue";
        } catch {
          return "skip";
        }
      },
    });
  }

  const timelineBuckets = [...bucketMap.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, bucket]) => ({
      ...bucket,
      classification: classifyBucket(bucket),
    }));

  const counterSemantics = documentCounterSemantics(input.captureHealth);
  const sequenceGapEpisodeCount = countSequenceGapEpisodes(input.topOfBookRecords);
  const sequenceGapSemantic = counterSemantics.find((item) => item.fieldName === "sequenceGapEpisodeCount");
  if (sequenceGapSemantic) {
    sequenceGapSemantic.reportedValue = sequenceGapEpisodeCount;
  }

  const health = input.captureHealth as {
    connection?: { reconnectCount?: number };
    orderbook?: { sequenceGapCount?: number; reconnectCount?: number };
  } | null;

  return {
    reconnectCount:
      health?.connection?.reconnectCount
      ?? health?.orderbook?.reconnectCount
      ?? null,
    sequenceGapCount: health?.orderbook?.sequenceGapCount ?? null,
    sequenceGapEpisodeCount,
    eventsInsideSuspensionWindows,
    eventsOutsideSuspensionWindows,
    timelineBuckets,
    counterSemantics,
  };
}
