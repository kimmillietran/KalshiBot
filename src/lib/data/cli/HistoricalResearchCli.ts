import {
  runHistoricalBacktest,
  serializeHistoricalBacktestResult,
} from "@/lib/data/backtesting";
import type { HistoricalDataset } from "@/lib/data/datasets";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import {
  HistoricalResearchCliError,
  HistoricalResearchCliErrorCode,
  HistoricalResearchProgressEventType,
} from "./types";
import type {
  HistoricalResearchProgressEvent,
  HistoricalResearchRun,
  HistoricalResearchRunConfig,
  RunAllHistoricalResearchInput,
  RunHistoricalResearchInput,
} from "./types";

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

function cloneRunConfig(config: HistoricalResearchRunConfig): HistoricalResearchRunConfig {
  return {
    runId: config.runId,
    strategy: config.strategy,
    engineConfig: structuredClone(config.engineConfig),
    initialCashCents: config.initialCashCents,
    durationMs: config.durationMs,
    fillConfig: config.fillConfig ? structuredClone(config.fillConfig) : undefined,
    costModelConfig: config.costModelConfig
      ? structuredClone(config.costModelConfig)
      : undefined,
    metricsConfig: config.metricsConfig ? structuredClone(config.metricsConfig) : undefined,
  };
}

function validateConfig(config: HistoricalResearchRunConfig): void {
  if (config === null || typeof config !== "object" || Array.isArray(config)) {
    throw new HistoricalResearchCliError(
      "config must be a plain object",
      HistoricalResearchCliErrorCode.INVALID_CONFIG,
    );
  }

  if (!config.runId.trim()) {
    throw new HistoricalResearchCliError(
      "runId is required",
      HistoricalResearchCliErrorCode.MISSING_RUN_ID,
    );
  }

  if (!config.strategy) {
    throw new HistoricalResearchCliError(
      "strategy is required",
      HistoricalResearchCliErrorCode.MISSING_STRATEGY,
    );
  }

  if (!config.strategy.strategyId.trim()) {
    throw new HistoricalResearchCliError(
      "strategy.strategyId is required",
      HistoricalResearchCliErrorCode.INVALID_STRATEGY_ID,
    );
  }

  if (!Number.isFinite(config.initialCashCents) || config.initialCashCents < 0) {
    throw new HistoricalResearchCliError(
      "initialCashCents must be a non-negative finite number",
      HistoricalResearchCliErrorCode.INVALID_INITIAL_CASH,
    );
  }

  if (!Number.isFinite(config.durationMs) || config.durationMs < 0) {
    throw new HistoricalResearchCliError(
      "durationMs must be a non-negative finite number",
      HistoricalResearchCliErrorCode.INVALID_DURATION_MS,
    );
  }
}

function validateDataset(dataset: HistoricalDataset): void {
  if (!dataset.snapshots.length) {
    throw new HistoricalResearchCliError(
      "Historical dataset must contain at least one snapshot",
      HistoricalResearchCliErrorCode.EMPTY_DATASET,
    );
  }
}

function executeRun(
  dataset: HistoricalDataset,
  config: HistoricalResearchRunConfig,
): HistoricalResearchRun {
  validateDataset(dataset);

  const backtestResult = runHistoricalBacktest({
    snapshots: dataset.snapshots,
    strategy: config.strategy,
    engineConfig: config.engineConfig,
    initialCashCents: config.initialCashCents,
    fillConfig: config.fillConfig,
    costModelConfig: config.costModelConfig,
    metricsConfig: config.metricsConfig,
  });

  return deepFreeze({
    datasetMetadata: structuredClone(dataset.metadata),
    backtestResult,
    durationMs: config.durationMs,
    config: cloneRunConfig(config),
  });
}

function emitProgress(
  onProgress: ((event: HistoricalResearchProgressEvent) => void) | undefined,
  event: HistoricalResearchProgressEvent,
): void {
  onProgress?.(event);
}

export class HistoricalResearchCli {
  static run(input: RunHistoricalResearchInput): HistoricalResearchRun {
    validateConfig(input.config);

    emitProgress(input.onProgress, {
      type: HistoricalResearchProgressEventType.STARTED,
      runId: input.config.runId,
      datasetCount: 1,
    });

    const run = executeRun(input.dataset, input.config);

    emitProgress(input.onProgress, {
      type: HistoricalResearchProgressEventType.DATASET_COMPLETE,
      runId: input.config.runId,
      datasetIndex: 0,
      datasetId: input.dataset.metadata.datasetId,
      run,
    });

    emitProgress(input.onProgress, {
      type: HistoricalResearchProgressEventType.FINISHED,
      runId: input.config.runId,
      runs: [run],
    });

    return run;
  }

  static runAll(input: RunAllHistoricalResearchInput): readonly HistoricalResearchRun[] {
    if (!input.datasets.length) {
      throw new HistoricalResearchCliError(
        "At least one historical dataset is required",
        HistoricalResearchCliErrorCode.EMPTY_DATASETS,
      );
    }

    validateConfig(input.config);

    emitProgress(input.onProgress, {
      type: HistoricalResearchProgressEventType.STARTED,
      runId: input.config.runId,
      datasetCount: input.datasets.length,
    });

    const runs: HistoricalResearchRun[] = [];

    for (let datasetIndex = 0; datasetIndex < input.datasets.length; datasetIndex += 1) {
      const dataset = input.datasets[datasetIndex]!;
      const run = executeRun(dataset, input.config);
      runs.push(run);

      emitProgress(input.onProgress, {
        type: HistoricalResearchProgressEventType.DATASET_COMPLETE,
        runId: input.config.runId,
        datasetIndex,
        datasetId: dataset.metadata.datasetId,
        run,
      });
    }

    const frozenRuns = deepFreeze(runs) as readonly HistoricalResearchRun[];

    emitProgress(input.onProgress, {
      type: HistoricalResearchProgressEventType.FINISHED,
      runId: input.config.runId,
      runs: frozenRuns,
    });

    return frozenRuns;
  }
}

export function serializeHistoricalResearchRun(run: HistoricalResearchRun): string {
  return stableStringify({
    datasetMetadata: run.datasetMetadata,
    backtestResult: serializeHistoricalBacktestResult(run.backtestResult),
    durationMs: run.durationMs,
    config: {
      runId: run.config.runId,
      strategyId: run.config.strategy.strategyId,
      engineConfig: run.config.engineConfig,
      initialCashCents: run.config.initialCashCents,
      durationMs: run.config.durationMs,
      fillConfig: run.config.fillConfig,
      ...(run.config.costModelConfig !== undefined
        ? { costModelConfig: run.config.costModelConfig }
        : {}),
      metricsConfig: run.config.metricsConfig,
    },
  });
}

export {
  HistoricalResearchCliError,
  HistoricalResearchCliErrorCode,
  HistoricalResearchProgressEventType,
} from "./types";
export type {
  HistoricalResearchProgressEvent,
  HistoricalResearchRun,
  HistoricalResearchRunConfig,
  RunAllHistoricalResearchInput,
  RunHistoricalResearchInput,
} from "./types";
