import { describe, expect, it } from "vitest";

import {
  computeBenjaminiHochbergFdr,
  computeFamilyWiseAdjustedPValues,
} from "./computeMultipleTestingAdjustments";

describe("computeFamilyWiseAdjustedPValues", () => {
  it("applies Bonferroni and Holm corrections across multiple p-values", () => {
    const entries = [
      { strategyId: "beta", rawPValue: 0.04 },
      { strategyId: "alpha", rawPValue: 0.01 },
      { strategyId: "gamma", rawPValue: 0.2 },
    ];

    const adjusted = computeFamilyWiseAdjustedPValues(entries, 0.05);

    expect(adjusted.map((entry) => entry.strategyId)).toEqual([
      "alpha",
      "beta",
      "gamma",
    ]);
    expect(adjusted[0]?.bonferroniAdjustedPValue).toBeCloseTo(0.03, 5);
    expect(adjusted[0]?.rejectedBonferroni).toBe(true);
    expect(adjusted[0]?.rejectedHolm).toBe(true);
    expect(adjusted[1]?.rejectedHolm).toBe(false);
    expect(adjusted[2]?.rejectedBonferroni).toBe(false);
  });
});

describe("computeBenjaminiHochbergFdr", () => {
  it("applies Benjamini-Hochberg FDR adjustment in deterministic order", () => {
    const entries = [
      { strategyId: "charlie", rawPValue: 0.2 },
      { strategyId: "alpha", rawPValue: 0.01 },
      { strategyId: "bravo", rawPValue: 0.04 },
    ];

    const adjusted = computeBenjaminiHochbergFdr(entries, 0.05);

    expect(adjusted.map((entry) => entry.strategyId)).toEqual([
      "alpha",
      "bravo",
      "charlie",
    ]);
    expect(adjusted[0]?.rejectedFdr).toBe(true);
    expect(adjusted[1]?.rejectedFdr).toBe(false);
    expect(adjusted[2]?.rejectedFdr).toBe(false);
    expect(adjusted[0]?.bhAdjustedPValue).toBeLessThanOrEqual(0.05);
  });
});
