import { describe, expect, it } from "vitest";

import type { ReplayStepResult } from "@/lib/data/replay/replaySessionTypes";
import type { BacktestStrategyContext } from "@/lib/data/backtesting/strategyTypes";
import { StrategyPluginRegistry } from "@/lib/data/strategies/plugin/StrategyPluginRegistry";

import {
  CALIBRATION_FADE_STRATEGY_ID,
  calibrationFadeStrategyPlugin,
} from "./calibrationFadeStrategyPlugin";

const T0 = "2026-06-26T23:15:00.000Z";
const TICKER = "KXBTC15M-HARNESS";

function createStep(yesMidCents: number): ReplayStepResult {
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
      fetchId: "fetch-harness",
    },
    engineInput: {
      evaluatedAt: T0,
      market: null,
      btc: null,
      pricing: {
        yesBidCents: yesMidCents - 2,
        yesAskCents: yesMidCents + 2,
        yesMidCents,
        noBidCents: 100 - yesMidCents - 3,
        noAskCents: 100 - yesMidCents - 1,
        noMidCents: 100 - yesMidCents - 2,
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

describe("calibrationFadeStrategyPlugin", () => {
  it("buys NO when fading overpriced YES above threshold", () => {
    const strategy = StrategyPluginRegistry.create({ plugins: [calibrationFadeStrategyPlugin] })
      .resolveBacktestStrategy(CALIBRATION_FADE_STRATEGY_ID, {
        direction: "fade-yes",
        yesMidThresholdCents: 55,
      });

    expect(strategy.decide(createStep(60), CONTEXT)).toEqual([
      {
        ticker: TICKER,
        side: "no",
        action: "buy",
        quantity: 1,
        limitPriceCents: 39,
        reason: CALIBRATION_FADE_STRATEGY_ID,
      },
    ]);
    expect(strategy.decide(createStep(50), CONTEXT)).toEqual([]);
  });

  it("buys YES when fading underpriced YES below threshold", () => {
    const strategy = StrategyPluginRegistry.create({ plugins: [calibrationFadeStrategyPlugin] })
      .resolveBacktestStrategy(CALIBRATION_FADE_STRATEGY_ID, {
        direction: "fade-no",
        yesMidThresholdCents: 45,
      });

    expect(strategy.decide(createStep(40), CONTEXT)).toEqual([
      {
        ticker: TICKER,
        side: "yes",
        action: "buy",
        quantity: 1,
        limitPriceCents: 42,
        reason: CALIBRATION_FADE_STRATEGY_ID,
      },
    ]);
    expect(strategy.decide(createStep(50), CONTEXT)).toEqual([]);
  });
});
