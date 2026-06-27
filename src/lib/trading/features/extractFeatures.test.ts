import { describe, expect, it } from "vitest";

import { evaluate } from "@/lib/trading/evaluate";
import { extractFeaturesFromSnapshot } from "@/lib/trading/features/extractFeatures";
import { DEFAULT_ENGINE_CONFIG } from "@/lib/trading/config/defaults";
import { MarketLifecycle } from "@/lib/trading/snapshot/types";
import type { EvaluationSnapshot } from "@/types/domain/trading";

const EVALUATED_AT = "2026-06-26T12:00:00.000Z";

function candle(timestamp: number, close: number) {
  return {
    timestamp,
    open: close - 5,
    high: close + 5,
    low: close - 10,
    close,
  };
}

function createValidSnapshot(
  overrides: Partial<EvaluationSnapshot> = {},
): EvaluationSnapshot {
  return {
    evaluatedAt: EVALUATED_AT,
    market: {
      ticker: "KXBTC-26JUN26-T64225",
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
      candles: [
        candle(1_700_000_000_000, 64_050),
        candle(1_700_000_060_000, 64_100),
      ],
    },
    pricing: {
      yesBidCents: 62,
      yesAskCents: 64,
      yesMidCents: 63,
      noBidCents: 37,
      noAskCents: 39,
      noMidCents: 38,
      liquidityQuality: "Good",
      volumeDollars: 503_000,
    },
    ...overrides,
  };
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("extractFeaturesFromSnapshot", () => {
  it("returns the same feature vector for the same snapshot", () => {
    const snapshot = createValidSnapshot();
    const first = extractFeaturesFromSnapshot(snapshot);
    const second = extractFeaturesFromSnapshot(snapshot);
    expect(second).toEqual(first);
  });

  it("does not mutate the input snapshot", () => {
    const snapshot = createValidSnapshot();
    const before = deepClone(snapshot);
    extractFeaturesFromSnapshot(snapshot);
    expect(snapshot).toEqual(before);
  });
});

describe("evaluate feature integration", () => {
  it("produces identical decisions for identical snapshots", () => {
    const snapshot = createValidSnapshot();
    const first = evaluate(snapshot, DEFAULT_ENGINE_CONFIG);
    const second = evaluate(snapshot, DEFAULT_ENGINE_CONFIG);
    expect(second).toEqual(first);
  });

  it("attaches features, probability, and expectedValue when guards pass", () => {
    const decision = evaluate(createValidSnapshot(), DEFAULT_ENGINE_CONFIG);
    expect(decision.action).toBe("NO TRADE");
    expect(decision.features).not.toBeNull();
    expect(decision.probability).not.toBeNull();
    expect(decision.expectedValue).not.toBeNull();
    expect(decision.features?.distanceToTarget.signed).toBe(-125);
    expect(decision.features?.liquidity.quality).toBe("Good");
    expect(decision.reasoning.steps.map((step) => step.id)).toContain(
      "feature-extraction",
    );
    expect(decision.reasoning.steps.map((step) => step.id)).toContain(
      "model-probability",
    );
    expect(decision.reasoning.steps.map((step) => step.id)).toContain(
      "model-expected-value",
    );
  });

  it("leaves model outputs null when guards fail early", () => {
    const decision = evaluate(
      createValidSnapshot({ market: null }),
      DEFAULT_ENGINE_CONFIG,
    );
    expect(decision.features).toBeNull();
    expect(decision.probability).toBeNull();
    expect(decision.expectedValue).toBeNull();
    expect(
      decision.reasoning.steps.some((step) => step.id === "feature-extraction"),
    ).toBe(false);
  });

  it("does not mutate snapshot or returned features on repeat evaluation", () => {
    const snapshot = createValidSnapshot();
    const before = deepClone(snapshot);
    const decision = evaluate(snapshot, DEFAULT_ENGINE_CONFIG);
    const featuresBefore = deepClone(decision.features);

    evaluate(snapshot, DEFAULT_ENGINE_CONFIG);

    expect(snapshot).toEqual(before);
    expect(decision.features).toEqual(featuresBefore);
  });

  it("maps same snapshot to same feature vector and same decision", () => {
    const snapshot = createValidSnapshot();
    const features = extractFeaturesFromSnapshot(snapshot);
    const decision = evaluate(snapshot, DEFAULT_ENGINE_CONFIG);

    expect(decision.features).toEqual(features);
    expect(evaluate(snapshot, DEFAULT_ENGINE_CONFIG).features).toEqual(features);
  });
});
