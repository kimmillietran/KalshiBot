import { describe, expect, it } from "vitest";

import type { ReplayStepResult } from "@/lib/data/replay/replaySessionTypes";

import { BacktestLedger } from "./BacktestLedger";
import { deriveBacktestMetricsInput } from "./deriveBacktestMetricsInput";
import type { TradeFillInput } from "./ledgerTypes";

const T0 = "2026-06-26T23:15:00.000Z";
const T1 = "2026-06-26T23:30:00.000Z";
const TICKER = "KXBTC15M-TEST";

function buyFill(overrides: Partial<TradeFillInput> = {}): TradeFillInput {
  return {
    ticker: TICKER,
    side: "yes",
    action: "buy",
    priceCents: 48,
    quantity: 10,
    feeCents: 5,
    occurredAt: T0,
    sourceStepIndex: 0,
    ...overrides,
  };
}

function sellFill(overrides: Partial<TradeFillInput> = {}): TradeFillInput {
  return buyFill({
    action: "sell",
    priceCents: 55,
    feeCents: 3,
    occurredAt: T1,
    sourceStepIndex: 1,
    ...overrides,
  });
}

function replayStep(stepIndex: number): ReplayStepResult {
  return {
    stepIndex,
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
      fetchId: "fetch-test",
    },
    engineInput: {
      evaluatedAt: stepIndex === 0 ? T0 : T1,
      pricing: {
        yesBidCents: 47,
        yesAskCents: 53,
        yesMidCents: 50,
        noBidCents: 46,
        noAskCents: 52,
        noMidCents: 49,
      },
    },
    engineOutput: {
      action: "NO TRADE",
      reasoning: [],
    },
    sourceSnapshot: {} as ReplayStepResult["sourceSnapshot"],
  };
}

describe("deriveBacktestMetricsInput", () => {
  it("derives closed trades using weighted-average cost basis", () => {
    const ledger = BacktestLedger.create(100_000)
      .recordFill(buyFill({ quantity: 10, priceCents: 40 }))
      .recordFill(buyFill({ quantity: 10, priceCents: 60, occurredAt: T0 }))
      .recordFill(sellFill({ quantity: 10, priceCents: 55 }));

    const { closedTrades } = deriveBacktestMetricsInput({
      replayResults: [replayStep(0), replayStep(1)],
      fills: ledger.snapshot().fills,
      initialCashCents: 100_000,
    });

    expect(closedTrades).toHaveLength(1);
    expect(closedTrades[0]?.realizedPnlCents).toBe((55 - 50) * 10 - 3);
  });

  it("builds an equity curve from replay steps and ledger fills", () => {
    const ledger = BacktestLedger.create(10_000).recordFill(buyFill());
    const replayResults = [replayStep(0), replayStep(1)];

    const { equityCurve } = deriveBacktestMetricsInput({
      replayResults,
      fills: ledger.snapshot().fills,
      initialCashCents: 10_000,
    });

    expect(equityCurve).toHaveLength(2);
    expect(equityCurve[0]?.stepIndex).toBe(0);
    expect(equityCurve[0]?.equityCents).toBeGreaterThan(0);
    expect(equityCurve[1]?.equityCents).toBe(equityCurve[0]?.equityCents);
  });

  it("passes optional metrics configuration through", () => {
    const result = deriveBacktestMetricsInput({
      replayResults: [replayStep(0)],
      fills: [],
      initialCashCents: 10_000,
      periodsPerYear: 365,
      riskFreeRatePerPeriod: 0.0001,
    });

    expect(result.periodsPerYear).toBe(365);
    expect(result.riskFreeRatePerPeriod).toBe(0.0001);
  });

  it("does not mutate input arrays", () => {
    const replayResults = [replayStep(0)];
    const fills = BacktestLedger.create(10_000).recordFill(buyFill()).snapshot().fills;
    const replaySnapshot = JSON.stringify(replayResults);
    const fillsSnapshot = JSON.stringify(fills);

    deriveBacktestMetricsInput({
      replayResults,
      fills,
      initialCashCents: 10_000,
    });

    expect(JSON.stringify(replayResults)).toBe(replaySnapshot);
    expect(JSON.stringify(fills)).toBe(fillsSnapshot);
  });
});
