import type { EvaluationCandleSnapshot } from "@/types/domain/trading";

import type { BtcSpotPoint } from "../btcKalshiLeadLagAnalysis/causalBtcJoin";
import { findLastBtcAtOrBefore } from "../btcKalshiLeadLagAnalysis/causalBtcJoin";

/** Builds 1-minute BTC candles using only samples at or before timestampMs. */
export function buildBtcCandlesUpToTimestamp(input: {
  points: readonly BtcSpotPoint[];
  timestampMs: number;
  barIntervalMs: number;
}): EvaluationCandleSnapshot[] {
  if (input.points.length === 0) {
    return [];
  }

  const endIndex = input.points.findIndex((point) => point.timestampMs > input.timestampMs);
  const slice = endIndex === -1 ? input.points : input.points.slice(0, endIndex);
  if (slice.length === 0) {
    return [];
  }

  const candles: EvaluationCandleSnapshot[] = [];
  let bucketStart = Math.floor(slice[0]!.timestampMs / input.barIntervalMs) * input.barIntervalMs;
  let open = slice[0]!.priceUsd;
  let high = open;
  let low = open;
  let close = open;

  for (const point of slice) {
    const bucket = Math.floor(point.timestampMs / input.barIntervalMs) * input.barIntervalMs;
    if (bucket !== bucketStart) {
      candles.push({
        timestamp: bucketStart,
        open,
        high,
        low,
        close,
      });
      bucketStart = bucket;
      open = point.priceUsd;
      high = point.priceUsd;
      low = point.priceUsd;
      close = point.priceUsd;
      continue;
    }

    high = Math.max(high, point.priceUsd);
    low = Math.min(low, point.priceUsd);
    close = point.priceUsd;
  }

  candles.push({
    timestamp: bucketStart,
    open,
    high,
    low,
    close,
  });

  return candles;
}

export function resolveCausalBtcPrice(
  points: readonly BtcSpotPoint[],
  timestampMs: number,
  maximumJoinAgeMs: number,
): { priceUsd: number | null; joined: boolean; stale: boolean } {
  const sample = findLastBtcAtOrBefore(points, timestampMs);
  if (!sample) {
    return { priceUsd: null, joined: false, stale: false };
  }
  const ageMs = timestampMs - sample.timestampMs;
  if (ageMs > maximumJoinAgeMs) {
    return { priceUsd: null, joined: false, stale: true };
  }
  return { priceUsd: sample.priceUsd, joined: true, stale: false };
}
