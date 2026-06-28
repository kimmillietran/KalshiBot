/** Single equity observation supplied by the caller. */
export type BacktestEquityPoint = {
  stepIndex: number;
  timestamp: string;
  equityCents: number;
};

/** Closed trade outcome supplied by the caller — no ledger dependency. */
export type ClosedTradeSummary = {
  tradeId: string;
  ticker: string;
  openedAt: string;
  closedAt: string;
  realizedPnlCents: number;
  entryNotionalCents: number;
  exitNotionalCents: number;
};

export type ComputeBacktestMetricsInput = {
  equityCurve: readonly BacktestEquityPoint[];
  closedTrades: readonly ClosedTradeSummary[];
  /** Required for annualized return and volatility annualization. */
  periodsPerYear?: number;
  /** Decimal per-period risk-free rate for Sharpe (e.g. 0.001). */
  riskFreeRatePerPeriod?: number;
};

export type BacktestMetricsSummary = {
  totalReturnPct: number;
  totalPnlCents: number;
  maxDrawdownPct: number;
  maxDrawdownCents: number;
  winRatePct: number;
  lossRatePct: number;
  averageWinCents: number;
  averageLossCents: number;
  profitFactor: number | null;
  expectancyCents: number;
  tradeCount: number;
  winningTradeCount: number;
  losingTradeCount: number;
  breakevenTradeCount: number;
  startEquityCents: number;
  endEquityCents: number;
  peakEquityCents: number;
  troughEquityCents: number;
  annualizedReturnPct: number | null;
  sharpeRatio: number | null;
  returnVolatilityPct: number | null;
};
