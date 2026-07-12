import type { BtcReturnFeatures, BtcReturnHorizonMs } from "./btcKalshiLeadLagAnalysisTypes";
import type { BtcSpotPoint } from "./causalBtcJoin";
import { findLastBtcAtOrBefore, countBtcSamplesBetween } from "./causalBtcJoin";
import { basisPointsChange, resolveBtcDirection } from "./leadLagUtils";

export function computeBtcReturnAtTime(
  points: readonly BtcSpotPoint[],
  endTimestampMs: number,
  horizonMs: BtcReturnHorizonMs,
): BtcReturnFeatures | null {
  const endPoint = findLastBtcAtOrBefore(points, endTimestampMs);
  if (!endPoint) {
    return null;
  }

  const startPoint = findLastBtcAtOrBefore(points, endTimestampMs - horizonMs);
  if (!startPoint || startPoint.timestampMs >= endPoint.timestampMs) {
    return null;
  }

  const btcReturnBps = basisPointsChange(startPoint.priceUsd, endPoint.priceUsd);
  const { sampleCount, maximumInternalSampleGapMs } = countBtcSamplesBetween(
    points,
    startPoint.timestampMs,
    endPoint.timestampMs,
  );

  return {
    horizonMs,
    btcReturnBps,
    absoluteBtcReturnBps: Math.abs(btcReturnBps),
    btcDirection: resolveBtcDirection(btcReturnBps),
    btcStartPrice: startPoint.priceUsd,
    btcEndPrice: endPoint.priceUsd,
    actualHorizonMs: endPoint.timestampMs - startPoint.timestampMs,
    sampleCount,
    maximumInternalSampleGapMs,
  };
}
