import { describe, expect, it } from "vitest";

import { valueFitsBucket } from "@/lib/data/research/dimensions/bucketDefinitions";

import { computeResearchObservationMomentumPercent } from "./computeResearchObservationMomentumPercent";
import { MOMENTUM_BUCKET_DEFINITIONS } from "./momentumBucketDefinitions";
import {
  DEFAULT_RESEARCH_MOMENTUM_LOOKBACK_BARS,
  MOMENTUM_MODERATE_THRESHOLD_PERCENT,
  MOMENTUM_STRONG_THRESHOLD_PERCENT,
} from "./momentumResearchTypes";

describe("momentum bucket definitions", () => {
  it("defines five ordered buckets with moderate and strong thresholds", () => {
    expect(MOMENTUM_BUCKET_DEFINITIONS).toHaveLength(5);
    expect(MOMENTUM_BUCKET_DEFINITIONS.map((bucket) => bucket.bucketId)).toEqual([
      "momentum-strong-down",
      "momentum-moderate-down",
      "momentum-flat",
      "momentum-moderate-up",
      "momentum-strong-up",
    ]);
    expect(MOMENTUM_MODERATE_THRESHOLD_PERCENT).toBe(0.15);
    expect(MOMENTUM_STRONG_THRESHOLD_PERCENT).toBe(0.5);
  });

  it("classifies representative momentum values into buckets", () => {
    const byValue = (value: number) =>
      MOMENTUM_BUCKET_DEFINITIONS.find((definition) =>
        valueFitsBucket(value, definition),
      )?.bucketId;

    expect(byValue(-0.75)).toBe("momentum-strong-down");
    expect(byValue(-0.25)).toBe("momentum-moderate-down");
    expect(byValue(0)).toBe("momentum-flat");
    expect(byValue(0.25)).toBe("momentum-moderate-up");
    expect(byValue(0.75)).toBe("momentum-strong-up");
  });
});

describe("computeResearchObservationMomentumPercent", () => {
  it("reuses trading-layer momentum over a 15-bar window", () => {
    const candles = Array.from({ length: DEFAULT_RESEARCH_MOMENTUM_LOOKBACK_BARS }, (_, index) => ({
      timestamp: index * 60_000,
      open: 100 + index,
      high: 100 + index,
      low: 100 + index,
      close: 100 + index,
    }));

    const momentum = computeResearchObservationMomentumPercent(candles);
    expect(momentum).toBeCloseTo(14 / 100 * 100, 4);
  });

  it("returns null when candle history is shorter than the lookback", () => {
    expect(
      computeResearchObservationMomentumPercent([
        { timestamp: 0, open: 100, high: 100, low: 100, close: 100 },
      ]),
    ).toBeNull();
  });
});
