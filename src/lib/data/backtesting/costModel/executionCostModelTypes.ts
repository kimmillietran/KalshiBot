import type { TradeAction } from "../ledgerTypes";

export type ExecutionFeeModelKind =
  | "zero"
  | "per-contract-fee"
  | "kalshi-fee-schedule";

export type KalshiFeeScheduleRole = "taker" | "maker";

export type KalshiFeeScheduleVariant = "standard" | "reduced-index";

/** Execution fee schedule used by research backtests. */
export type ExecutionFeeModel =
  | { kind: "zero" }
  | { kind: "per-contract-fee"; feeCentsPerContract: number }
  | {
      kind: "kalshi-fee-schedule";
      role: KalshiFeeScheduleRole;
      schedule?: KalshiFeeScheduleVariant;
    };

/** Spread/slippage placeholder — always zero in milestone 6.25A. */
export type SpreadSlippageModel = { kind: "none" };

export type ResearchCostModelConfig = {
  executionCostModel?: ExecutionFeeModel;
  spreadSlippageModel?: SpreadSlippageModel;
};

export type ResolvedExecutionCostModels = {
  executionFeeModel: ExecutionFeeModel;
  spreadSlippageModel: SpreadSlippageModel;
};

/** Per-fill execution cost breakdown attached to simulated and ledger fills. */
export type FillCostBreakdown = {
  grossPriceCents: number;
  feeCents: number;
  spreadSlippageCents: number;
  netCostCents: number;
  netProceedsCents: number;
  netPnlContributionCents: number | null;
};

export type ExecutionCostSummaryDetail = {
  modelKind: ExecutionFeeModelKind;
  fillCount: number;
  totalFeeCents: number;
  averageFeeCentsPerFill: number | null;
};

export type ExecutionCostSummary = {
  totalFeesCents: number;
  totalSpreadCostCents: number;
  grossPnlCents: number;
  netPnlCents: number;
  feesAsPercentOfGrossPnl: number | null;
  executionCostSummary: ExecutionCostSummaryDetail;
};

export type ExecutionCostFillSource = {
  action: TradeAction;
  feeCents: number;
  spreadSlippageCents?: number;
  executionCost?: FillCostBreakdown;
};
