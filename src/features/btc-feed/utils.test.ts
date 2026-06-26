import { describe, expect, it } from "vitest";

import { BTC_STALE_THRESHOLD_MS } from "./constants";
import {
  calculateDistanceFromTarget,
  calculatePriceChangeDirection,
  formatSignedDistance,
  isFeedStale,
  mergeLivePriceIntoChart,
} from "./utils";

describe("calculateDistanceFromTarget", () => {
  it("returns positive distance when price is above target", () => {
    const result = calculateDistanceFromTarget(64300, 64225);
    expect(result.distance).toBe(75);
    expect(result.percent).toBeCloseTo(0.1168, 3);
  });

  it("returns negative distance when price is below target", () => {
    const result = calculateDistanceFromTarget(64200, 64225);
    expect(result.distance).toBe(-25);
  });
});

describe("calculatePriceChangeDirection", () => {
  it("returns flat when previous is null", () => {
    expect(calculatePriceChangeDirection(null, 100)).toBe("flat");
  });

  it("returns up when price increases", () => {
    expect(calculatePriceChangeDirection(100, 101)).toBe("up");
  });

  it("returns down when price decreases", () => {
    expect(calculatePriceChangeDirection(100, 99)).toBe("down");
  });

  it("returns flat when price is unchanged", () => {
    expect(calculatePriceChangeDirection(100, 100)).toBe("flat");
  });
});

describe("isFeedStale", () => {
  it("returns false when there is no last update", () => {
    expect(isFeedStale(null)).toBe(false);
  });

  it("returns false when update is within threshold", () => {
    const now = Date.now();
    const last = new Date(now - BTC_STALE_THRESHOLD_MS + 1000);
    expect(isFeedStale(last, now)).toBe(false);
  });

  it("returns true when update exceeds threshold", () => {
    const now = Date.now();
    const last = new Date(now - BTC_STALE_THRESHOLD_MS - 1);
    expect(isFeedStale(last, now)).toBe(true);
  });
});

describe("mergeLivePriceIntoChart", () => {
  it("creates first point when chart is empty", () => {
    const points = mergeLivePriceIntoChart([], 64250, new Date("2026-01-01T12:30:00"));
    expect(points).toHaveLength(1);
    expect(points[0].price).toBe(64250);
  });
});

describe("formatSignedDistance", () => {
  it("prefixes positive distances with plus", () => {
    expect(formatSignedDistance(25.32)).toBe("+25.32");
  });
});
