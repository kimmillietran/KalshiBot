import { describe, expect, it } from "vitest";

import {
  maxSpreadSidePercent,
  midProbabilityFromCents,
  spreadSidePercent,
} from "./contractPricing";

describe("contractPricing regression", () => {
  it("matches legacy midProbability formula", () => {
    const legacy = (yesBidCents: number, yesAskCents: number) =>
      (yesBidCents + yesAskCents) / 2 / 100;

    expect(midProbabilityFromCents(40, 60)).toBe(legacy(40, 60));
    expect(midProbabilityFromCents(70, 80)).toBe(0.75);
  });

  it("matches legacy spreadSidePercent formula", () => {
    const legacy = (bidCents: number, askCents: number) =>
      (Math.max(askCents - bidCents, 0) / askCents) * 100;

    expect(spreadSidePercent(40, 60)).toBe(legacy(40, 60));
    expect(spreadSidePercent(10, 90)).toBeCloseTo(88.888888, 5);
    expect(spreadSidePercent(null, 60)).toBeNull();
  });

  it("matches legacy max spread aggregation", () => {
    expect(
      maxSpreadSidePercent({
        yesBidCents: 40,
        yesAskCents: 60,
        noBidCents: 35,
        noAskCents: 45,
      }),
    ).toBeCloseTo(33.333333, 5);
  });
});
