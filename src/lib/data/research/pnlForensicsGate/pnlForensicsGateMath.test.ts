import { describe, expect, it } from "vitest";

import { createPnlForensicsGateConfig } from "./pnlForensicsGateConfig";
import {
  aggregateDailyPnl,
  aggregateMarketConcentration,
  aggregateMonthlyPnl,
  aggregateSideBreakdown,
  computeDailyConcentration,
  evaluateFamilyForensicsVerdict,
  evaluateHypothesisForensicsVerdict,
  resolveSideBucket,
} from "./pnlForensicsGateMath";
import type { PnlForensicsFilledTrade } from "./pnlForensicsGateTypes";

function trade(partial: Partial<PnlForensicsFilledTrade> & Pick<PnlForensicsFilledTrade, "hypothesisId" | "marketId" | "netPnlCents">): PnlForensicsFilledTrade {
  return {
    suggestedStrategyFamily: "calibration-no-fade",
    sideBucket: "calibration-no-fade",
    contractSide: "no",
    marketTicker: partial.marketId.split(":")[1] ?? partial.marketId,
    tradingDayUtc: "2026-05-01",
    calendarMonth: "2026-05",
    grossPnlCents: partial.netPnlCents,
    entryPriceCents: 30,
    feeCents: 1,
    volatilityRegime: null,
    trendRegime: null,
    marketState: null,
    ...partial,
  };
}

describe("resolveSideBucket", () => {
  it("maps calibration fade sides", () => {
    expect(
      resolveSideBucket({
        side: "no",
        calibrationDirection: "over",
        rationale: "",
      }),
    ).toBe("calibration-no-fade");
    expect(
      resolveSideBucket({
        side: "yes",
        calibrationDirection: "under",
        rationale: "",
      }),
    ).toBe("calibration-yes-fade");
  });
});

describe("aggregation", () => {
  const config = createPnlForensicsGateConfig();

  it("aggregates side, day, month, and market buckets", () => {
    const trades = [
      trade({ hypothesisId: "h1", marketId: "s:m1", netPnlCents: 100, tradingDayUtc: "2026-05-01", calendarMonth: "2026-05" }),
      trade({ hypothesisId: "h1", marketId: "s:m1", netPnlCents: 50, tradingDayUtc: "2026-05-01", calendarMonth: "2026-05" }),
      trade({ hypothesisId: "h2", marketId: "s:m2", netPnlCents: 25, tradingDayUtc: "2026-05-02", calendarMonth: "2026-05", sideBucket: "calibration-yes-fade", contractSide: "yes" }),
      trade({ hypothesisId: "h2", marketId: "s:m3", netPnlCents: -10, tradingDayUtc: "2026-06-01", calendarMonth: "2026-06" }),
    ];

    const familyNet = 165;
    const side = aggregateSideBreakdown(trades, familyNet, config);
    const daily = aggregateDailyPnl(trades);
    const monthly = aggregateMonthlyPnl(trades, familyNet, config);
    const market = aggregateMarketConcentration(trades, familyNet);

    expect(side).toHaveLength(2);
    expect(daily).toHaveLength(3);
    expect(monthly).toHaveLength(2);
    expect(market.entries[0]?.filledTradeCount).toBe(2);
    expect(market.summary.maxTradesPerMarket).toBe(2);
  });

  it("aggregates repeated entries in one market at market level", () => {
    const trades = [
      trade({ hypothesisId: "h1", marketId: "s:m1", netPnlCents: 40 }),
      trade({ hypothesisId: "h1", marketId: "s:m1", netPnlCents: 30 }),
      trade({ hypothesisId: "h1", marketId: "s:m1", netPnlCents: 20 }),
    ];
    const market = aggregateMarketConcentration(trades, 90);

    expect(market.entries).toHaveLength(1);
    expect(market.entries[0]?.netPnlCents).toBe(90);
    expect(market.entries[0]?.filledTradeCount).toBe(3);
  });
});

describe("concentration warnings", () => {
  const config = createPnlForensicsGateConfig({
    topDayMaxShareOfPositivePnl: 0.5,
    topMarketMaxShareOfTotalPnl: 0.4,
    maxSideShareOfPositivePnl: 0.9,
    repeatedEntryTradesPerMarketWarning: 3,
  });

  it("flags top day concentration", () => {
    const trades = [
      trade({ hypothesisId: "h1", marketId: "s:m1", netPnlCents: 90, tradingDayUtc: "2026-05-01" }),
      trade({ hypothesisId: "h1", marketId: "s:m2", netPnlCents: 10, tradingDayUtc: "2026-05-02" }),
    ];
    const daily = aggregateDailyPnl(trades);
    const verdict = evaluateHypothesisForensicsVerdict({
      trades,
      dailyPnl: daily,
      sideBreakdown: aggregateSideBreakdown(trades, 100, config),
      monthlyPnl: aggregateMonthlyPnl(trades, 100, config),
      marketEntries: aggregateMarketConcentration(trades, 100).entries,
      config,
    });

    expect(verdict.verdict).toBe("warning-concentrated-day");
  });

  it("flags top market concentration", () => {
    const trades = [
      trade({ hypothesisId: "h1", marketId: "s:m1", netPnlCents: 40, tradingDayUtc: "2026-05-01", calendarMonth: "2026-05" }),
      trade({ hypothesisId: "h1", marketId: "s:m2", netPnlCents: 20, tradingDayUtc: "2026-06-01", calendarMonth: "2026-06" }),
      trade({ hypothesisId: "h1", marketId: "s:m1", netPnlCents: 40, tradingDayUtc: "2026-07-01", calendarMonth: "2026-07" }),
    ];
    const daily = aggregateDailyPnl(trades);
    const market = aggregateMarketConcentration(trades, 100);
    const verdict = evaluateHypothesisForensicsVerdict({
      trades,
      dailyPnl: daily,
      sideBreakdown: aggregateSideBreakdown(trades, 100, config),
      monthlyPnl: aggregateMonthlyPnl(trades, 100, config),
      marketEntries: market.entries,
      config,
    });

    expect(verdict.verdict).toBe("warning-concentrated-market");
  });

  it("flags side concentration", () => {
    const trades = [
      trade({ hypothesisId: "h1", marketId: "s:m1", netPnlCents: 95, sideBucket: "calibration-no-fade" }),
      trade({ hypothesisId: "h2", marketId: "s:m2", netPnlCents: 5, sideBucket: "calibration-yes-fade", contractSide: "yes" }),
    ];
    const side = aggregateSideBreakdown(trades, 100, { ...config, maxSideShareOfPositivePnl: 0.8 });
    const verdict = evaluateHypothesisForensicsVerdict({
      trades,
      dailyPnl: aggregateDailyPnl(trades),
      sideBreakdown: side,
      monthlyPnl: aggregateMonthlyPnl(trades, 100, config),
      marketEntries: aggregateMarketConcentration(trades, 100).entries,
      config: { ...config, maxSideShareOfPositivePnl: 0.8 },
    });

    expect(verdict.verdict).toBe("warning-concentrated-side");
  });
});

describe("family verdict", () => {
  const config = createPnlForensicsGateConfig({
    minPositiveCalendarMonths: 2,
    minPositiveTradingDays: 2,
    topDayMaxShareOfPositivePnl: 0.6,
    top3DayMaxShareOfPositivePnl: 0.9,
    topMarketMaxShareOfTotalPnl: 0.5,
  });

  it("returns proceed when concentration is broad", () => {
    const trades = [
      trade({ hypothesisId: "h1", marketId: "s:m1", netPnlCents: 30, tradingDayUtc: "2026-03-01", calendarMonth: "2026-03" }),
      trade({ hypothesisId: "h1", marketId: "s:m2", netPnlCents: 30, tradingDayUtc: "2026-04-01", calendarMonth: "2026-04" }),
      trade({ hypothesisId: "h2", marketId: "s:m3", netPnlCents: 30, tradingDayUtc: "2026-05-01", calendarMonth: "2026-05" }),
      trade({ hypothesisId: "h2", marketId: "s:m4", netPnlCents: 30, tradingDayUtc: "2026-06-01", calendarMonth: "2026-06" }),
    ];
    const daily = aggregateDailyPnl(trades);
    const monthly = aggregateMonthlyPnl(trades, 120, config);
    const market = aggregateMarketConcentration(trades, 120);
    const side = aggregateSideBreakdown(trades, 120, config);

    expect(
      evaluateFamilyForensicsVerdict({
        trades,
        dailyConcentration: computeDailyConcentration(daily),
        monthlyPnl: monthly,
        marketSummary: market.summary,
        sideBreakdown: side,
        marketLevelNetPnlCents: 120,
        config,
      }),
    ).toBe("proceed-to-trade-pnl-oos");
  });

  it("returns pause when concentration is high", () => {
    const trades = [
      trade({ hypothesisId: "h1", marketId: "s:m1", netPnlCents: 95, tradingDayUtc: "2026-05-01", calendarMonth: "2026-05" }),
      trade({ hypothesisId: "h1", marketId: "s:m1", netPnlCents: 5, tradingDayUtc: "2026-06-01", calendarMonth: "2026-06" }),
    ];
    const daily = aggregateDailyPnl(trades);
    const monthly = aggregateMonthlyPnl(trades, 100, config);
    const market = aggregateMarketConcentration(trades, 100);
    const side = aggregateSideBreakdown(trades, 100, config);

    expect(
      evaluateFamilyForensicsVerdict({
        trades,
        dailyConcentration: computeDailyConcentration(daily),
        monthlyPnl: monthly,
        marketSummary: market.summary,
        sideBreakdown: side,
        marketLevelNetPnlCents: 100,
        config: createPnlForensicsGateConfig({
          minPositiveTradingDays: 2,
          minPositiveCalendarMonths: 2,
        }),
      }),
    ).toBe("pause-family-concentrated-pnl");
  });

  it("returns pause when one month dominates total PnL", () => {
    const trades = [
      trade({ hypothesisId: "h1", marketId: "s:m1", netPnlCents: 70, tradingDayUtc: "2025-12-01", calendarMonth: "2025-12" }),
      trade({ hypothesisId: "h1", marketId: "s:m2", netPnlCents: 10, tradingDayUtc: "2026-05-01", calendarMonth: "2026-05" }),
      trade({ hypothesisId: "h2", marketId: "s:m3", netPnlCents: 10, tradingDayUtc: "2026-06-01", calendarMonth: "2026-06" }),
      trade({ hypothesisId: "h2", marketId: "s:m4", netPnlCents: 10, tradingDayUtc: "2026-06-02", calendarMonth: "2026-06" }),
    ];
    const daily = aggregateDailyPnl(trades);
    const monthly = aggregateMonthlyPnl(trades, 100, config);
    const market = aggregateMarketConcentration(trades, 100);
    const side = aggregateSideBreakdown(trades, 100, config);

    expect(
      evaluateFamilyForensicsVerdict({
        trades,
        dailyConcentration: computeDailyConcentration(daily),
        monthlyPnl: monthly,
        marketSummary: market.summary,
        sideBreakdown: side,
        marketLevelNetPnlCents: 100,
        config,
      }),
    ).toBe("pause-family-concentrated-pnl");
  });

  it("returns insufficient-data for empty trades", () => {
    expect(
      evaluateFamilyForensicsVerdict({
        trades: [],
        dailyConcentration: computeDailyConcentration([]),
        monthlyPnl: [],
        marketSummary: aggregateMarketConcentration([], 0).summary,
        sideBreakdown: [],
        marketLevelNetPnlCents: 0,
        config,
      }),
    ).toBe("insufficient-data");
  });
});

describe("deterministic ordering", () => {
  it("sorts daily rows by date", () => {
    const trades = [
      trade({ hypothesisId: "h1", marketId: "s:m2", netPnlCents: 1, tradingDayUtc: "2026-05-03" }),
      trade({ hypothesisId: "h1", marketId: "s:m1", netPnlCents: 2, tradingDayUtc: "2026-05-01" }),
    ];
    const dates = aggregateDailyPnl(trades).map((day) => day.date);
    expect(dates).toEqual(["2026-05-01", "2026-05-03"]);
  });
});
