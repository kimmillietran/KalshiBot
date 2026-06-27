import { describe, expect, it } from "vitest";

import { DEFAULT_ENGINE_CONFIG } from "@/lib/trading/config/defaults";
import { hashConfig } from "@/lib/trading/config/hashConfig";
import {
  estimateExpectedValue,
  EXPECTED_VALUE_MODEL_VERSION,
} from "@/lib/trading/expected-value";
import { evaluate } from "@/lib/trading/evaluate";
import { GUARD_STEP_ORDER } from "@/lib/trading/guards/evaluationGuards";
import {
  estimateProbability,
  PROBABILITY_MODEL_VERSION,
} from "@/lib/trading/probability";
import { MarketLifecycle } from "@/lib/trading/snapshot/types";
import { ENGINE_VERSION } from "@/lib/trading/versioning";
import type { MarketFeatureVector } from "@/lib/features/types";
import type { ProbabilityEstimate } from "@/lib/trading/probability/types";
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

function expectedValueInput(
  snapshot: EvaluationSnapshot,
  features: MarketFeatureVector,
  probability: ProbabilityEstimate,
) {
  const pricing = snapshot.pricing!;
  return {
    probability,
    features,
    pricing: {
      yesBidCents: pricing.yesBidCents,
      yesAskCents: pricing.yesAskCents,
      noBidCents: pricing.noBidCents,
      noAskCents: pricing.noAskCents,
    },
  };
}

describe("evaluate", () => {
  it("returns NO TRADE with features, probability, and expectedValue when guards pass", () => {
    const snapshot = createValidSnapshot();
    const decision = evaluate(snapshot, DEFAULT_ENGINE_CONFIG);
    expect(decision.action).toBe("NO TRADE");
    expect(decision.features).not.toBeNull();
    expect(decision.probability).not.toBeNull();
    expect(decision.expectedValue).not.toBeNull();
    expect(decision.probability).toEqual(
      estimateProbability(decision.features!),
    );
    expect(decision.expectedValue).toEqual(
      estimateExpectedValue(
        expectedValueInput(snapshot, decision.features!, decision.probability!),
      ),
    );
    expect(decision.probability?.modelVersion).toBe(PROBABILITY_MODEL_VERSION);
    expect(decision.expectedValue?.modelVersion).toBe(
      EXPECTED_VALUE_MODEL_VERSION,
    );
    expect(decision.gatesTriggered).toBeUndefined();
    expect(decision.reasoning.steps.map((s) => s.id)).toEqual([
      ...GUARD_STEP_ORDER,
      "feature-extraction",
      "model-probability",
      "model-expected-value",
      "decision-stub",
    ]);
    const probabilityStep = decision.reasoning.steps.find(
      (step) => step.id === "model-probability",
    );
    expect(probabilityStep?.outcome).toBe("pass");
    expect(probabilityStep?.detail).toContain("p(up)=");
    const expectedValueStep = decision.reasoning.steps.find(
      (step) => step.id === "model-expected-value",
    );
    expect(expectedValueStep?.outcome).toBe("pass");
    expect(expectedValueStep?.detail).toBe(decision.expectedValue?.reasoning.summary);
    expect(expectedValueStep?.detail).toContain("Expected value");
    const decisionStub = decision.reasoning.steps.find(
      (step) => step.id === "decision-stub",
    );
    expect(decisionStub?.outcome).toBe("skip");
  });

  it("returns gatesTriggered and null model outputs on failure", () => {
    const decision = evaluate(createValidSnapshot({ market: null }), DEFAULT_ENGINE_CONFIG);
    expect(decision.gatesTriggered).toEqual(["guard-market-present"]);
    expect(decision.features).toBeNull();
    expect(decision.probability).toBeNull();
    expect(decision.expectedValue).toBeNull();
  });

  it("maps the same snapshot to the same probability and expectedValue on repeat evaluation", () => {
    const snapshot = createValidSnapshot();
    const first = evaluate(snapshot, DEFAULT_ENGINE_CONFIG);
    const second = evaluate(snapshot, DEFAULT_ENGINE_CONFIG);
    expect(second.probability).toEqual(first.probability);
    expect(second.expectedValue).toEqual(first.expectedValue);
    expect(second).toEqual(first);
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
    expect(decision.features).toBeNull();
    expect(decision.probability).toBeNull();
    expect(decision.expectedValue).toBeNull();
  });
});
