import { describe, expect, it } from "vitest";

import { DEFAULT_ENGINE_CONFIG } from "@/lib/trading/config/defaults";
import { hashConfig } from "@/lib/trading/config/hashConfig";
import { evaluate } from "@/lib/trading/evaluate";
import { GUARD_STEP_ORDER } from "@/lib/trading/guards/evaluationGuards";
import { MarketLifecycle } from "@/lib/trading/snapshot/types";
import { ENGINE_VERSION } from "@/lib/trading/versioning";
import type { EvaluationSnapshot } from "@/types/domain/trading";

const EVALUATED_AT = "2026-06-26T12:00:00.000Z";
const candle = (timestamp: number, close: number) => ({
  timestamp,
  open: close - 5,
  high: close + 5,
  low: close - 10,
  close,
});

function createValidSnapshot(
  overrides: Partial<EvaluationSnapshot> = {},
): EvaluationSnapshot {
  return {
    evaluatedAt: EVALUATED_AT,
    market: {
      ticker: "KXBTC",
      lifecycle: MarketLifecycle.ACTIVE,
      strikePrice: 64_225,
      timeRemainingMs: 600_000,
      closeTime: "2026-06-26T12:15:00.000Z",
    },
    btc: {
      price: 64_100,
      change24hPercent: 1.2,
      feedStatus: "live",
      providerSource: "upstream",
      candles: [candle(1, 64_090), candle(2, 64_100)],
    },
    pricing: {
      yesBidCents: 62,
      yesAskCents: 64,
      yesMidCents: 63,
      noBidCents: 37,
      noAskCents: 39,
      noMidCents: 38,
      liquidityQuality: "Good",
      volumeDollars: 500_000,
    },
    ...overrides,
  };
}

describe("evaluate", () => {
  it("returns NO TRADE with features when guards pass", () => {
    const decision = evaluate(createValidSnapshot(), DEFAULT_ENGINE_CONFIG);
    expect(decision.action).toBe("NO TRADE");
    expect(decision.features).not.toBeNull();
    expect(decision.gatesTriggered).toBeUndefined();
    expect(decision.reasoning.steps.map((s) => s.id)).toEqual([
      ...GUARD_STEP_ORDER,
      "feature-extraction",
      "model-probability",
      "decision-stub",
    ]);
  });

  it("returns gatesTriggered on failure", () => {
    const decision = evaluate(createValidSnapshot({ market: null }), DEFAULT_ENGINE_CONFIG);
    expect(decision.gatesTriggered).toEqual(["guard-market-present"]);
    expect(decision.features).toBeNull();
  });

  it("includes engine metadata", () => {
    const decision = evaluate(createValidSnapshot(), DEFAULT_ENGINE_CONFIG);
    expect(decision.engineVersion).toBe(ENGINE_VERSION);
    expect(decision.configHash).toBe(hashConfig(DEFAULT_ENGINE_CONFIG));
  });

  it("blocks disabled engine config", () => {
    const decision = evaluate(createValidSnapshot(), {
      ...DEFAULT_ENGINE_CONFIG,
      enabled: false,
    });
    expect(decision.gatesTriggered).toEqual(["guard-config-enabled"]);
    expect(decision.reasoning.summary).toContain("Engine disabled");
  });

  it("blocks non-ACTIVE lifecycle", () => {
    const decision = evaluate(
      createValidSnapshot({
        market: {
          ticker: "KXBTC",
          lifecycle: MarketLifecycle.CLOSED,
          strikePrice: 64_225,
          timeRemainingMs: 0,
          closeTime: "2026-06-26T12:15:00.000Z",
        },
      }),
      DEFAULT_ENGINE_CONFIG,
    );
    expect(decision.gatesTriggered).toEqual(["guard-market-lifecycle"]);
  });

  it("blocks missing BTC spot", () => {
    const decision = evaluate(createValidSnapshot({ btc: null }), DEFAULT_ENGINE_CONFIG);
    expect(decision.gatesTriggered).toEqual(["guard-btc-present"]);
    expect(decision.reasoning.summary).toContain("Missing BTC spot");
  });

  it("blocks spread when bid/ask quotes are unavailable", () => {
    const decision = evaluate(
      createValidSnapshot({
        pricing: {
          yesBidCents: null,
          yesAskCents: null,
          yesMidCents: 50,
          noBidCents: null,
          noAskCents: null,
          noMidCents: 50,
          liquidityQuality: "Good",
          volumeDollars: 500_000,
        },
      }),
      DEFAULT_ENGINE_CONFIG,
    );
    expect(decision.gatesTriggered).toEqual(["guard-spread-maximum"]);
    expect(decision.reasoning.summary).toContain("Spread unavailable");
  });

  it.each([
    ["stale BTC", { btc: { price: 64_100, change24hPercent: 1.2, feedStatus: "stale" as const, providerSource: "upstream" as const, candles: [candle(1, 64_100), candle(2, 64_100)] } }, "guard-btc-feed-stale"],
    ["loading BTC", { btc: { price: 64_100, change24hPercent: 1.2, feedStatus: "loading" as const, providerSource: "upstream" as const, candles: [candle(1, 64_100), candle(2, 64_100)] } }, "guard-btc-feed-loading"],
    ["error BTC", { btc: { price: 64_100, change24hPercent: 1.2, feedStatus: "error" as const, providerSource: "upstream" as const, candles: [candle(1, 64_100), candle(2, 64_100)] } }, "guard-btc-feed-error"],
    ["fallback BTC", { btc: { price: 64_100, change24hPercent: null, feedStatus: "fallback" as const, providerSource: "fallback" as const, candles: [candle(1, 64_100), candle(2, 64_100)] } }, "guard-btc-fallback-source"],
    ["wide spread", { pricing: { yesBidCents: 10, yesAskCents: 50, yesMidCents: 30, noBidCents: 37, noAskCents: 39, noMidCents: 38, liquidityQuality: "Good" as const, volumeDollars: 500_000 } }, "guard-spread-maximum"],
    ["low liquidity", { pricing: { yesBidCents: 62, yesAskCents: 64, yesMidCents: 63, noBidCents: 37, noAskCents: 39, noMidCents: 38, liquidityQuality: "Poor" as const, volumeDollars: 500_000 } }, "guard-liquidity-minimum"],
    ["missing pricing", { pricing: null }, "guard-pricing-present"],
    ["missing candles", { btc: { price: 64_100, change24hPercent: 1.2, feedStatus: "live" as const, providerSource: "upstream" as const, candles: [candle(1, 64_100)] } }, "guard-btc-candles"],
    ["invalid strike", { market: { ticker: "KXBTC", lifecycle: MarketLifecycle.ACTIVE, strikePrice: 0, timeRemainingMs: 600_000, closeTime: "2026-06-26T12:15:00.000Z" } }, "guard-strike-present"],
    ["expired market", { market: { ticker: "KXBTC", lifecycle: MarketLifecycle.ACTIVE, strikePrice: 64_225, timeRemainingMs: -1, closeTime: "2026-06-26T12:15:00.000Z" } }, "guard-contract-expired"],
    ["settlement too close", { market: { ticker: "KXBTC", lifecycle: MarketLifecycle.ACTIVE, strikePrice: 64_225, timeRemainingMs: 30_000, closeTime: "2026-06-26T12:15:00.000Z" } }, "guard-settlement-window"],
  ])("blocks %s", (_label, overrides, gateId) => {
    const decision = evaluate(createValidSnapshot(overrides), DEFAULT_ENGINE_CONFIG);
    expect(decision.action).toBe("NO TRADE");
    expect(decision.gatesTriggered).toEqual([gateId]);
  });
});
