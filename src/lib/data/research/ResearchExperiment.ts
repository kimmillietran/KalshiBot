import { computeBacktestMetrics } from "@/lib/data/backtesting";
import { BacktestStrategyRunner } from "@/lib/data/backtesting/BacktestStrategyRunner";
import { deriveBacktestMetricsInput } from "@/lib/data/backtesting/deriveBacktestMetricsInput";
import { ReplaySession } from "@/lib/data/replay/ReplaySession";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import {
  ResearchExperimentError,
  ResearchExperimentErrorCode,
} from "./experimentTypes";
import type {
  ResearchExperimentConfiguration,
  ResearchExperimentConfig,
  ResearchExperimentInput,
  ResearchExperimentResult,
  ResearchStrategyConfig,
  RunResearchExperimentInput,
} from "./experimentTypes";

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }

  Object.freeze(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreeze(item);
    }
  } else {
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
  }

  return value;
}

function validateStrategyConfig(strategyConfig: ResearchStrategyConfig): void {
  if (
    strategyConfig === null ||
    typeof strategyConfig !== "object" ||
    Array.isArray(strategyConfig)
  ) {
    throw new ResearchExperimentError(
      "strategyConfig must be a plain object",
      ResearchExperimentErrorCode.INVALID_STRATEGY_CONFIG,
    );
  }
}

function validateFillConfig(
  fillConfig: ResearchExperimentConfig["fillConfig"],
): void {
  if (fillConfig.priceSource !== "engine-input-pricing") {
    throw new ResearchExperimentError(
      "fillConfig.priceSource must be engine-input-pricing",
      ResearchExperimentErrorCode.INVALID_FILL_CONFIG,
    );
  }

  if (fillConfig.allowPartialFills !== false) {
    throw new ResearchExperimentError(
      "fillConfig.allowPartialFills must be false",
      ResearchExperimentErrorCode.INVALID_FILL_CONFIG,
    );
  }

  if (
    !Number.isFinite(fillConfig.feeCentsPerContract) ||
    fillConfig.feeCentsPerContract < 0
  ) {
    throw new ResearchExperimentError(
      "fillConfig.feeCentsPerContract must be a non-negative finite number",
      ResearchExperimentErrorCode.INVALID_FILL_CONFIG,
    );
  }
}

function validateConfig(config: ResearchExperimentConfig): void {
  if (!config.experimentId.trim()) {
    throw new ResearchExperimentError(
      "experimentId is required",
      ResearchExperimentErrorCode.INVALID_EXPERIMENT_ID,
    );
  }

  if (!config.strategy) {
    throw new ResearchExperimentError(
      "strategy is required",
      ResearchExperimentErrorCode.MISSING_STRATEGY,
    );
  }

  if (!config.strategy.strategyId.trim()) {
    throw new ResearchExperimentError(
      "strategy.strategyId is required",
      ResearchExperimentErrorCode.INVALID_STRATEGY_ID,
    );
  }

  validateStrategyConfig(config.strategyConfig);

  if (!Number.isFinite(config.initialCashCents) || config.initialCashCents < 0) {
    throw new ResearchExperimentError(
      "initialCashCents must be a non-negative finite number",
      ResearchExperimentErrorCode.INVALID_INITIAL_CASH,
    );
  }

  validateFillConfig(config.fillConfig);
}

function validateInput(input: ResearchExperimentInput): void {
  if (!input.snapshots.length) {
    throw new ResearchExperimentError(
      "At least one historical snapshot is required",
      ResearchExperimentErrorCode.EMPTY_SNAPSHOTS,
    );
  }
}

function toConfiguration(
  config: ResearchExperimentConfig,
): ResearchExperimentConfiguration {
  return deepFreeze({
    experimentId: config.experimentId,
    strategyId: config.strategy.strategyId,
    strategyConfig: structuredClone(config.strategyConfig),
    initialCashCents: config.initialCashCents,
    fillConfig: structuredClone(config.fillConfig),
  });
}

/**
 * Runs a configured strategy over historical snapshots through replay,
 * simulated fills, ledger accounting, and metrics summarization.
 */
export function runResearchExperiment(
  params: RunResearchExperimentInput,
): ResearchExperimentResult {
  const { config, input } = params;

  validateConfig(config);
  validateInput(input);

  const replaySession = ReplaySession.create(input.snapshots);
  const { results: replayResults } = replaySession.stepAll();

  const runnerResult = BacktestStrategyRunner.run({
    initialCashCents: config.initialCashCents,
    steps: replayResults,
    strategy: config.strategy,
    fillConfig: config.fillConfig,
  });

  const ledgerSnapshot = runnerResult.ledger.snapshot();
  const metrics = computeBacktestMetrics(
    deriveBacktestMetricsInput({
      replayResults,
      fills: ledgerSnapshot.fills,
      initialCashCents: config.initialCashCents,
    }),
  );

  const completedAtStep =
    replayResults.length > 0
      ? replayResults[replayResults.length - 1]!.stepIndex
      : -1;

  return deepFreeze({
    experimentId: config.experimentId,
    strategyId: config.strategy.strategyId,
    completedAtStep,
    replayResults,
    ledger: runnerResult.ledger,
    metrics,
    configuration: toConfiguration(config),
  });
}

export function serializeResearchExperimentResult(
  result: ResearchExperimentResult,
): string {
  return stableStringify({
    experimentId: result.experimentId,
    strategyId: result.strategyId,
    completedAtStep: result.completedAtStep,
    replayResults: [...result.replayResults],
    ledger: result.ledger.snapshot(),
    metrics: result.metrics,
    configuration: result.configuration,
  });
}
