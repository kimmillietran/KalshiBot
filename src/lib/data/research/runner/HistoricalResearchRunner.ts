import {
  HistoricalResearchCli,
  serializeHistoricalResearchRun,
} from "@/lib/data/cli";
import {
  buildHistoricalDataset,
  serializeHistoricalDataset,
} from "@/lib/data/datasets";
import {
  serializeStrategyDecisionTrace,
} from "@/lib/data/research/decisionTrace";
import type { HistoricalDataset } from "@/lib/data/datasets";
import {
  computeReplayPricingDiagnostics,
  serializeReplayPricingDiagnostics,
} from "@/lib/data/research/diagnostics";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import {
  HistoricalResearchRunnerError,
  HistoricalResearchRunnerErrorCode,
} from "./historicalResearchRunnerTypes";
import type {
  HistoricalResearchRunnerCoreResult,
  HistoricalResearchRunnerResult,
  RunHistoricalResearchFromBronzeInput,
} from "./historicalResearchRunnerTypes";

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

function validateInput(input: RunHistoricalResearchFromBronzeInput): void {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new HistoricalResearchRunnerError(
      "input must be a plain object",
      HistoricalResearchRunnerErrorCode.INVALID_CONFIG,
    );
  }

  if (!input.bronzeRecords.length) {
    throw new HistoricalResearchRunnerError(
      "At least one bronze record is required",
      HistoricalResearchRunnerErrorCode.EMPTY_BRONZE_RECORDS,
    );
  }

  if (!input.runId.trim()) {
    throw new HistoricalResearchRunnerError(
      "runId is required",
      HistoricalResearchRunnerErrorCode.MISSING_RUN_ID,
    );
  }

  if (!input.strategy) {
    throw new HistoricalResearchRunnerError(
      "strategy is required",
      HistoricalResearchRunnerErrorCode.MISSING_STRATEGY,
    );
  }

  if (!input.strategy.strategyId.trim()) {
    throw new HistoricalResearchRunnerError(
      "strategy.strategyId is required",
      HistoricalResearchRunnerErrorCode.INVALID_STRATEGY_ID,
    );
  }

  if (!Number.isFinite(input.initialCashCents) || input.initialCashCents < 0) {
    throw new HistoricalResearchRunnerError(
      "initialCashCents must be a non-negative finite number",
      HistoricalResearchRunnerErrorCode.INVALID_INITIAL_CASH,
    );
  }

  if (!Number.isFinite(input.durationMs) || input.durationMs < 0) {
    throw new HistoricalResearchRunnerError(
      "durationMs must be a non-negative finite number",
      HistoricalResearchRunnerErrorCode.INVALID_DURATION_MS,
    );
  }
}

export function serializeHistoricalResearchRunnerResult(
  result: HistoricalResearchRunnerCoreResult,
): string {
  return stableStringify({
    dataset: serializeHistoricalDataset(result.dataset),
    researchRun: serializeHistoricalResearchRun(result.researchRun),
    metadata: result.metadata,
    diagnostics: serializeReplayPricingDiagnostics(result.diagnostics),
  });
}

function resolveMarketTicker(dataset: HistoricalDataset): string {
  const tickers = dataset.metadata.marketTickers;
  if (Array.isArray(tickers) && typeof tickers[0] === "string" && tickers[0].trim()) {
    return tickers[0].trim();
  }

  return dataset.snapshots[0]?.ticker ?? "";
}

export function serializeHistoricalResearchDecisionTrace(
  result: HistoricalResearchRunnerCoreResult,
): string {
  return serializeStrategyDecisionTrace({
    runId: result.metadata.runId,
    strategyId: result.metadata.strategyId,
    marketTicker: resolveMarketTicker(result.dataset),
    entries: result.researchRun.backtestResult.strategyRun.decisionTrace,
  });
}

/**
 * Builds a historical dataset from bronze records and runs the research CLI
 * pipeline end-to-end.
 */
export function runHistoricalResearchFromBronze(
  input: RunHistoricalResearchFromBronzeInput,
): HistoricalResearchRunnerResult {
  validateInput(input);

  const dataset = buildHistoricalDataset(input.bronzeRecords);
  const researchRun = HistoricalResearchCli.run({
    dataset,
    config: {
      runId: input.runId,
      strategy: input.strategy,
      engineConfig: input.engineConfig,
      initialCashCents: input.initialCashCents,
      durationMs: input.durationMs,
      fillConfig: input.fillConfig,
      costModelConfig: input.costModelConfig,
      metricsConfig: input.metricsConfig,
    },
  });

  const metadata = {
    runId: input.runId,
    durationMs: input.durationMs,
    strategyId: input.strategy.strategyId,
    datasetId: dataset.metadata.datasetId,
    snapshotCount: dataset.metadata.snapshotCount,
    bronzeRecordCount: input.bronzeRecords.length,
  };

  const diagnostics = computeReplayPricingDiagnostics({
    replaySteps: researchRun.backtestResult.replayResult.results,
    bronzeRecords: input.bronzeRecords,
  });

  const coreResult: HistoricalResearchRunnerCoreResult = {
    dataset,
    researchRun,
    metadata,
    diagnostics,
  };

  return deepFreeze({
    ...coreResult,
    serialized: serializeHistoricalResearchRunnerResult(coreResult),
    serializedDecisionTrace: serializeHistoricalResearchDecisionTrace(coreResult),
  });
}

export {
  HistoricalResearchRunnerError,
  HistoricalResearchRunnerErrorCode,
} from "./historicalResearchRunnerTypes";
export type {
  HistoricalResearchRunnerCoreResult,
  HistoricalResearchRunnerMetadata,
  HistoricalResearchRunnerResult,
  RunHistoricalResearchFromBronzeInput,
} from "./historicalResearchRunnerTypes";
