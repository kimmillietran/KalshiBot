import { describe, expect, it } from "vitest";

import { averageFinite, percentile, quantile } from "./stats";

describe("stats utilities", () => {
  it("computes averageFinite with null on empty input", () => {
    expect(averageFinite([])).toBeNull();
    expect(averageFinite([2, 4, 6])).toBe(4);
  });

  it("computes quantile on sorted values", () => {
    expect(quantile([10, 20, 30, 40], 0.5)).toBe(25);
    expect(quantile([10], 0.5)).toBe(10);
    expect(quantile([], 0.5)).toBe(0);
  });

  it("matches deterministicSampling percentile scale", () => {
    expect(percentile([10, 20, 30, 40], 50)).toBe(25);
    expect(percentile([10, 20, 30, 40], 0)).toBe(10);
  });
});
