import type {
  ExecutionCostFillSource,
  ExecutionCostSummaryDetail,
  ExecutionFeeModelKind,
} from "./costModel";

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
  fills?: readonly ExecutionCostFillSource[];
  executionFeeModelKind?: ExecutionFeeModelKind;
  /** Required for annualized return and volatility. Sharpe also requires this. */
  periodsPerYear?: number;
  /** Decimal per-period risk-free rate. Sharpe requires this plus periodsPerYear and at least two equity points with non-zero return volatility. */
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
  /** Sample std-dev of per-period equity returns (not annualized), scaled to percent. */
  returnVolatilityPct: number | null;
  totalFeesCents: number;
  totalSpreadCostCents: number;
  grossPnlCents: number;
  netPnlCents: number;
  feesAsPercentOfGrossPnl: number | null;
  executionCostSummary: ExecutionCostSummaryDetail | null;
};
