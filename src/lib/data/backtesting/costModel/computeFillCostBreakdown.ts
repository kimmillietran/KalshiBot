import type { TradeAction } from "../ledgerTypes";

import { computeKalshiScheduleFeeCents } from "./computeKalshiScheduleFeeCents";
import type {
  FillCostBreakdown,
  ResolvedExecutionCostModels,
} from "./executionCostModelTypes";

export type ComputeFillCostBreakdownInput = {
  action: TradeAction;
  grossPriceCents: number;
  quantity: number;
  models: ResolvedExecutionCostModels;
  averageCostCents?: number;
};

function computeFeeCents(
  models: ResolvedExecutionCostModels,
  quantity: number,
  grossPriceCents: number,
): number {
  const model = models.executionFeeModel;

  if (model.kind === "per-contract-fee") {
    return model.feeCentsPerContract * quantity;
  }

  if (model.kind === "kalshi-fee-schedule") {
    return computeKalshiScheduleFeeCents({
      quantity,
      priceCents: grossPriceCents,
      role: model.role,
      schedule: model.schedule,
    });
  }

  return 0;
}

function computeSpreadSlippageCents(): number {
  return 0;
}

/** Deterministic per-fill execution cost breakdown for a simulated fill. */
export function computeFillCostBreakdown(
  input: ComputeFillCostBreakdownInput,
): FillCostBreakdown {
  const { action, grossPriceCents, quantity, models, averageCostCents } = input;
  const grossNotionalCents = grossPriceCents * quantity;
  const feeCents = computeFeeCents(models, quantity, grossPriceCents);
  const spreadSlippageCents = computeSpreadSlippageCents();
  const totalExecutionCostCents = feeCents + spreadSlippageCents;

  if (action === "buy") {
    const netCostCents = grossNotionalCents + totalExecutionCostCents;
    return {
      grossPriceCents,
      feeCents,
      spreadSlippageCents,
      netCostCents,
      netProceedsCents: -netCostCents,
      netPnlContributionCents: null,
    };
  }

  const netProceedsCents = grossNotionalCents - totalExecutionCostCents;
  const netPnlContributionCents =
    averageCostCents === undefined
      ? null
      : (grossPriceCents - averageCostCents) * quantity - totalExecutionCostCents;

  return {
    grossPriceCents,
    feeCents,
    spreadSlippageCents,
    netCostCents: totalExecutionCostCents,
    netProceedsCents,
    netPnlContributionCents,
  };
}
