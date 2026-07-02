import { describe, expect, it } from "vitest";

import {
  computeActionBuckets,
  computeYesMidBuckets,
} from "./computeAttributionBucketMetrics";
import { MIN_ATTRIBUTION_SAMPLE_SIZE } from "./decisionTraceAttributionTypes";
import type { AttributionObservation } from "./decisionTraceAttributionTypes";

function createObservation(
  overrides: Partial<AttributionObservation> = {},
): AttributionObservation {
  return {
    strategyId: "simple-momentum",
    seriesTicker: "KXBTC15M",
    marketTicker: "KXBTC15M-MARKET-A",
    tracePath: "data/research-results/simple-momentum/KXBTC15M/MARKET-A/decision-trace.json",
    candleIndex: 0,
    action: "buy_yes",
    yesMidBucketId: "yes-mid-mid",
    yesMidBucketLabel: "34-66 cents",
    timeRemainingBucketId: "time-5-15m",
    timeRemainingBucketLabel: "5-15 minutes remaining",
    btcReturnBucketId: "btc-return-up",
    btcReturnBucketLabel: ">= 0.5%",
    regimeTagBucketId: "unknown",
    regimeTagBucketLabel: "Unknown / unavailable",
    pnlCents: 100,
    fillPriceCents: 50,
    isWin: true,
    ...overrides,
  };
}

describe("computeActionBuckets", () => {
  it("aggregates count, average PnL, win rate, and fill price per action bucket", () => {
    const buckets = computeActionBuckets([
      createObservation({ action: "buy_yes", pnlCents: 100, fillPriceCents: 50, isWin: true }),
      createObservation({ action: "buy_yes", pnlCents: -40, fillPriceCents: 60, isWin: false }),
      createObservation({ action: "buy_no", pnlCents: 20, fillPriceCents: 45, isWin: true }),
    ]);

    expect(buckets.map((bucket) => bucket.bucketId)).toEqual(["buy_no", "buy_yes"]);
    expect(buckets[1]).toMatchObject({
      bucketId: "buy_yes",
      count: 2,
      averagePnlCents: 30,
      winRatePct: 50,
      averageFillPriceCents: 55,
    });
  });

  it("adds sparse-sample warnings when count is below the minimum", () => {
    const buckets = computeYesMidBuckets([
      createObservation({ yesMidBucketId: "yes-mid-low", yesMidBucketLabel: "0-33 cents" }),
    ]);

    expect(buckets[0]?.count).toBe(1);
    expect(buckets[0]?.warnings[0]).toContain(
      `minimum recommended is ${MIN_ATTRIBUTION_SAMPLE_SIZE}`,
    );
  });
});
