import { describe, expect, it } from "vitest";

import {
  hasBtcSpot,
  hasContractPricing,
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
    btc: {
      price: 64_000,
      change24hPercent: 1,
      feedStatus: "live",
      providerSource: "upstream",
      candles: [],
    },
    pricing: {
      yesBidCents: 60,
      yesAskCents: 62,
      yesMidCents: 61,
      noBidCents: 38,
      noAskCents: 40,
      noMidCents: 39,
      liquidityQuality: "Good",
    },
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

  it("hasBtcSpot requires a positive finite price", () => {
    expect(hasBtcSpot(baseSnapshot)).toBe(true);
    expect(hasBtcSpot({ ...baseSnapshot, btc: null })).toBe(false);
    expect(
      hasBtcSpot({
        ...baseSnapshot,
        btc: { ...baseSnapshot.btc!, price: 0 },
      }),
    ).toBe(false);
  });

  it("hasContractPricing accepts mid or bid/ask quotes", () => {
    expect(hasContractPricing(baseSnapshot)).toBe(true);
    expect(hasContractPricing({ ...baseSnapshot, pricing: null })).toBe(false);
  });
});
