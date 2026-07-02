import { ReplaySession } from "@/lib/data/replay/ReplaySession";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import { computeBacktestMetrics } from "./BacktestMetrics";
import { BacktestStrategyRunner } from "./BacktestStrategyRunner";
import { deriveBacktestMetricsInput } from "./deriveBacktestMetricsInput";
import {
  DEFAULT_BACKTEST_FILL_SIMULATION_CONFIG,
} from "./strategyTypes";
import {
  HistoricalBacktestError,
  HistoricalBacktestErrorCode,
} from "./historicalBacktestTypes";
import type {
  HistoricalBacktestResult,
  RunHistoricalBacktestInput,
} from "./historicalBacktestTypes";

export {
  HistoricalBacktestError,
  HistoricalBacktestErrorCode,
} from "./historicalBacktestTypes";
export type {
  HistoricalBacktestMetadata,
  HistoricalBacktestMetricsConfig,
  HistoricalBacktestReplayResult,
  HistoricalBacktestResult,
  RunHistoricalBacktestInput,
} from "./historicalBacktestTypes";

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

function validateInput(input: RunHistoricalBacktestInput): void {
  if (!input.snapshots.length) {
    throw new HistoricalBacktestError(
      "At least one historical snapshot is required",
      HistoricalBacktestErrorCode.EMPTY_SNAPSHOTS,
    );
  }

  if (!input.strategy) {
    throw new HistoricalBacktestError(
      "strategy is required",
      HistoricalBacktestErrorCode.MISSING_STRATEGY,
    );
  }

  if (!input.strategy.strategyId.trim()) {
    throw new HistoricalBacktestError(
      "strategy.strategyId is required",
      HistoricalBacktestErrorCode.INVALID_STRATEGY_ID,
    );
  }

  if (!Number.isFinite(input.initialCashCents) || input.initialCashCents < 0) {
    throw new HistoricalBacktestError(
      "initialCashCents must be a non-negative finite number",
      HistoricalBacktestErrorCode.INVALID_INITIAL_CASH,
    );
  }
}

/**
 * Runs a complete historical backtest through replay, strategy execution,
 * ledger accounting, and metrics summarization.
 */
export function runHistoricalBacktest(
  input: RunHistoricalBacktestInput,
): HistoricalBacktestResult {
  validateInput(input);

  const fillConfig = input.fillConfig ?? DEFAULT_BACKTEST_FILL_SIMULATION_CONFIG;
  const replaySession = ReplaySession.create(input.snapshots, input.engineConfig);
  const { results: replayResults } = replaySession.stepAll();

  const strategyRun = BacktestStrategyRunner.run({
    initialCashCents: input.initialCashCents,
    steps: replayResults,
    strategy: input.strategy,
    fillConfig,
    costModelConfig: input.costModelConfig,
  });

  const ledgerSnapshot = strategyRun.ledger.snapshot();
  const metricsInput = deriveBacktestMetricsInput({
    replayResults,
    fills: ledgerSnapshot.fills,
    initialCashCents: input.initialCashCents,
    periodsPerYear: input.metricsConfig?.periodsPerYear,
    riskFreeRatePerPeriod: input.metricsConfig?.riskFreeRatePerPeriod,
    fillConfig,
    costModelConfig: input.costModelConfig,
  });
  const metrics = computeBacktestMetrics(metricsInput);

  const completedAtStep =
    replayResults.length > 0
      ? replayResults[replayResults.length - 1]!.stepIndex
      : -1;

  return deepFreeze({
    replayResult: {
      results: replayResults,
    },
    strategyRun,
    ledger: strategyRun.ledger,
    metrics,
    metadata: {
      strategyId: input.strategy.strategyId,
      initialCashCents: input.initialCashCents,
      completedAtStep,
      snapshotCount: input.snapshots.length,
      engineConfig: structuredClone(input.engineConfig),
      fillConfig: structuredClone(fillConfig),
      ...(input.costModelConfig !== undefined
        ? { costModelConfig: structuredClone(input.costModelConfig) }
        : {}),
    },
  });
}

export function serializeHistoricalBacktestResult(
  result: HistoricalBacktestResult,
): string {
  return stableStringify({
    replayResult: {
      results: [...result.replayResult.results],
    },
    strategyRun: {
      strategyId: result.strategyRun.strategyId,
      steps: [...result.strategyRun.steps],
    },
    ledger: result.ledger.snapshot(),
    metrics: result.metrics,
    metadata: result.metadata,
  });
}
