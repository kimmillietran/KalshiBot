import type {
  BtcMagnitudeBin,
  BtcReturnHorizonMs,
} from "./btcKalshiLeadLagAnalysisTypes";
import type { BtcSpotPoint } from "./causalBtcJoin";
import { computeBtcReturnAtTime } from "./computeBtcReturns";
import {
  crossedMagnitudeBoundary,
  MAGNITUDE_BOUNDARIES_BPS,
  magnitudeBoundaryForBin,
  resolveBtcMagnitudeBin,
} from "./leadLagBins";

export type DetectedBtcTrigger = {
  triggerId: string;
  triggerTimestampMs: number;
  triggerTimestamp: string;
  horizonMs: BtcReturnHorizonMs;
  btcReturnBps: number;
  absoluteBtcReturnBps: number;
  btcDirection: "up" | "down" | "flat";
  btcMagnitudeBin: BtcMagnitudeBin;
  btcPriceAtTrigger: number;
  boundaryBps: number;
};

type CooldownState = Map<string, number>;

export function detectBtcTriggers(input: {
  points: readonly BtcSpotPoint[];
  horizonsMs: readonly BtcReturnHorizonMs[];
  triggerCooldownMs: number;
}): { triggers: DetectedBtcTrigger[]; suppressedOverlappingTriggerCount: number } {
  const triggers: DetectedBtcTrigger[] = [];
  const cooldownByHorizon: CooldownState = new Map();
  let suppressedOverlappingTriggerCount = 0;
  let triggerCounter = 0;

  const previousAbsoluteByHorizon = new Map<BtcReturnHorizonMs, number>();

  for (const point of input.points) {
    for (const horizonMs of input.horizonsMs) {
      const features = computeBtcReturnAtTime(input.points, point.timestampMs, horizonMs);
      if (!features) {
        continue;
      }

      const previousAbsolute = previousAbsoluteByHorizon.get(horizonMs) ?? 0;
      previousAbsoluteByHorizon.set(horizonMs, features.absoluteBtcReturnBps);

      for (const boundaryBps of MAGNITUDE_BOUNDARIES_BPS) {
        if (!crossedMagnitudeBoundary(previousAbsolute, features.absoluteBtcReturnBps, boundaryBps)) {
          continue;
        }

        const cooldownKey = `${horizonMs}:${boundaryBps}`;
        const lastTriggerMs = cooldownByHorizon.get(cooldownKey) ?? Number.NEGATIVE_INFINITY;
        if (point.timestampMs - lastTriggerMs < input.triggerCooldownMs) {
          suppressedOverlappingTriggerCount += 1;
          continue;
        }

        cooldownByHorizon.set(cooldownKey, point.timestampMs);
        const magnitudeBin = resolveBtcMagnitudeBin(features.absoluteBtcReturnBps);
        triggerCounter += 1;
        triggers.push({
          triggerId: `btc-trigger-${triggerCounter}`,
          triggerTimestampMs: point.timestampMs,
          triggerTimestamp: point.receivedAtLocal,
          horizonMs,
          btcReturnBps: features.btcReturnBps,
          absoluteBtcReturnBps: features.absoluteBtcReturnBps,
          btcDirection: features.btcDirection,
          btcMagnitudeBin: magnitudeBin,
          btcPriceAtTrigger: features.btcEndPrice,
          boundaryBps: magnitudeBoundaryForBin(magnitudeBin),
        });
      }
    }
  }

  return { triggers, suppressedOverlappingTriggerCount };
}
