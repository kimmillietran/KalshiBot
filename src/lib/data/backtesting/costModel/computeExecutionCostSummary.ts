import type {
  ExecutionCostFillSource,
  ExecutionCostSummary,
} from "./executionCostModelTypes";

function readFeeCents(fill: ExecutionCostFillSource): number {
  return fill.executionCost?.feeCents ?? fill.feeCents;
}

function readSpreadSlippageCents(fill: ExecutionCostFillSource): number {
  return fill.executionCost?.spreadSlippageCents ?? fill.spreadSlippageCents ?? 0;
}

/** Aggregates execution costs and gross/net PnL from fill records and equity PnL. */
export function computeExecutionCostSummary(
  fills: readonly ExecutionCostFillSource[],
  netPnlCents: number,
): ExecutionCostSummary {
  const totalFeesCents = fills.reduce((sum, fill) => sum + readFeeCents(fill), 0);
  const totalSpreadCostCents = fills.reduce(
    (sum, fill) => sum + readSpreadSlippageCents(fill),
    0,
  );
  const grossPnlCents = netPnlCents + totalFeesCents + totalSpreadCostCents;

  let feesAsPercentOfGrossPnl: number | null = null;
  if (grossPnlCents !== 0 && totalFeesCents > 0) {
    feesAsPercentOfGrossPnl = (totalFeesCents / grossPnlCents) * 100;
  }

  return {
    totalFeesCents,
    totalSpreadCostCents,
    grossPnlCents,
    netPnlCents,
    feesAsPercentOfGrossPnl,
  };
}
