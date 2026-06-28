import { describe, expect, it } from "vitest";

import {
  computeBacktestMetrics,
  serializeBacktestMetrics,
} from "./BacktestMetrics";
import { BacktestMetricsError, BacktestMetricsErrorCode } from "./errors";
import type {
  BacktestEquityPoint,
  ClosedTradeSummary,
} from "./metricsTypes";

const START_TS = "2026-06-26T23:15:00.000Z";
const MID_TS = "2026-06-26T23:30:00.000Z";
const END_TS = "2026-06-26T23:45:00.000Z";

function point(
  stepIndex: number,
  timestamp: string,
  equityCents: number,
): BacktestEquityPoint {
  return { stepIndex, timestamp, equityCents };
}

function trade(
  tradeId: string,
  realizedPnlCents: number,
): ClosedTradeSummary {
  return {
    tradeId,
    ticker: "KXBTC15M-TEST",
    openedAt: START_TS,
    closedAt: MID_TS,
    realizedPnlCents,
    entryNotionalCents: 10_000,
    exitNotionalCents: 10_000 + realizedPnlCents,
  };
}

describe("computeBacktestMetrics", () => {
  it("summarizes a profitable equity curve", () => {
    const metrics = computeBacktestMetrics({
      equityCurve: [
        point(0, START_TS, 100_000),
        point(1, MID_TS, 110_000),
        point(2, END_TS, 120_000),
      ],
      closedTrades: [trade("t1", 5_000), trade("t2", 5_000)],
    });

    expect(metrics.totalPnlCents).toBe(20_000);
    expect(metrics.totalReturnPct).toBe(20);
    expect(metrics.startEquityCents).toBe(100_000);
    expect(metrics.endEquityCents).toBe(120_000);
    expect(metrics.tradeCount).toBe(2);
    expect(metrics.winRatePct).toBe(100);
    expect(metrics.profitFactor).toBeNull();
  });

  it("summarizes a losing equity curve", () => {
    const metrics = computeBacktestMetrics({
      equityCurve: [
        point(0, START_TS, 100_000),
        point(1, END_TS, 80_000),
      ],
      closedTrades: [trade("t1", -10_000), trade("t2", -10_000)],
    });

    expect(metrics.totalPnlCents).toBe(-20_000);
    expect(metrics.totalReturnPct).toBe(-20);
    expect(metrics.lossRatePct).toBe(100);
    expect(metrics.profitFactor).toBe(0);
  });

  it("handles a flat equity curve", () => {
    const metrics = computeBacktestMetrics({
      equityCurve: [
        point(0, START_TS, 100_000),
        point(1, MID_TS, 100_000),
        point(2, END_TS, 100_000),
      ],
      closedTrades: [],
    });

    expect(metrics.totalReturnPct).toBe(0);
    expect(metrics.maxDrawdownCents).toBe(0);
    expect(metrics.maxDrawdownPct).toBe(0);
    expect(metrics.tradeCount).toBe(0);
    expect(metrics.expectancyCents).toBe(0);
  });

  it("computes max drawdown from peak to trough", () => {
    const metrics = computeBacktestMetrics({
      equityCurve: [
        point(0, START_TS, 100_000),
        point(1, MID_TS, 130_000),
        point(2, END_TS, 91_000),
      ],
      closedTrades: [],
    });

    expect(metrics.peakEquityCents).toBe(130_000);
    expect(metrics.troughEquityCents).toBe(91_000);
    expect(metrics.maxDrawdownCents).toBe(39_000);
    expect(metrics.maxDrawdownPct).toBeCloseTo(30, 5);
  });

  it("handles empty trades", () => {
    const metrics = computeBacktestMetrics({
      equityCurve: [point(0, START_TS, 50_000)],
      closedTrades: [],
    });

    expect(metrics.tradeCount).toBe(0);
    expect(metrics.winRatePct).toBe(0);
    expect(metrics.lossRatePct).toBe(0);
    expect(metrics.averageWinCents).toBe(0);
    expect(metrics.averageLossCents).toBe(0);
    expect(metrics.profitFactor).toBeNull();
    expect(metrics.expectancyCents).toBe(0);
  });

  it("handles all winning trades", () => {
    const metrics = computeBacktestMetrics({
      equityCurve: [point(0, START_TS, 100_000), point(1, END_TS, 115_000)],
      closedTrades: [trade("t1", 7_500), trade("t2", 7_500)],
    });

    expect(metrics.winningTradeCount).toBe(2);
    expect(metrics.losingTradeCount).toBe(0);
    expect(metrics.averageWinCents).toBe(7_500);
    expect(metrics.averageLossCents).toBe(0);
    expect(metrics.profitFactor).toBeNull();
  });

  it("handles all losing trades", () => {
    const metrics = computeBacktestMetrics({
      equityCurve: [point(0, START_TS, 100_000), point(1, END_TS, 85_000)],
      closedTrades: [trade("t1", -7_500), trade("t2", -7_500)],
    });

    expect(metrics.losingTradeCount).toBe(2);
    expect(metrics.averageLossCents).toBe(-7_500);
    expect(metrics.profitFactor).toBe(0);
  });

  it("handles breakeven trades", () => {
    const metrics = computeBacktestMetrics({
      equityCurve: [point(0, START_TS, 100_000), point(1, END_TS, 100_000)],
      closedTrades: [trade("t1", 0), trade("t2", 0)],
    });

    expect(metrics.breakevenTradeCount).toBe(2);
    expect(metrics.winningTradeCount).toBe(0);
    expect(metrics.losingTradeCount).toBe(0);
    expect(metrics.profitFactor).toBe(0);
  });

  it("computes profit factor when wins and losses both exist", () => {
    const metrics = computeBacktestMetrics({
      equityCurve: [point(0, START_TS, 100_000), point(1, END_TS, 105_000)],
      closedTrades: [trade("t1", 10_000), trade("t2", -5_000)],
    });

    expect(metrics.profitFactor).toBe(2);
    expect(metrics.expectancyCents).toBe(2_500);
  });

  it("rejects an empty equity curve", () => {
    expect(() =>
      computeBacktestMetrics({
        equityCurve: [],
        closedTrades: [],
      }),
    ).toThrow(BacktestMetricsError);

    try {
      computeBacktestMetrics({
        equityCurve: [],
        closedTrades: [],
      });
    } catch (error) {
      expect((error as BacktestMetricsError).code).toBe(
        BacktestMetricsErrorCode.EMPTY_EQUITY_CURVE,
      );
    }
  });

  it("rejects negative equity values", () => {
    expect(() =>
      computeBacktestMetrics({
        equityCurve: [point(0, START_TS, -1)],
        closedTrades: [],
      }),
    ).toThrow(BacktestMetricsError);

    try {
      computeBacktestMetrics({
        equityCurve: [point(0, START_TS, -1)],
        closedTrades: [],
      });
    } catch (error) {
      expect((error as BacktestMetricsError).code).toBe(
        BacktestMetricsErrorCode.NEGATIVE_EQUITY,
      );
    }
  });

  it("rejects zero starting equity", () => {
    expect(() =>
      computeBacktestMetrics({
        equityCurve: [point(0, START_TS, 0)],
        closedTrades: [],
      }),
    ).toThrow(BacktestMetricsError);
  });

  it("produces deterministic repeated calculation output", () => {
    const input = {
      equityCurve: [
        point(0, START_TS, 100_000),
        point(1, MID_TS, 120_000),
        point(2, END_TS, 110_000),
      ],
      closedTrades: [trade("t1", 5_000), trade("t2", -2_000)],
      periodsPerYear: 365,
      riskFreeRatePerPeriod: 0.0001,
    };

    const first = serializeBacktestMetrics(computeBacktestMetrics(input));
    const second = serializeBacktestMetrics(computeBacktestMetrics(input));

    expect(first).toBe(second);
  });

  it("does not mutate input arrays", () => {
    const equityCurve = [
      point(1, END_TS, 110_000),
      point(0, START_TS, 100_000),
    ];
    const closedTrades = [trade("t1", 5_000)];
    const equitySnapshot = JSON.stringify(equityCurve);
    const tradesSnapshot = JSON.stringify(closedTrades);

    computeBacktestMetrics({ equityCurve, closedTrades });

    expect(JSON.stringify(equityCurve)).toBe(equitySnapshot);
    expect(JSON.stringify(closedTrades)).toBe(tradesSnapshot);
  });

  it("computes optional annualized return, volatility, and Sharpe", () => {
    const metrics = computeBacktestMetrics({
      equityCurve: [
        point(0, START_TS, 100_000),
        point(1, MID_TS, 110_000),
        point(2, END_TS, 105_000),
      ],
      closedTrades: [],
      periodsPerYear: 365,
      riskFreeRatePerPeriod: 0,
    });

    expect(metrics.annualizedReturnPct).not.toBeNull();
    expect(metrics.returnVolatilityPct).toBeGreaterThan(0);
    expect(metrics.sharpeRatio).not.toBeNull();
  });

  it("returns null Sharpe when period-return volatility is zero", () => {
    const metrics = computeBacktestMetrics({
      equityCurve: [
        point(0, START_TS, 100_000),
        point(1, MID_TS, 100_000),
        point(2, END_TS, 100_000),
      ],
      closedTrades: [],
      periodsPerYear: 365,
      riskFreeRatePerPeriod: 0,
    });

    expect(metrics.returnVolatilityPct).toBe(0);
    expect(metrics.sharpeRatio).toBeNull();
  });

  it("rejects invalid optional configuration", () => {
    const baseInput = {
      equityCurve: [point(0, START_TS, 100_000), point(1, END_TS, 110_000)],
      closedTrades: [] as ClosedTradeSummary[],
    };

    expect(() =>
      computeBacktestMetrics({ ...baseInput, periodsPerYear: 0 }),
    ).toThrow(BacktestMetricsError);

    expect(() =>
      computeBacktestMetrics({ ...baseInput, periodsPerYear: Number.NaN }),
    ).toThrow(BacktestMetricsError);

    expect(() =>
      computeBacktestMetrics({
        ...baseInput,
        riskFreeRatePerPeriod: Number.POSITIVE_INFINITY,
      }),
    ).toThrow(BacktestMetricsError);
  });
});
