import { describe, expect, it } from "vitest";

import type { ReplayStepResult } from "@/lib/data/replay/replaySessionTypes";
import type { BacktestStrategyContext } from "@/lib/data/backtesting/strategyTypes";

import {
  StrategyPluginError,
  StrategyPluginErrorCode,
  createBuiltInStrategyPluginRegistry,
  resolveResearchStrategy,
} from "@/lib/data/strategies";

const T0 = "2026-06-26T23:15:00.000Z";
const TICKER = "KXBTC15M-FVD";

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

function buildFlatCandles(
  close: number,
  count: number,
  startTimestamp = 1_700_000_000_000,
) {
  return Array.from({ length: count }, (_, index) => ({
    timestamp: startTimestamp + index * 60_000,
    open: close,
    high: close,
    low: close,
    close,
  }));
}

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
      fetchId: "fetch-fvd",
    },
    engineInput: {
      evaluatedAt: T0,
      market: {
        strikePrice: 60_000,
        timeRemainingMs: 900_000,
        closeTime: T0,
      },
      btc: {
        price: 61_000,
        change24hPercent: null,
        feedStatus: "live",
        providerSource: "upstream",
        candles: buildFlatCandles(61_000, 12),
      },
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

describe("fairValueDiffusionStrategyPlugin", () => {
  const defaultConfig = {
    volatilityLookbackBars: 10,
    minimumEdgeThresholdCents: 5,
    minimumTimeRemainingMs: 60_000,
    maxPositionSize: 2,
  };

  it("registers in the built-in strategy pack", () => {
    const registry = createBuiltInStrategyPluginRegistry();
    expect(registry.has("fair-value-diffusion")).toBe(true);
    expect(registry.listStrategyIds()).toContain("fair-value-diffusion");
  });

  it("rejects invalid strategy configs", () => {
    const registry = createBuiltInStrategyPluginRegistry();
    expect(() =>
      registry.parseConfig("fair-value-diffusion", { maxPositionSize: 0 }),
    ).toThrow(StrategyPluginError);
    try {
      registry.parseConfig("fair-value-diffusion", { maxPositionSize: 0 });
    } catch (error) {
      expect((error as StrategyPluginError).code).toBe(
        StrategyPluginErrorCode.INVALID_STRATEGY_CONFIG,
      );
    }
  });

  it("does not trade when strike is missing", () => {
    const strategy = resolveResearchStrategy({
      strategyId: "fair-value-diffusion",
      strategyConfig: defaultConfig,
    });

    expect(
      strategy.decide(
        createStep({
          market: {
            strikePrice: null,
            timeRemainingMs: 900_000,
            closeTime: T0,
          },
        }),
        CONTEXT,
      ),
    ).toEqual([]);
  });

  it("does not trade when volatility history is missing", () => {
    const strategy = resolveResearchStrategy({
      strategyId: "fair-value-diffusion",
      strategyConfig: defaultConfig,
    });

    expect(
      strategy.decide(
        createStep({
          btc: {
            price: 61_000,
            change24hPercent: null,
            feedStatus: "live",
            providerSource: "upstream",
            candles: [],
          },
        }),
        CONTEXT,
      ),
    ).toEqual([]);
  });

  it("does not trade when history is insufficient", () => {
    const strategy = resolveResearchStrategy({
      strategyId: "fair-value-diffusion",
      strategyConfig: defaultConfig,
    });

    expect(
      strategy.decide(
        createStep({
          btc: {
            price: 61_000,
            change24hPercent: null,
            feedStatus: "live",
            providerSource: "upstream",
            candles: buildFlatCandles(61_000, 5),
          },
        }),
        CONTEXT,
      ),
    ).toEqual([]);
  });

  it("buys YES when fair probability exceeds implied mid by the edge threshold", () => {
    const strategy = resolveResearchStrategy({
      strategyId: "fair-value-diffusion",
      strategyConfig: defaultConfig,
    });
    const step = createStep();
    const intents = strategy.decide(step, CONTEXT);

    expect(intents).toEqual([
      {
        ticker: TICKER,
        side: "yes",
        action: "buy",
        quantity: 2,
        limitPriceCents: 52,
        reason: "fair-value-diffusion",
      },
    ]);
  });

  it("buys NO when implied mid exceeds fair probability by the edge threshold", () => {
    const strategy = resolveResearchStrategy({
      strategyId: "fair-value-diffusion",
      strategyConfig: defaultConfig,
    });

    const intents = strategy.decide(
      createStep({
        market: {
          strikePrice: 60_000,
          timeRemainingMs: 900_000,
          closeTime: T0,
        },
        btc: {
          price: 59_000,
          change24hPercent: null,
          feedStatus: "live",
          providerSource: "upstream",
          candles: buildFlatCandles(59_000, 12),
        },
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
      }),
      CONTEXT,
    );

    expect(intents).toEqual([
      {
        ticker: TICKER,
        side: "no",
        action: "buy",
        quantity: 2,
        limitPriceCents: 51,
        reason: "fair-value-diffusion",
      },
    ]);
  });

  it("does not trade when edge is below the threshold", () => {
    const strategy = resolveResearchStrategy({
      strategyId: "fair-value-diffusion",
      strategyConfig: {
        ...defaultConfig,
        minimumEdgeThresholdCents: 60,
      },
    });

    expect(strategy.decide(createStep(), CONTEXT)).toEqual([]);
  });

  it("does not trade when time remaining is below the minimum", () => {
    const strategy = resolveResearchStrategy({
      strategyId: "fair-value-diffusion",
      strategyConfig: defaultConfig,
    });

    expect(
      strategy.decide(
        createStep({
          market: {
            strikePrice: 60_000,
            timeRemainingMs: 30_000,
            closeTime: T0,
          },
        }),
        CONTEXT,
      ),
    ).toEqual([]);
  });

  it("produces deterministic outputs across repeated replay steps", () => {
    const strategy = resolveResearchStrategy({
      strategyId: "fair-value-diffusion",
      strategyConfig: defaultConfig,
    });
    const step = createStep();

    expect(strategy.decide(step, CONTEXT)).toEqual(strategy.decide(step, CONTEXT));
    expect(strategy.decide(step, CONTEXT)).toEqual(strategy.decide(step, CONTEXT));
  });
});
