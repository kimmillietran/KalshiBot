import { describe, expect, it } from "vitest";
import { z } from "zod";

import type { ReplayStepResult } from "@/lib/data/replay/replaySessionTypes";
import type { BacktestStrategyContext } from "@/lib/data/backtesting/strategyTypes";

import {
  BASELINE_STRATEGY_IDS,
  createBaselineStrategyPluginRegistry,
  createBuiltInStrategyPluginRegistry,
  StrategyRegistry,
  StrategyPluginRegistry,
  StrategyPluginError,
  StrategyPluginErrorCode,
  adaptStrategyPluginToBacktestStrategy,
  resolveResearchStrategy,
} from "@/lib/data/strategies";
import type { StrategyPlugin } from "@/lib/data/strategies";

const T0 = "2026-06-26T23:15:00.000Z";
const TICKER = "KXBTC15M-BASELINE";

function createStep(
  overrides: Partial<ReplayStepResult["engineInput"]> = {},
): ReplayStepResult {
  return {
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
      fetchId: "fetch-baseline",
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
      ...overrides,
    },
    engineOutput: {
      action: "NO TRADE",
      reasoning: [],
    } as ReplayStepResult["engineOutput"],
    sourceSnapshot: {} as ReplayStepResult["sourceSnapshot"],
  };
}

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

describe("baseline strategy pack", () => {
  it("registers all baseline strategy ids in deterministic order", () => {
    const registry = createBuiltInStrategyPluginRegistry();
    expect(registry.listStrategyIds()).toEqual([...BASELINE_STRATEGY_IDS].sort());
    expect(StrategyRegistry.createBuiltIn().listStrategyIds()).toEqual(
      [...BASELINE_STRATEGY_IDS].sort(),
    );
  });

  it("allows include/exclude via createBaselineStrategyPluginRegistry", () => {
    const registry = createBaselineStrategyPluginRegistry(["noop", "simple-momentum"]);
    expect(registry.listStrategyIds()).toEqual(["noop", "simple-momentum"]);
    expect(registry.has("buy-first-ask")).toBe(false);
  });

  it("never emits trades for noop", () => {
    const strategy = resolveResearchStrategy({ strategyId: "noop" });
    expect(strategy.decide(createStep(), CONTEXT)).toEqual([]);
  });

  it("resolves buy-first-ask deterministically", () => {
    const strategy = resolveResearchStrategy({ strategyId: "buy-first-ask" });
    const intents = strategy.decide(createStep(), CONTEXT);
    expect(intents).toEqual([
      {
        ticker: TICKER,
        side: "yes",
        action: "buy",
        quantity: 1,
        limitPriceCents: 52,
        reason: "buy-first-ask",
      },
    ]);
    expect(strategy.decide(createStep(), CONTEXT)).toEqual(intents);
  });

  it("buys below the configured probability threshold", () => {
    const strategy = resolveResearchStrategy({
      strategyId: "buy-below-probability",
      strategyConfig: { maxYesMidCents: 55 },
    });

    expect(strategy.decide(createStep(), CONTEXT)).toEqual([
      {
        ticker: TICKER,
        side: "yes",
        action: "buy",
        quantity: 1,
        limitPriceCents: 52,
        reason: "buy-below-probability",
      },
    ]);

    const blocked = resolveResearchStrategy({
      strategyId: "buy-below-probability",
      strategyConfig: { maxYesMidCents: 45 },
    });
    expect(blocked.decide(createStep(), CONTEXT)).toEqual([]);
  });

  it("uses BTC momentum for simple-momentum", () => {
    const strategy = resolveResearchStrategy({
      strategyId: "simple-momentum",
      strategyConfig: { lookbackBars: 3, momentumThresholdPct: 0.1 },
    });

    const step = createStep({
      btc: {
        price: 60_100,
        change24hPercent: null,
        feedStatus: "live",
        providerSource: "upstream",
        candles: [
          { timestamp: 1, open: 100, high: 101, low: 99, close: 100 },
          { timestamp: 2, open: 100, high: 102, low: 99, close: 101 },
          { timestamp: 3, open: 101, high: 103, low: 100, close: 102 },
        ],
      },
    });

    expect(strategy.decide(step, CONTEXT)).toEqual([
      {
        ticker: TICKER,
        side: "yes",
        action: "buy",
        quantity: 1,
        limitPriceCents: 52,
        reason: "simple-momentum",
      },
    ]);
  });

  it("uses rolling yes mids for simple-mean-reversion", () => {
    const strategy = resolveResearchStrategy({
      strategyId: "simple-mean-reversion",
      strategyConfig: { windowSize: 3, deviationCents: 2 },
    });

    const mids = [50, 50, 50];
    for (const yesMidCents of mids) {
      expect(
        strategy.decide(
          createStep({
            pricing: {
              yesBidCents: yesMidCents - 1,
              yesAskCents: yesMidCents + 1,
              yesMidCents,
              noBidCents: 49,
              noAskCents: 51,
              noMidCents: 49,
              liquidityQuality: "Fair",
              volumeDollars: null,
            },
          }),
          CONTEXT,
        ),
      ).toEqual([]);
    }

    expect(
      strategy.decide(
        createStep({
          pricing: {
            yesBidCents: 43,
            yesAskCents: 45,
            yesMidCents: 44,
            noBidCents: 55,
            noAskCents: 57,
            noMidCents: 56,
            liquidityQuality: "Fair",
            volumeDollars: null,
          },
        }),
        CONTEXT,
      ),
    ).toEqual([
      {
        ticker: TICKER,
        side: "yes",
        action: "buy",
        quantity: 1,
        limitPriceCents: 45,
        reason: "simple-mean-reversion",
      },
    ]);
  });

  it("rejects invalid strategy configs", () => {
    const registry = createBuiltInStrategyPluginRegistry();
    expect(() =>
      registry.parseConfig("buy-below-probability", { maxYesMidCents: 200 }),
    ).toThrow(StrategyPluginError);
    try {
      registry.parseConfig("buy-below-probability", { maxYesMidCents: 200 });
    } catch (error) {
      expect((error as StrategyPluginError).code).toBe(
        StrategyPluginErrorCode.INVALID_STRATEGY_CONFIG,
      );
    }
  });
});

describe("StrategyPluginRegistry", () => {
  it("supports custom plugin registration", () => {
    const customPlugin: StrategyPlugin<{ label: string }> = {
      strategyId: "custom-counter",
      description: "Custom test plugin",
      configSchema: z.object({ label: z.string().default("test") }).strict(),
      createInitialState: () => ({ count: 0 }),
      decide: ({ state }) => ({
        intents: [],
        nextState: { count: Number(state.count ?? 0) + 1 },
      }),
    };

    const registry = StrategyPluginRegistry.create().register(customPlugin);
    const strategy = adaptStrategyPluginToBacktestStrategy(customPlugin, { label: "test" });
    expect(strategy.decide(createStep(), CONTEXT)).toEqual([]);
    expect(registry.has("custom-counter")).toBe(true);
  });
});
