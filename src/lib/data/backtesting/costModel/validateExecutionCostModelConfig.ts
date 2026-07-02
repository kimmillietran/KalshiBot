import {
  ExecutionCostModelError,
  ExecutionCostModelErrorCode,
} from "./executionCostModelErrors";
import type { ResearchCostModelConfig } from "./executionCostModelTypes";

function validateExecutionFeeModel(
  model: ResearchCostModelConfig["executionCostModel"],
): void {
  if (model === undefined) {
    return;
  }

  if (model.kind === "zero") {
    return;
  }

  if (model.kind === "per-contract-fee") {
    if (
      !Number.isFinite(model.feeCentsPerContract) ||
      model.feeCentsPerContract < 0
    ) {
      throw new ExecutionCostModelError(
        "feeCentsPerContract must be a non-negative finite number",
        ExecutionCostModelErrorCode.INVALID_FEE,
      );
    }
    return;
  }

  throw new ExecutionCostModelError(
    "Unsupported execution cost model kind",
    ExecutionCostModelErrorCode.INVALID_CONFIG,
  );
}

function validateSpreadSlippageModel(
  model: ResearchCostModelConfig["spreadSlippageModel"],
): void {
  if (model === undefined) {
    return;
  }

  if (model.kind !== "none") {
    throw new ExecutionCostModelError(
      "Unsupported spread/slippage model kind",
      ExecutionCostModelErrorCode.UNSUPPORTED_SPREAD_MODEL,
    );
  }
}

export function validateExecutionCostModelConfig(
  config: ResearchCostModelConfig,
): void {
  if (config === null || typeof config !== "object" || Array.isArray(config)) {
    throw new ExecutionCostModelError(
      "costModelConfig must be a plain object",
      ExecutionCostModelErrorCode.INVALID_CONFIG,
    );
  }

  validateExecutionFeeModel(config.executionCostModel);
  validateSpreadSlippageModel(config.spreadSlippageModel);
}
