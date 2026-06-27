import { describe, expect, it } from "vitest";

import {
  hasMarket,
  hasStrike,
  isActiveLifecycle,
  MarketLifecycle,
} from "@/lib/trading/snapshot/types";
import type { EvaluationSnapshot } from "@/types/domain/trading";

describe("snapshot guards", () => {
  const baseSnapshot: EvaluationSnapshot = {
    evaluatedAt: "2026-06-26T12:00:00.000Z",
    market: {
      ticker: "KXBTC",
      lifecycle: MarketLifecycle.ACTIVE,
      strikePrice: 64_000,
      timeRemainingMs: 300_000,
      closeTime: null,
    },
    btc: null,
    pricing: null,
  };

  it("hasMarket narrows when market is present", () => {
    expect(hasMarket(baseSnapshot)).toBe(true);
    expect(hasMarket({ ...baseSnapshot, market: null })).toBe(false);
  });

  it("isActiveLifecycle accepts only ACTIVE", () => {
    expect(isActiveLifecycle(MarketLifecycle.ACTIVE)).toBe(true);
    expect(isActiveLifecycle(MarketLifecycle.CLOSED)).toBe(false);
  });

  it("hasStrike requires a positive finite strike", () => {
    expect(hasStrike(baseSnapshot.market!)).toBe(true);
    expect(
      hasStrike({ ...baseSnapshot.market!, strikePrice: null }),
    ).toBe(false);
    expect(hasStrike({ ...baseSnapshot.market!, strikePrice: 0 })).toBe(
      false,
    );
  });
});
