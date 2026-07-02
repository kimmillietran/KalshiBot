import type { TradeAction } from "../ledgerTypes";

import { computeFillCostBreakdown } from "./computeFillCostBreakdown";
import type { FillCostBreakdown } from "./executionCostModelTypes";
import { resolveExecutionCostModel } from "./resolveExecutionCostModel";
import type { BacktestFillSimulationConfig } from "../strategyTypes";

export type BuildFillExecutionCostFieldsInput = {
  action: TradeAction;
  priceCents: number;
  quantity: number;
  feeCents: number;
  fillConfig?: BacktestFillSimulationConfig;
  averageCostCents?: number;
};

/** Builds execution cost fields for legacy/test fills without a full cost model config. */
export function buildFillExecutionCostFields(
  input: BuildFillExecutionCostFieldsInput,
): {
  spreadSlippageCents: number;
  executionCost: FillCostBreakdown;
} {
  const fillConfig = input.fillConfig ?? {
    feeCentsPerContract: input.feeCents / input.quantity,
    allowPartialFills: false as const,
    priceSource: "engine-input-pricing" as const,
  };
  const models = resolveExecutionCostModel(fillConfig);
  const executionCost = computeFillCostBreakdown({
    action: input.action,
    grossPriceCents: input.priceCents,
    quantity: input.quantity,
    models,
    averageCostCents: input.averageCostCents,
  });

  return {
    spreadSlippageCents: executionCost.spreadSlippageCents,
    executionCost,
  };
}
