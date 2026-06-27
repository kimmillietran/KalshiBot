import { describe, expect, it } from "vitest";

import { DEFAULT_ENGINE_CONFIG } from "@/lib/trading/config/defaults";
import { hashConfig } from "@/lib/trading/config/hashConfig";
import { evaluate } from "@/lib/trading/evaluate";
import { MarketLifecycle } from "@/lib/trading/snapshot/types";
import { ENGINE_VERSION } from "@/lib/trading/versioning";
import type { EvaluationSnapshot } from "@/types/domain/trading";

const EVALUATED_AT = "2026-06-26T12:00:00.000Z";

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
    },
    pricing: {
      yesMidCents: 63,
      noMidCents: 38,
      liquidityQuality: "Good",
    },
    ...overrides,
  };
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("evaluate", () => {
  it("returns the same decision for the same snapshot and config", () => {
    const snapshot = createValidSnapshot();
    const first = evaluate(snapshot, DEFAULT_ENGINE_CONFIG);
    const second = evaluate(snapshot, DEFAULT_ENGINE_CONFIG);
    expect(second).toEqual(first);
  });

  it("returns NO TRADE when market is missing", () => {
    const decision = evaluate(
      createValidSnapshot({ market: null }),
      DEFAULT_ENGINE_CONFIG,
    );
    expect(decision.action).toBe("NO TRADE");
    expect(decision.reasoning.summary).toContain("Missing market");
    expect(decision.reasoning.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "guard-market-present",
          outcome: "fail",
        }),
      ]),
    );
  });

  it("returns NO TRADE when lifecycle is not ACTIVE", () => {
    const decision = evaluate(
      createValidSnapshot({
        market: {
          ticker: "KXBTC-26JUN26-T64225",
          lifecycle: MarketLifecycle.CLOSED,
          strikePrice: 64_225,
          timeRemainingMs: 0,
          closeTime: "2026-06-26T12:15:00.000Z",
        },
      }),
      DEFAULT_ENGINE_CONFIG,
    );
    expect(decision.action).toBe("NO TRADE");
    expect(decision.reasoning.summary).toContain("Inactive market lifecycle");
    expect(decision.reasoning.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "guard-market-lifecycle",
          outcome: "fail",
        }),
      ]),
    );
  });

  it("returns NO TRADE when strike is missing", () => {
    const decision = evaluate(
      createValidSnapshot({
        market: {
          ticker: "KXBTC-26JUN26-T64225",
          lifecycle: MarketLifecycle.ACTIVE,
          strikePrice: null,
          timeRemainingMs: 600_000,
          closeTime: "2026-06-26T12:15:00.000Z",
        },
      }),
      DEFAULT_ENGINE_CONFIG,
    );
    expect(decision.action).toBe("NO TRADE");
    expect(decision.reasoning.summary).toContain("Missing strike");
    expect(decision.reasoning.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "guard-strike-present",
          outcome: "fail",
        }),
      ]),
    );
  });

  it("returns NO TRADE stub when all guards pass", () => {
    const decision = evaluate(createValidSnapshot(), DEFAULT_ENGINE_CONFIG);
    expect(decision.action).toBe("NO TRADE");
    expect(decision.reasoning.steps.map((step) => step.id)).toEqual([
      "guard-market-present",
      "guard-market-lifecycle",
      "guard-strike-present",
      "model-probability",
      "decision-stub",
    ]);
    expect(decision.reasoning.steps.at(-1)).toMatchObject({
      phase: "execution",
      outcome: "skip",
    });
  });

  it("does not mutate the input snapshot", () => {
    const snapshot = createValidSnapshot();
    const before = deepClone(snapshot);
    evaluate(snapshot, DEFAULT_ENGINE_CONFIG);
    expect(snapshot).toEqual(before);
  });

  it("includes engineVersion and configHash on every decision", () => {
    const decision = evaluate(createValidSnapshot(), DEFAULT_ENGINE_CONFIG);
    expect(decision.engineVersion).toBe(ENGINE_VERSION);
    expect(decision.configHash).toBe(hashConfig(DEFAULT_ENGINE_CONFIG));
    expect(decision.evaluatedAt).toBe(EVALUATED_AT);
  });

  it("returns NO TRADE when engine is disabled in config", () => {
    const decision = evaluate(createValidSnapshot(), {
      ...DEFAULT_ENGINE_CONFIG,
      enabled: false,
    });
    expect(decision.action).toBe("NO TRADE");
    expect(decision.reasoning.steps[0]).toMatchObject({
      id: "guard-config-enabled",
      outcome: "fail",
    });
  });
});
