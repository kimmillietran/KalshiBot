import { describe, expect, it } from "vitest";

import {
  buildMonthExplanation,
  buildRegimeExplanation,
  computeInstabilityIndex,
  formatMonthLabel,
  formatMonthRange,
  groupConsecutiveMonths,
  wilsonScoreInterval,
} from "./monthRegimeAnalysisMath";

describe("monthRegimeAnalysisMath", () => {
  it("formats month labels and ranges", () => {
    expect(formatMonthLabel("2025-12")).toBe("Dec 2025");
    expect(formatMonthRange(["2025-12", "2026-01"])).toBe("Dec 2025–Jan 2026");
  });

  it("groups consecutive months across year boundaries", () => {
    expect(groupConsecutiveMonths(["2025-11", "2025-12", "2026-01", "2026-03"])).toEqual([
      ["2025-11", "2025-12", "2026-01"],
      ["2026-03"],
    ]);
  });

  it("builds month explanations for persistent and reversing months", () => {
    const explanation = buildMonthExplanation({
      persistentMonths: ["2025-12", "2026-01"],
      reversingMonths: ["2026-03", "2026-04"],
    });

    expect(explanation).toContain("Dec 2025–Jan 2026");
    expect(explanation).toContain("Mar 2026–Apr 2026");
  });

  it("builds regime explanations for support and reversal", () => {
    const explanation = buildRegimeExplanation([
      { regime: "high", edgeDirection: "supports" },
      { regime: "medium", edgeDirection: "reverses" },
    ]);

    expect(explanation).toBe(
      "High volatility supports the edge while Medium volatility reverses it.",
    );
  });

  it("computes Wilson confidence intervals deterministically", () => {
    expect(wilsonScoreInterval(8, 10)).toEqual({
      lower: 0.490162,
      upper: 0.943318,
    });
  });

  it("computes instability index from agreement scores", () => {
    expect(computeInstabilityIndex({ monthAgreementScore: 1, regimeAgreementScore: 1 })).toBe(0);
    expect(computeInstabilityIndex({ monthAgreementScore: 0, regimeAgreementScore: 0 })).toBe(1);
  });
});
