import { describe, expect, it } from "vitest";

import { maxContractSpreadPercent, meetsMinLiquidityQuality } from "./pricing";
import type { EvaluationPricingSnapshot } from "@/types/domain/trading";

describe("guard pricing helpers", () => {
  it("ranks liquidity quality", () => {
    expect(meetsMinLiquidityQuality("Good", "Fair")).toBe(true);
    expect(meetsMinLiquidityQuality("Poor", "Fair")).toBe(false);
  });

  it("computes max spread", () => {
    const pricing: EvaluationPricingSnapshot = {
      yesBidCents: 10,
      yesAskCents: 50,
      yesMidCents: 30,
      noBidCents: 37,
      noAskCents: 39,
      noMidCents: 38,
      liquidityQuality: "Good",
      volumeDollars: null,
    };
    expect(maxContractSpreadPercent(pricing)).toBe(80);
  });
});
