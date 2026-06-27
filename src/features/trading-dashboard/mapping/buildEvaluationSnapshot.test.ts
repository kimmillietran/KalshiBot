import { describe, expect, it } from "vitest";

import { MarketLifecycle } from "@/features/market-data/types";

import { buildEvaluationSnapshot } from "./buildEvaluationSnapshot";

const evaluatedAt = "2026-06-26T23:20:00.000Z";

const liveMarket = {
  ticker: "KXBTC15M-26JUN261930-30",
  title: "BTC price up in next 15 mins?",
  targetPrice: 59_990.31,
  lifecycle: MarketLifecycle.ACTIVE,
  openTime: "2026-06-26T23:15:00Z",
  closeTime: "2026-06-26T23:30:00Z",
  timeRemainingMs: 600_000,
  updatedAt: evaluatedAt,
  source: "kalshi" as const,
  isFallback: false,
};

const livePricing = {
  yes: {
    bidCents: 15,
    askCents: 16,
    midCents: 16,
    lastCents: 16,
    spreadCents: 1,
  },
  no: {
    bidCents: 84,
    askCents: 85,
    midCents: 85,
    lastCents: null,
    spreadCents: 1,
  },
  volumeLabel: "$503K",
  liquidityQuality: "Good" as const,
  updatedAt: evaluatedAt,
  isFallback: false,
  source: "kalshi" as const,
};

describe("buildEvaluationSnapshot", () => {
  it("maps live BTC and Kalshi feeds into an EvaluationSnapshot", () => {
    const snapshot = buildEvaluationSnapshot({
      evaluatedAt,
      noMarket: false,
      market: liveMarket,
      pricing: livePricing,
      btc: {
        price: 64_250.32,
        change24hPercent: 1.8,
        status: "live",
        isUsingFallback: false,
        candles: [
          {
            timestamp: 1_700_000_000_000,
            open: 64_175,
            high: 64_185,
            low: 64_170,
            close: 64_180,
          },
          {
            timestamp: 1_700_000_060_000,
            open: 64_245,
            high: 64_255,
            low: 64_240,
            close: 64_250.32,
          },
        ],
      },
    });

    expect(snapshot.evaluatedAt).toBe(evaluatedAt);
    expect(snapshot.market).toEqual({
      ticker: liveMarket.ticker,
      lifecycle: "ACTIVE",
      strikePrice: 59_990.31,
      timeRemainingMs: 600_000,
      closeTime: "2026-06-26T23:30:00Z",
    });
    expect(snapshot.btc).toMatchObject({
      price: 64_250.32,
      change24hPercent: 1.8,
      feedStatus: "live",
      providerSource: "upstream",
      candles: [
        {
          timestamp: 1_700_000_000_000,
          open: 64_175,
          high: 64_185,
          low: 64_170,
          close: 64_180,
        },
        {
          timestamp: 1_700_000_060_000,
          open: 64_245,
          high: 64_255,
          low: 64_240,
          close: 64_250.32,
        },
      ],
    });
    expect(snapshot.pricing).toEqual({
      yesBidCents: 15,
      yesAskCents: 16,
      yesMidCents: 16,
      noBidCents: 84,
      noAskCents: 85,
      noMidCents: 85,
      liquidityQuality: "Good",
      volumeDollars: 503_000,
    });
  });

  it("returns null market when no active contract", () => {
    const snapshot = buildEvaluationSnapshot({
      evaluatedAt,
      noMarket: true,
      market: null,
      pricing: null,
      btc: {
        price: 64_000,
        change24hPercent: 0,
        status: "live",
        isUsingFallback: false,
        candles: [],
      },
    });

    expect(snapshot.market).toBeNull();
    expect(snapshot.pricing).toBeNull();
  });

  it("marks fallback BTC provider source", () => {
    const snapshot = buildEvaluationSnapshot({
      evaluatedAt,
      noMarket: false,
      market: liveMarket,
      pricing: livePricing,
      btc: {
        price: 64_000,
        change24hPercent: 0,
        status: "fallback",
        isUsingFallback: true,
        candles: [],
      },
    });

    expect(snapshot.btc?.providerSource).toBe("fallback");
    expect(snapshot.btc?.feedStatus).toBe("fallback");
  });
});
