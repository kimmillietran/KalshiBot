import type { BtcKalshiLeadLagAnalysisIo } from "./btcKalshiLeadLagAnalysisTypes";
import { joinPath, parseIsoTimestampMs, readNumber, readString } from "./leadLagUtils";

export type BtcSpotPoint = {
  timestampMs: number;
  receivedAtLocal: string;
  priceUsd: number;
};

export function findLastBtcAtOrBefore(
  points: readonly BtcSpotPoint[],
  timestampMs: number,
): BtcSpotPoint | null {
  if (points.length === 0) {
    return null;
  }

  let left = 0;
  let right = points.length - 1;
  let result: BtcSpotPoint | null = null;

  while (left <= right) {
    const middle = Math.floor((left + right) / 2);
    const point = points[middle]!;
    if (point.timestampMs <= timestampMs) {
      result = point;
      left = middle + 1;
    } else {
      right = middle - 1;
    }
  }

  return result;
}

export function findFirstBtcAtOrAfter(
  points: readonly BtcSpotPoint[],
  timestampMs: number,
): BtcSpotPoint | null {
  for (const point of points) {
    if (point.timestampMs >= timestampMs) {
      return point;
    }
  }
  return null;
}

export function joinBtcCausally(
  points: readonly BtcSpotPoint[],
  kalshiTimestampMs: number,
  maximumJoinAgeMs: number,
): {
  priceUsd: number | null;
  sampleAgeMs: number | null;
  joined: boolean;
  stale: boolean;
} {
  const sample = findLastBtcAtOrBefore(points, kalshiTimestampMs);
  if (!sample) {
    return { priceUsd: null, sampleAgeMs: null, joined: false, stale: false };
  }

  const sampleAgeMs = kalshiTimestampMs - sample.timestampMs;
  if (sampleAgeMs > maximumJoinAgeMs) {
    return { priceUsd: null, sampleAgeMs, joined: false, stale: true };
  }

  return { priceUsd: sample.priceUsd, sampleAgeMs, joined: true, stale: false };
}

export async function preloadBtcSpotSeries(
  io: BtcKalshiLeadLagAnalysisIo,
  captureRunDir: string,
): Promise<{ points: BtcSpotPoint[]; recordsScanned: number }> {
  const points: BtcSpotPoint[] = [];
  let recordsScanned = 0;
  const path = joinPath(captureRunDir, "btc-spot.jsonl");

  await io.iterateJsonl(path, {
    onLine: (line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return "skip";
      }

      recordsScanned += 1;
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(trimmed) as Record<string, unknown>;
      } catch {
        return "skip";
      }

      const receivedAtLocal = readString(parsed.receivedAtLocal);
      const receivedAtMs = receivedAtLocal ? parseIsoTimestampMs(receivedAtLocal) : null;
      const exchangeTimestampMs = readNumber(parsed.exchangeTimestampMs);
      const priceUsd = readNumber(parsed.priceUsd);
      if (receivedAtMs === null || priceUsd === null || priceUsd <= 0 || receivedAtLocal === null) {
        return "skip";
      }

      points.push({
        timestampMs: exchangeTimestampMs ?? receivedAtMs,
        receivedAtLocal,
        priceUsd,
      });
      return "continue";
    },
  });

  points.sort((left, right) => left.timestampMs - right.timestampMs);
  return { points, recordsScanned };
}

export function countBtcSamplesBetween(
  points: readonly BtcSpotPoint[],
  startMs: number,
  endMs: number,
): { sampleCount: number; maximumInternalSampleGapMs: number } {
  if (endMs < startMs) {
    return { sampleCount: 0, maximumInternalSampleGapMs: 0 };
  }

  let sampleCount = 0;
  let maximumInternalSampleGapMs = 0;
  let previousTimestampMs: number | null = null;

  for (const point of points) {
    if (point.timestampMs < startMs) {
      continue;
    }
    if (point.timestampMs > endMs) {
      break;
    }
    sampleCount += 1;
    if (previousTimestampMs !== null) {
      maximumInternalSampleGapMs = Math.max(
        maximumInternalSampleGapMs,
        point.timestampMs - previousTimestampMs,
      );
    }
    previousTimestampMs = point.timestampMs;
  }

  return { sampleCount, maximumInternalSampleGapMs };
}
