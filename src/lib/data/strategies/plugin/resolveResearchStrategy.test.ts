import { describe, expect, it } from "vitest";
import { z } from "zod";

import type { ReplayStepResult } from "@/lib/data/replay/replaySessionTypes";
import type { BacktestStrategyContext } from "@/lib/data/backtesting/strategyTypes";

import {
  StrategyPluginRegistry,
  StrategyPluginError,
  StrategyPluginErrorCode,
  adaptStrategyPluginToBacktestStrategy,
  resolveResearchStrategy,
} from "./index";
import type { StrategyPlugin } from "./strategyPluginTypes";

const T0 = "2026-06-26T23:15:00.000Z";
const TICKER = "KXBTC15M-PLUGIN";

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
    fetchId: "fetch-plugin",
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

const counterConfigSchema = z.object({
  maxTicks: z.number().int().positive(),
});

type CounterConfig = z.infer<typeof counterConfigSchema>;

function counterStrategyPlugin(): StrategyPlugin<CounterConfig> {
  return {
    strategyId: "counter",
    description: "Counts ticks until maxTicks",
    configSchema: counterConfigSchema,
    createInitialState: () => ({ tickCount: 0 }),
    decide: ({ state, config }) => {
      const tickCount = Number(state.tickCount ?? 0) + 1;
      return {
        intents:
          tickCount >= config.maxTicks
            ? [
                {
                  ticker: TICKER,
                  side: "yes",
                  action: "buy",
                  quantity: 1,
                  limitPriceCents: 50,
                  reason: "counter",
                },
              ]
            : [],
        nextState: { tickCount },
      };
    },
  };
}

describe("StrategyPluginRegistry", () => {
  it("resolves built-in baseline strategy plugins", () => {
    const registry = StrategyPluginRegistry.createBuiltIn();

    expect(registry.listStrategyIds()).toEqual([
      "buy-below-probability",
      "buy-first-ask",
      "noop",
      "simple-mean-reversion",
      "simple-momentum",
    ]);
    expect(registry.resolveBacktestStrategy("noop").decide(STEP, CONTEXT)).toEqual([]);
    expect(registry.resolveBacktestStrategy("buy-first-ask").decide(STEP, CONTEXT)).toEqual([
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

  it("rejects unknown strategy ids", () => {
    const registry = StrategyPluginRegistry.createBuiltIn();

    expect(() => registry.getPlugin("missing")).toThrow(StrategyPluginError);
    try {
      registry.getPlugin("missing");
    } catch (error) {
      expect((error as StrategyPluginError).code).toBe(
        StrategyPluginErrorCode.UNKNOWN_STRATEGY_ID,
      );
    }
  });

  it("rejects invalid strategy configs", () => {
    const registry = StrategyPluginRegistry.createBuiltIn();

    expect(() =>
      registry.parseConfig("noop", { unexpected: true }),
    ).toThrow(StrategyPluginError);
    try {
      registry.parseConfig("noop", { unexpected: true });
    } catch (error) {
      expect((error as StrategyPluginError).code).toBe(
        StrategyPluginErrorCode.INVALID_STRATEGY_CONFIG,
      );
    }
  });

  it("supports custom plugins via register", () => {
    const registry = StrategyPluginRegistry.create().register(counterStrategyPlugin());
    const strategy = registry.resolveBacktestStrategy("counter", { maxTicks: 2 });

    expect(strategy.decide(STEP, CONTEXT)).toEqual([]);
    expect(strategy.decide(STEP, CONTEXT)).toEqual([
      {
        ticker: TICKER,
        side: "yes",
        action: "buy",
        quantity: 1,
        limitPriceCents: 50,
        reason: "counter",
      },
    ]);
  });

  it("produces deterministic outputs for repeated decisions", () => {
    const registry = StrategyPluginRegistry.createBuiltIn();
    const noop = registry.resolveBacktestStrategy("noop");
    const buyFirstAsk = registry.resolveBacktestStrategy("buy-first-ask");

    expect(noop.decide(STEP, CONTEXT)).toEqual(noop.decide(STEP, CONTEXT));
    expect(buyFirstAsk.decide(STEP, CONTEXT)).toEqual(
      buyFirstAsk.decide(STEP, CONTEXT),
    );
  });
});

describe("adaptStrategyPluginToBacktestStrategy", () => {
  it("carries deterministic plugin state across decide calls", () => {
    const plugin = counterStrategyPlugin();
    const strategy = adaptStrategyPluginToBacktestStrategy(plugin, { maxTicks: 1 });

    expect(strategy.decide(STEP, CONTEXT)).toEqual([
      {
        ticker: TICKER,
        side: "yes",
        action: "buy",
        quantity: 1,
        limitPriceCents: 50,
        reason: "counter",
      },
    ]);
    expect(strategy.decide(STEP, CONTEXT)).toEqual([
      {
        ticker: TICKER,
        side: "yes",
        action: "buy",
        quantity: 1,
        limitPriceCents: 50,
        reason: "counter",
      },
    ]);
  });
});

describe("resolveResearchStrategy", () => {
  it("resolves built-in strategies with optional config injection", () => {
    const registry = StrategyPluginRegistry.createBuiltIn();
    const strategy = resolveResearchStrategy({
      strategyId: "buy-first-ask",
      strategyConfig: {},
      registry,
    });

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

  it("defaults strategy config to an empty object", () => {
    const strategy = resolveResearchStrategy({ strategyId: "noop" });
    expect(strategy.decide(STEP, CONTEXT)).toEqual([]);
  });
});
