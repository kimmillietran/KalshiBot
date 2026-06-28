import { describe, expect, it } from "vitest";

import { DEFAULT_ENGINE_CONFIG } from "@/lib/trading/config/defaults";
import { DECISION_POLICY_MODEL_VERSION } from "@/lib/trading/decision-policy";
import { evaluate } from "@/lib/trading/evaluate";
import { EXPECTED_VALUE_MODEL_VERSION } from "@/lib/trading/expected-value";
import { POSITION_SIZING_MODEL_VERSION } from "@/lib/trading/position-sizing";
import { PROBABILITY_MODEL_VERSION } from "@/lib/trading/probability";
import { MarketLifecycle } from "@/lib/trading/snapshot/types";
import { ENGINE_VERSION } from "@/lib/trading/versioning";
import type { EvaluationSnapshot } from "@/types/domain/trading";

import { ENGINE_SNAPSHOT_MODEL_VERSION, summarizeEngineSnapshot } from "./summarizeEngineSnapshot";

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

function buyUpSnapshot(): EvaluationSnapshot {
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

function buyDownSnapshot(): EvaluationSnapshot {
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

describe("summarizeEngineSnapshot", () => {
  it("formats BUY UP engine output", () => {
    const decision = evaluate(buyUpSnapshot(), DEFAULT_ENGINE_CONFIG);
    const snapshot = summarizeEngineSnapshot(decision);

    expect(decision.action).toBe("BUY UP");
    expect(snapshot.modelVersion).toBe(ENGINE_SNAPSHOT_MODEL_VERSION);
    expect(snapshot.headline).toBe("Engine snapshot — BUY UP");
    expect(snapshot.decision.action).toBe("BUY UP");
    expect(snapshot.probability.available).toBe(true);
    expect(snapshot.probability.up).toMatch(/%$/);
    expect(snapshot.expectedValue.available).toBe(true);
    expect(snapshot.expectedValue.bestSide).toBe("YES");
    expect(snapshot.positionSizing.available).toBe(true);
    expect(snapshot.positionSizing.recommendedPercent).toMatch(/%$/);
    expect(snapshot.metadata.engineVersion).toBe(ENGINE_VERSION);
    expect(snapshot.metadata.probabilityVersion).toBe(PROBABILITY_MODEL_VERSION);
    expect(snapshot.metadata.expectedValueVersion).toBe(EXPECTED_VALUE_MODEL_VERSION);
    expect(snapshot.metadata.policyVersion).toBe(DECISION_POLICY_MODEL_VERSION);
    expect(snapshot.metadata.positionSizingVersion).toBe(POSITION_SIZING_MODEL_VERSION);
  });

  it("formats BUY DOWN engine output", () => {
    const decision = evaluate(buyDownSnapshot(), DEFAULT_ENGINE_CONFIG);
    const snapshot = summarizeEngineSnapshot(decision);

    expect(snapshot.headline).toBe("Engine snapshot — BUY DOWN");
    expect(snapshot.decision.action).toBe("BUY DOWN");
    expect(snapshot.expectedValue.bestSide).toBe("NO");
    expect(snapshot.positionSizing.side).toBe("NO");
  });

  it("formats NO TRADE policy output with zero sizing", () => {
    const decision = evaluate(createValidSnapshot(), {
      ...DEFAULT_ENGINE_CONFIG,
      minEdgePercent: 100,
    });
    const snapshot = summarizeEngineSnapshot(decision);

    expect(snapshot.headline).toBe("Engine snapshot — NO TRADE");
    expect(snapshot.probability.available).toBe(true);
    expect(snapshot.expectedValue.available).toBe(true);
    expect(snapshot.positionSizing.available).toBe(true);
    expect(snapshot.positionSizing.recommendedPercent).toBe("0.00%");
  });

  it("represents guard failure sections as unavailable", () => {
    const decision = evaluate(
      createValidSnapshot({ market: null }),
      DEFAULT_ENGINE_CONFIG,
    );
    const snapshot = summarizeEngineSnapshot(decision);

    expect(snapshot.decision.action).toBe("NO TRADE");
    expect(snapshot.probability.available).toBe(false);
    expect(snapshot.expectedValue.available).toBe(false);
    expect(snapshot.positionSizing.available).toBe(false);
    expect(snapshot.metadata.probabilityVersion).toBeNull();
    expect(snapshot.metadata.policyVersion).toBeNull();
    expect(snapshot.metadata.positionSizingVersion).toBeNull();
    expect(snapshot.technical.steps.some((step) => step.outcome === "fail")).toBe(true);
  });

  it("represents position sizing unavailable on guard failure", () => {
    const decision = evaluate(
      createValidSnapshot({ market: null }),
      DEFAULT_ENGINE_CONFIG,
    );

    expect(summarizeEngineSnapshot(decision).positionSizing).toEqual({
      recommendedPercent: null,
      recommendedDollars: null,
      side: null,
      available: false,
    });
  });

  it("leaves recommendedDollars null when bankroll is unavailable", () => {
    const decision = evaluate(buyUpSnapshot(), DEFAULT_ENGINE_CONFIG);

    expect(decision.positionSize?.recommendedDollars).toBeNull();
    expect(summarizeEngineSnapshot(decision).positionSizing.recommendedDollars).toBeNull();
    expect(summarizeEngineSnapshot(decision).positionSizing.available).toBe(true);
  });

  it("is deterministic for identical inputs", () => {
    const decision = evaluate(buyUpSnapshot(), DEFAULT_ENGINE_CONFIG);

    expect(summarizeEngineSnapshot(decision)).toEqual(summarizeEngineSnapshot(decision));
  });

  it("serializes stably to JSON", () => {
    const decision = evaluate(buyUpSnapshot(), DEFAULT_ENGINE_CONFIG);
    const first = JSON.stringify(summarizeEngineSnapshot(decision));
    const second = JSON.stringify(summarizeEngineSnapshot(decision));

    expect(second).toBe(first);
  });

  it("preserves technical step order", () => {
    const decision = evaluate(buyUpSnapshot(), DEFAULT_ENGINE_CONFIG);
    const snapshot = summarizeEngineSnapshot(decision);

    expect(snapshot.technical.steps.map((step) => step.id)).toEqual(
      decision.reasoning.steps.map((step) => step.id),
    );
  });

  it("does not invent unavailable model values on guard failure", () => {
    const decision = evaluate(
      createValidSnapshot({ market: null }),
      DEFAULT_ENGINE_CONFIG,
    );
    const parsed = JSON.parse(JSON.stringify(summarizeEngineSnapshot(decision))) as {
      probability: { up: string | null; available: boolean };
    };

    expect(parsed.probability.up).toBeNull();
    expect(parsed.probability.available).toBe(false);
  });
});
