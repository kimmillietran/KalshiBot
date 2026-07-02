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

  if (model.kind === "kalshi-fee-schedule") {
    if (model.role !== "taker" && model.role !== "maker") {
      throw new ExecutionCostModelError(
        "Kalshi fee schedule role must be taker or maker",
        ExecutionCostModelErrorCode.INVALID_MODEL,
      );
    }

    if (
      model.schedule !== undefined &&
      model.schedule !== "standard" &&
      model.schedule !== "reduced-index"
    ) {
      throw new ExecutionCostModelError(
        "Kalshi fee schedule variant must be standard or reduced-index",
        ExecutionCostModelErrorCode.INVALID_MODEL,
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
