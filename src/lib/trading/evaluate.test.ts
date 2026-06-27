import { describe, expect, it } from "vitest";

import { DEFAULT_ENGINE_CONFIG } from "@/lib/trading/config/defaults";
import { hashConfig } from "@/lib/trading/config/hashConfig";
import {
  evaluateDecisionPolicy,
  DECISION_POLICY_MODEL_VERSION,
} from "@/lib/trading/decision-policy";
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
import type { EngineConfig, EvaluationSnapshot } from "@/types/domain/trading";

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

function risingCandles(start: number, count: number) {
  return Array.from({ length: count }, (_, index) =>
    candle(index + 1, start + index * 40),
  );
}

function fallingCandles(start: number, count: number) {
  return Array.from({ length: count }, (_, index) =>
    candle(index + 1, start - index * 40),
  );
}

/** Snapshot tuned for positive YES edge under the real EV + policy pipeline. */
function createBuyUpSnapshot(): EvaluationSnapshot {
  return createValidSnapshot({
    market: {
      ticker: "KXBTC",
      lifecycle: MarketLifecycle.ACTIVE,
      strikePrice: 64_200,
      timeRemainingMs: 600_000,
      closeTime: "2026-06-26T12:15:00.000Z",
    },
    btc: {
      price: 64_600,
      change24hPercent: 2.5,
      feedStatus: "live",
      providerSource: "upstream",
      candles: risingCandles(64_100, 12),
    },
    pricing: {
      yesBidCents: 43,
      yesAskCents: 45,
      yesMidCents: 44,
      noBidCents: 52,
      noAskCents: 54,
      noMidCents: 53,
      liquidityQuality: "Good",
      volumeDollars: 500_000,
    },
  });
}

/** Snapshot tuned for positive NO edge under the real EV + policy pipeline. */
function createBuyDownSnapshot(): EvaluationSnapshot {
  return createValidSnapshot({
    market: {
      ticker: "KXBTC",
      lifecycle: MarketLifecycle.ACTIVE,
      strikePrice: 64_800,
      timeRemainingMs: 600_000,
      closeTime: "2026-06-26T12:15:00.000Z",
    },
    btc: {
      price: 64_200,
      change24hPercent: -1.5,
      feedStatus: "live",
      providerSource: "upstream",
      candles: fallingCandles(64_600, 12),
    },
    pricing: {
      yesBidCents: 58,
      yesAskCents: 60,
      yesMidCents: 59,
      noBidCents: 36,
      noAskCents: 38,
      noMidCents: 37,
      liquidityQuality: "Good",
      volumeDollars: 500_000,
    },
  });
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

function policyInputFromDecision(
  snapshot: EvaluationSnapshot,
  config: EngineConfig,
  features: MarketFeatureVector,
  probability: ProbabilityEstimate,
) {
  return {
    features,
    probability,
    expectedValue: estimateExpectedValue(
      expectedValueInput(snapshot, features, probability),
    ),
    engineConfig: config,
  };
}

describe("evaluate", () => {
  it("returns BUY UP when real policy approves YES", () => {
    const snapshot = createBuyUpSnapshot();
    const config = DEFAULT_ENGINE_CONFIG;
    const decision = evaluate(snapshot, config);

    expect(decision.action).toBe("BUY UP");
    expect(decision.features).not.toBeNull();
    expect(decision.probability).not.toBeNull();
    expect(decision.expectedValue).not.toBeNull();
    expect(
      evaluateDecisionPolicy(
        policyInputFromDecision(
          snapshot,
          config,
          decision.features!,
          decision.probability!,
        ),
      ).action,
    ).toBe("BUY_UP");

    const policyStep = decision.reasoning.steps.find(
      (step) => step.id === "decision-policy",
    );
    expect(policyStep?.outcome).toBe("pass");
    expect(policyStep?.detail).toContain("action=BUY_UP");
  });

  it("returns BUY DOWN when real policy approves NO", () => {
    const snapshot = createBuyDownSnapshot();
    const config = DEFAULT_ENGINE_CONFIG;
    const decision = evaluate(snapshot, config);

    expect(decision.action).toBe("BUY DOWN");
    expect(
      evaluateDecisionPolicy(
        policyInputFromDecision(
          snapshot,
          config,
          decision.features!,
          decision.probability!,
        ),
      ).action,
    ).toBe("BUY_DOWN");

    const policyStep = decision.reasoning.steps.find(
      (step) => step.id === "decision-policy",
    );
    expect(policyStep?.outcome).toBe("pass");
    expect(policyStep?.detail).toContain("action=BUY_DOWN");
  });

  it("returns NO TRADE when real policy rejects trade", () => {
    const snapshot = createValidSnapshot();
    const config = { ...DEFAULT_ENGINE_CONFIG, minEdgePercent: 100 };
    const decision = evaluate(snapshot, config);

    expect(decision.action).toBe("NO TRADE");
    expect(decision.features).not.toBeNull();
    expect(decision.probability).not.toBeNull();
    expect(decision.expectedValue).not.toBeNull();
    expect(
      evaluateDecisionPolicy(
        policyInputFromDecision(
          snapshot,
          config,
          decision.features!,
          decision.probability!,
        ),
      ).action,
    ).toBe("NO_TRADE");

    const policyStep = decision.reasoning.steps.find(
      (step) => step.id === "decision-policy",
    );
    expect(policyStep?.outcome).toBe("skip");
    expect(policyStep?.detail).toContain("action=NO_TRADE");
  });

  it("wires model outputs and policy on the default snapshot when edge is insufficient", () => {
    const snapshot = createValidSnapshot();
    const decision = evaluate(snapshot, DEFAULT_ENGINE_CONFIG);

    expect(decision.action).toBe("NO TRADE");
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
      "decision-policy",
    ]);
    expect(
      decision.reasoning.steps.some((step) => step.id === "decision-stub"),
    ).toBe(false);
  });

  it("returns gatesTriggered and null model outputs on guard failure", () => {
    const decision = evaluate(createValidSnapshot({ market: null }), DEFAULT_ENGINE_CONFIG);
    expect(decision.action).toBe("NO TRADE");
    expect(decision.gatesTriggered).toEqual(["guard-market-present"]);
    expect(decision.features).toBeNull();
    expect(decision.probability).toBeNull();
    expect(decision.expectedValue).toBeNull();
    expect(
      decision.reasoning.steps.some((step) => step.id === "decision-policy"),
    ).toBe(false);
  });

  it("maps the same snapshot to the same decision on repeat evaluation", () => {
    const snapshot = createValidSnapshot();
    const first = evaluate(snapshot, DEFAULT_ENGINE_CONFIG);
    const second = evaluate(snapshot, DEFAULT_ENGINE_CONFIG);
    expect(second).toEqual(first);
  });

  it("includes engine metadata", () => {
    const decision = evaluate(createValidSnapshot(), DEFAULT_ENGINE_CONFIG);
    expect(decision.engineVersion).toBe(ENGINE_VERSION);
    expect(decision.configHash).toBe(hashConfig(DEFAULT_ENGINE_CONFIG));
    expect(ENGINE_VERSION).toBe("5.6.0");
    expect(DECISION_POLICY_MODEL_VERSION).toBe("5.6.0");
  });

  it("blocks disabled engine config", () => {
    const decision = evaluate(createValidSnapshot(), {
      ...DEFAULT_ENGINE_CONFIG,
      enabled: false,
    });
    expect(decision.gatesTriggered).toEqual(["guard-config-enabled"]);
    expect(decision.reasoning.summary).toContain("Engine disabled");
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
