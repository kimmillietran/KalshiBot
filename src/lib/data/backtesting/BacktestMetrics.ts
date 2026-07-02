import { stableStringify } from "@/lib/trading/config/hashConfig";

import { computeExecutionCostSummary } from "./costModel";
import { BacktestMetricsError, BacktestMetricsErrorCode } from "./errors";
import type {
  BacktestEquityPoint,
  BacktestMetricsSummary,
  ClosedTradeSummary,
  ComputeBacktestMetricsInput,
} from "./metricsTypes";

type OrderedEquityPoint = BacktestEquityPoint & { inputIndex: number };

function orderEquityCurve(
  equityCurve: readonly BacktestEquityPoint[],
): OrderedEquityPoint[] {
  return equityCurve
    .map((point, inputIndex) => ({ ...point, inputIndex }))
    .sort((left, right) => {
      if (left.stepIndex !== right.stepIndex) {
        return left.stepIndex - right.stepIndex;
      }

      const timestampCompare = left.timestamp.localeCompare(right.timestamp);
      if (timestampCompare !== 0) {
        return timestampCompare;
      }

      return left.inputIndex - right.inputIndex;
    });
}

function validateEquityCurve(equityCurve: readonly BacktestEquityPoint[]): void {
  if (equityCurve.length === 0) {
    throw new BacktestMetricsError(BacktestMetricsErrorCode.EMPTY_EQUITY_CURVE);
  }

  for (const point of equityCurve) {
    if (point.equityCents < 0) {
      throw new BacktestMetricsError(BacktestMetricsErrorCode.NEGATIVE_EQUITY);
    }
  }

  const ordered = orderEquityCurve(equityCurve);
  if (ordered[0]!.equityCents === 0) {
    throw new BacktestMetricsError(BacktestMetricsErrorCode.ZERO_START_EQUITY);
  }
}

function validateOptionalInputs(input: ComputeBacktestMetricsInput): void {
  if (input.periodsPerYear !== undefined) {
    if (!Number.isFinite(input.periodsPerYear) || input.periodsPerYear <= 0) {
      throw new BacktestMetricsError(
        BacktestMetricsErrorCode.INVALID_PERIODS_PER_YEAR,
      );
    }
  }

  if (input.riskFreeRatePerPeriod !== undefined) {
    if (!Number.isFinite(input.riskFreeRatePerPeriod)) {
      throw new BacktestMetricsError(
        BacktestMetricsErrorCode.INVALID_RISK_FREE_RATE,
      );
    }
  }
}

function computeDrawdownMetrics(ordered: readonly BacktestEquityPoint[]): {
  maxDrawdownCents: number;
  maxDrawdownPct: number;
  peakEquityCents: number;
  troughEquityCents: number;
} {
  let runningPeakCents = ordered[0]!.equityCents;
  let maxDrawdownCents = 0;
  let maxDrawdownPct = 0;
  let peakEquityCents = ordered[0]!.equityCents;
  let troughEquityCents = ordered[0]!.equityCents;

  for (const point of ordered) {
    runningPeakCents = Math.max(runningPeakCents, point.equityCents);
    peakEquityCents = Math.max(peakEquityCents, point.equityCents);
    troughEquityCents = Math.min(troughEquityCents, point.equityCents);

    const drawdownCents = runningPeakCents - point.equityCents;
    maxDrawdownCents = Math.max(maxDrawdownCents, drawdownCents);

    if (runningPeakCents > 0) {
      const drawdownPct = (drawdownCents / runningPeakCents) * 100;
      maxDrawdownPct = Math.max(maxDrawdownPct, drawdownPct);
    }
  }

  return {
    maxDrawdownCents,
    maxDrawdownPct,
    peakEquityCents,
    troughEquityCents,
  };
}

function computePeriodReturns(
  ordered: readonly BacktestEquityPoint[],
): number[] {
  const returns: number[] = [];

  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1]!.equityCents;
    const current = ordered[index]!.equityCents;
    if (previous === 0) {
      returns.push(0);
    } else {
      returns.push((current - previous) / previous);
    }
  }

  return returns;
}

function mean(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sampleStandardDeviation(values: readonly number[]): number {
  if (values.length < 2) {
    return 0;
  }

  const average = mean(values);
  const variance =
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) /
    (values.length - 1);

  return Math.sqrt(variance);
}

function computeTradeMetrics(closedTrades: readonly ClosedTradeSummary[]): {
  tradeCount: number;
  winningTradeCount: number;
  losingTradeCount: number;
  breakevenTradeCount: number;
  winRatePct: number;
  lossRatePct: number;
  averageWinCents: number;
  averageLossCents: number;
  profitFactor: number | null;
  expectancyCents: number;
} {
  const tradeCount = closedTrades.length;
  const winningTrades = closedTrades.filter((trade) => trade.realizedPnlCents > 0);
  const losingTrades = closedTrades.filter((trade) => trade.realizedPnlCents < 0);
  const breakevenTrades = closedTrades.filter(
    (trade) => trade.realizedPnlCents === 0,
  );

  const winningTradeCount = winningTrades.length;
  const losingTradeCount = losingTrades.length;
  const breakevenTradeCount = breakevenTrades.length;

  const grossProfitCents = winningTrades.reduce(
    (sum, trade) => sum + trade.realizedPnlCents,
    0,
  );
  const grossLossCents = losingTrades.reduce(
    (sum, trade) => sum + trade.realizedPnlCents,
    0,
  );

  const averageWinCents =
    winningTradeCount === 0 ? 0 : grossProfitCents / winningTradeCount;
  const averageLossCents =
    losingTradeCount === 0 ? 0 : grossLossCents / losingTradeCount;

  let profitFactor: number | null = null;
  if (tradeCount === 0) {
    profitFactor = null;
  } else if (grossLossCents === 0) {
    profitFactor = grossProfitCents > 0 ? null : 0;
  } else {
    profitFactor = grossProfitCents / Math.abs(grossLossCents);
  }

  const totalTradePnlCents = closedTrades.reduce(
    (sum, trade) => sum + trade.realizedPnlCents,
    0,
  );
  const expectancyCents = tradeCount === 0 ? 0 : totalTradePnlCents / tradeCount;
  const winRatePct = tradeCount === 0 ? 0 : (winningTradeCount / tradeCount) * 100;
  const lossRatePct = tradeCount === 0 ? 0 : (losingTradeCount / tradeCount) * 100;

  return {
    tradeCount,
    winningTradeCount,
    losingTradeCount,
    breakevenTradeCount,
    winRatePct,
    lossRatePct,
    averageWinCents,
    averageLossCents,
    profitFactor,
    expectancyCents,
  };
}

function computeOptionalReturnMetrics(
  ordered: readonly BacktestEquityPoint[],
  periodsPerYear: number | undefined,
  riskFreeRatePerPeriod: number | undefined,
): {
  annualizedReturnPct: number | null;
  sharpeRatio: number | null;
  returnVolatilityPct: number | null;
} {
  if (periodsPerYear === undefined) {
    return {
      annualizedReturnPct: null,
      sharpeRatio: null,
      returnVolatilityPct: null,
    };
  }

  const startEquityCents = ordered[0]!.equityCents;
  const endEquityCents = ordered[ordered.length - 1]!.equityCents;
  const periodCount = ordered.length - 1;

  let annualizedReturnPct: number | null = null;
  if (periodCount > 0 && startEquityCents > 0) {
    const totalReturnRatio = endEquityCents / startEquityCents;
    annualizedReturnPct =
      (totalReturnRatio ** (periodsPerYear / periodCount) - 1) * 100;
  }

  if (periodCount < 1) {
    return {
      annualizedReturnPct,
      sharpeRatio: null,
      returnVolatilityPct: null,
    };
  }

  const periodReturns = computePeriodReturns(ordered);
  const volatility = sampleStandardDeviation(periodReturns);
  const returnVolatilityPct = volatility * 100;

  let sharpeRatio: number | null = null;
  if (riskFreeRatePerPeriod !== undefined && volatility > 0) {
    const excessReturns = periodReturns.map(
      (value) => value - riskFreeRatePerPeriod,
    );
    sharpeRatio =
      (mean(excessReturns) / volatility) * Math.sqrt(periodsPerYear);
  }

  return {
    annualizedReturnPct,
    sharpeRatio,
    returnVolatilityPct,
  };
}

/** Pure deterministic backtest metrics from equity curve and closed trades. */
export function computeBacktestMetrics(
  input: ComputeBacktestMetricsInput,
): BacktestMetricsSummary {
  validateEquityCurve(input.equityCurve);
  validateOptionalInputs(input);

  const ordered = orderEquityCurve(input.equityCurve);
  const startEquityCents = ordered[0]!.equityCents;
  const endEquityCents = ordered[ordered.length - 1]!.equityCents;
  const totalPnlCents = endEquityCents - startEquityCents;
  const totalReturnPct = (totalPnlCents / startEquityCents) * 100;

  const drawdown = computeDrawdownMetrics(ordered);
  const tradeMetrics = computeTradeMetrics(input.closedTrades);
  const optionalMetrics = computeOptionalReturnMetrics(
    ordered,
    input.periodsPerYear,
    input.riskFreeRatePerPeriod,
  );
  const executionCostSummary = computeExecutionCostSummary(
    input.fills ?? [],
    totalPnlCents,
  );

  return Object.freeze({
    totalReturnPct,
    totalPnlCents,
    maxDrawdownPct: drawdown.maxDrawdownPct,
    maxDrawdownCents: drawdown.maxDrawdownCents,
    ...tradeMetrics,
    startEquityCents,
    endEquityCents,
    peakEquityCents: drawdown.peakEquityCents,
    troughEquityCents: drawdown.troughEquityCents,
    ...optionalMetrics,
    ...executionCostSummary,
  });
}

export function serializeBacktestMetrics(summary: BacktestMetricsSummary): string {
  return stableStringify(summary);
}
