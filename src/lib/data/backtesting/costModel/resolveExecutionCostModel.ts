import type { BacktestFillSimulationConfig } from "../strategyTypes";

import type {
  ResearchCostModelConfig,
  ResolvedExecutionCostModels,
} from "./executionCostModelTypes";
import { validateExecutionCostModelConfig } from "./validateExecutionCostModelConfig";

/** Resolves effective cost models from optional fixture config or legacy fill config. */
export function resolveExecutionCostModel(
  fillConfig: BacktestFillSimulationConfig,
  costModelConfig?: ResearchCostModelConfig,
): ResolvedExecutionCostModels {
  if (costModelConfig !== undefined) {
    validateExecutionCostModelConfig(costModelConfig);
    return {
      executionFeeModel: costModelConfig.executionCostModel ?? { kind: "zero" },
      spreadSlippageModel: costModelConfig.spreadSlippageModel ?? { kind: "none" },
    };
  }

  if (fillConfig.feeCentsPerContract > 0) {
    return {
      executionFeeModel: {
        kind: "per-contract-fee",
        feeCentsPerContract: fillConfig.feeCentsPerContract,
      },
      spreadSlippageModel: { kind: "none" },
    };
  }

  return {
    executionFeeModel: { kind: "zero" },
    spreadSlippageModel: { kind: "none" },
  };
}
