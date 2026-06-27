import { describe, expect, it } from "vitest";

import {
  POSITION_SIZING_DOLLARS_UNAVAILABLE_LABEL,
  POSITION_SIZING_RECOMMENDED_ALLOCATION_MESSAGE,
  POSITION_SIZING_ZERO_ALLOCATION_MESSAGE,
  POSITION_SIZING_ZERO_REASON,
} from "../constants";
import {
  formatFractionAsPercent,
  formatRecommendedPercent,
  positionSizingDisplayState,
  tradeAllocationGuidance,
} from "./positionSizingDisplay";
import { mockPositionSize } from "../test-fixtures/positionSizingDecisions";

describe("positionSizingDisplay", () => {
  it("classifies unavailable, zero, and positive sizing states", () => {
    expect(positionSizingDisplayState(null)).toBe("unavailable");
    expect(
      positionSizingDisplayState(
        mockPositionSize({ recommendedFraction: 0, recommendedPercent: 0 }),
      ),
    ).toBe("zero");
    expect(positionSizingDisplayState(mockPositionSize())).toBe("positive");
  });

  it("formats percent and fraction labels without recomputing Kelly", () => {
    expect(formatRecommendedPercent(5.25)).toBe("5.25%");
    expect(formatFractionAsPercent(0.0525)).toBe("5.25%");
  });

  it("explains BUY allocation guidance", () => {
    const guidance = tradeAllocationGuidance(
      "BUY UP",
      mockPositionSize({ recommendedPercent: 4.5 }),
    );

    expect(guidance).toContain(POSITION_SIZING_RECOMMENDED_ALLOCATION_MESSAGE);
    expect(guidance).toContain("4.50%");
    expect(guidance).toContain("YES");
  });

  it("explains zero allocation for NO TRADE", () => {
    const guidance = tradeAllocationGuidance(
      "NO TRADE",
      mockPositionSize({
        recommendedFraction: 0,
        recommendedPercent: 0,
        side: null,
      }),
    );

    expect(guidance).toContain(POSITION_SIZING_ZERO_ALLOCATION_MESSAGE);
    expect(guidance).toContain(POSITION_SIZING_ZERO_REASON);
    expect(guidance).not.toMatch(/Sizing unavailable/i);
  });

  it("explains unavailable sizing when positionSize is null", () => {
    const guidance = tradeAllocationGuidance("NO TRADE", null);

    expect(guidance).toContain("Evaluation stopped before position sizing");
    expect(guidance).not.toContain(POSITION_SIZING_DOLLARS_UNAVAILABLE_LABEL);
  });
});
