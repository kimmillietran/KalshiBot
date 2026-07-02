import { describe, expect, it } from "vitest";

import type { ReplayStepResult } from "@/lib/data/replay/replaySessionTypes";
import type { BacktestStrategyContext, TradeIntent } from "@/lib/data/backtesting/strategyTypes";

import {
  StrategyRegistry,
  StrategyRegistryError,
  StrategyRegistryErrorCode,
  noopStrategyDefinition,
} from "./StrategyRegistry";
import type { StrategyDefinition } from "./strategyRegistryTypes";

const T0 = "2026-06-26T23:15:00.000Z";
const TICKER = "KXBTC15M-REGISTRY";

const STEP: ReplayStepResult = {
  stepIndex: 0,
  sourceTicker: TICKER,
  temporal: {
    eventTime: T0,
    collectionTime: T0,
    observedAt: T0,
  },
  provenance: {
    source: "kalshi-rest",
    collectionTime: T0,
    observedAt: T0,
    fetchId: "fetch-registry",
  },
  engineInput: {
    evaluatedAt: T0,
    market: null,
    btc: null,
    pricing: {
      yesBidCents: 48,
      yesAskCents: 52,
      yesMidCents: 50,
      noBidCents: 47,
      noAskCents: 51,
      noMidCents: 49,
      liquidityQuality: "Fair",
      volumeDollars: null,
    },
  },
  engineOutput: {
    action: "NO TRADE",
    reasoning: [],
  } as ReplayStepResult["engineOutput"],
  sourceSnapshot: {} as ReplayStepResult["sourceSnapshot"],
};

const CONTEXT: BacktestStrategyContext = {
  stepIndex: 0,
  ledgerSnapshot: {
    initialCashCents: 10_000,
    cashCents: 10_000,
    realizedPnLCents: 0,
    fills: [],
    openPositions: [],
  },
  openPositions: [],
  cashCents: 10_000,
};

function customStrategyDefinition(): StrategyDefinition {
  return {
    strategyId: "custom-alpha",
    description: "Custom registry strategy",
    strategy: {
      strategyId: "custom-alpha",
      decide: (): TradeIntent[] => [
        {
          ticker: "KXBTC15M-CUSTOM",
          side: "yes",
          action: "buy",
          quantity: 3,
          limitPriceCents: 50,
          reason: "custom-alpha",
        },
      ],
    },
  };
}

describe("StrategyRegistry", () => {
  it("resolves the noop built-in strategy", () => {
    const registry = StrategyRegistry.createBuiltIn();
    const strategy = registry.resolve("noop");

    expect(strategy.strategyId).toBe("noop");
    expect(strategy.decide(STEP, CONTEXT)).toEqual([]);
  });

  it("resolves the buy-first-ask built-in strategy", () => {
    const registry = StrategyRegistry.createBuiltIn();
    const strategy = registry.resolve("buy-first-ask");

    expect(strategy.strategyId).toBe("buy-first-ask");
    expect(strategy.decide(STEP, CONTEXT)).toEqual([
      {
        ticker: TICKER,
        side: "yes",
        action: "buy",
        quantity: 1,
        limitPriceCents: 52,
        reason: "buy-first-ask",
      },
    ]);
  });

  it("rejects blank strategy ids on resolve", () => {
    const registry = StrategyRegistry.createBuiltIn();

    expect(() => registry.resolve("  ")).toThrow(StrategyRegistryError);
    try {
      registry.resolve("  ");
    } catch (error) {
      expect((error as StrategyRegistryError).code).toBe(
        StrategyRegistryErrorCode.INVALID_STRATEGY_ID,
      );
    }
  });

  it("rejects strategy id mismatches on register", () => {
    const registry = StrategyRegistry.create();

    expect(() =>
      registry.register({
        strategyId: "mismatched-id",
        description: "Mismatch",
        strategy: {
          strategyId: "other-id",
          decide: () => [],
        },
      }),
    ).toThrow(StrategyRegistryError);

    try {
      registry.register({
        strategyId: "mismatched-id",
        description: "Mismatch",
        strategy: {
          strategyId: "other-id",
          decide: () => [],
        },
      });
    } catch (error) {
      expect((error as StrategyRegistryError).code).toBe(
        StrategyRegistryErrorCode.STRATEGY_ID_MISMATCH,
      );
    }
  });

  it("returns no intents for buy-first-ask when pricing is missing", () => {
    const registry = StrategyRegistry.createBuiltIn();
    const strategy = registry.resolve("buy-first-ask");
    const stepWithoutPricing: ReplayStepResult = {
      ...STEP,
      engineInput: {
        ...STEP.engineInput,
        pricing: null,
      },
    };

    expect(strategy.decide(stepWithoutPricing, CONTEXT)).toEqual([]);
  });

  it("rejects unknown strategy ids", () => {
    const registry = StrategyRegistry.createBuiltIn();

    expect(() => registry.resolve("missing-strategy")).toThrow(StrategyRegistryError);
    try {
      registry.resolve("missing-strategy");
    } catch (error) {
      expect((error as StrategyRegistryError).code).toBe(
        StrategyRegistryErrorCode.UNKNOWN_STRATEGY_ID,
      );
    }
  });

  it("rejects duplicate strategy ids on register", () => {
    const registry = StrategyRegistry.createBuiltIn();

    expect(() => registry.register(noopStrategyDefinition)).toThrow(
      StrategyRegistryError,
    );
    try {
      registry.register(noopStrategyDefinition);
    } catch (error) {
      expect((error as StrategyRegistryError).code).toBe(
        StrategyRegistryErrorCode.DUPLICATE_STRATEGY_ID,
      );
    }
  });

  it("rejects duplicate strategy ids when created from input", () => {
    expect(() =>
      StrategyRegistry.create({
        definitions: [noopStrategyDefinition, noopStrategyDefinition],
      }),
    ).toThrow(StrategyRegistryError);
  });

  it("lists strategy ids in deterministic lexicographic order", () => {
    const registry = StrategyRegistry.createBuiltIn();

    expect(registry.listStrategyIds()).toEqual([
      "buy-below-probability",
      "buy-first-ask",
      "fair-value-diffusion",
      "noop",
      "simple-mean-reversion",
      "simple-momentum",
    ]);
    expect(registry.snapshot().strategyIds).toEqual([
      "buy-below-probability",
      "buy-first-ask",
      "fair-value-diffusion",
      "noop",
      "simple-mean-reversion",
      "simple-momentum",
    ]);
  });

  it("returns an immutable registry snapshot", () => {
    const registry = StrategyRegistry.createBuiltIn();
    const snapshot = registry.snapshot();

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.strategyIds)).toBe(true);
    expect(Object.isFrozen(snapshot.definitions)).toBe(true);
    expect(() => {
      (snapshot as { strategyIds: string[] }).strategyIds = [];
    }).toThrow();
  });

  it("supports custom registries independent of built-ins", () => {
    const registry = StrategyRegistry.create().register(customStrategyDefinition());

    expect(registry.resolve("custom-alpha").decide(STEP, CONTEXT)).toEqual([
      {
        ticker: "KXBTC15M-CUSTOM",
        side: "yes",
        action: "buy",
        quantity: 3,
        limitPriceCents: 50,
        reason: "custom-alpha",
      },
    ]);
    expect(StrategyRegistry.createBuiltIn().has("custom-alpha")).toBe(false);
  });

  it("does not mutate prior registries when registering new strategies", () => {
    const base = StrategyRegistry.create();
    const extended = base.register(customStrategyDefinition());

    expect(base.has("custom-alpha")).toBe(false);
    expect(extended.has("custom-alpha")).toBe(true);
    expect(base.listStrategyIds()).toEqual([]);
    expect(extended.listStrategyIds()).toEqual(["custom-alpha"]);
  });

  it("produces deterministic strategy outputs for repeated decisions", () => {
    const registry = StrategyRegistry.createBuiltIn();
    const noop = registry.resolve("noop");
    const buyFirstAsk = registry.resolve("buy-first-ask");

    const noopFirst = noop.decide(STEP, CONTEXT);
    const noopSecond = noop.decide(STEP, CONTEXT);
    const buyFirst = buyFirstAsk.decide(STEP, CONTEXT);
    const buySecond = buyFirstAsk.decide(STEP, CONTEXT);

    expect(noopFirst).toEqual(noopSecond);
    expect(buyFirst).toEqual(buySecond);
  });
});
