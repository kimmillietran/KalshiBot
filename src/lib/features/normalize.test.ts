import { describe, expect, it } from "vitest";

import {
  clamp01,
  clampSigned,
  normalizeSigned,
  normalizeToUnit,
  stableMean,
  stableStdDev,
} from "./normalize";

describe("normalize", () => {
  it("normalizes values into stable 0-1 range", () => {
    expect(normalizeToUnit(5, 0, 10)).toBe(0.5);
    expect(normalizeToUnit(-5, 0, 10)).toBe(0);
    expect(normalizeToUnit(15, 0, 10)).toBe(1);
  });

  it("returns 0 when min equals max", () => {
    expect(normalizeToUnit(42, 10, 10)).toBe(0);
  });

  it("normalizes signed values with stable bounds", () => {
    expect(normalizeSigned(50, 100)).toBe(0.5);
    expect(normalizeSigned(-100, 100)).toBe(-1);
    expect(normalizeSigned(200, 100)).toBe(1);
  });

  it("clamps helper outputs", () => {
    expect(clamp01(1.5)).toBe(1);
    expect(clampSigned(2)).toBe(1);
  });

  it("computes stable mean and std dev", () => {
    expect(stableMean([2, 4, 6])).toBe(4);
    expect(stableStdDev([2, 4, 6])).toBeCloseTo(1.632, 2);
    expect(stableStdDev([5])).toBe(0);
  });
});
