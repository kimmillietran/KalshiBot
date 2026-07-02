import { buildHistoricalDataset } from "@/lib/data/datasets";
import { StrategyRegistry } from "@/lib/data/strategies";
import type { RawHistoricalRecord } from "@/lib/data/types";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import {
  HistoricalFixtureError,
  HistoricalFixtureErrorCode,
} from "./historicalFixtureTypes";
import type {
  BuildHistoricalResearchFixtureInput,
  HistoricalResearchCliInput,
} from "./historicalFixtureTypes";

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

function validateInput(input: BuildHistoricalResearchFixtureInput): void {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new HistoricalFixtureError(
      "input must be a plain object",
      HistoricalFixtureErrorCode.INVALID_CONFIG,
    );
  }

  if (!input.bronzeRecords.length) {
    throw new HistoricalFixtureError(
      "At least one bronze record is required",
      HistoricalFixtureErrorCode.EMPTY_BRONZE_RECORDS,
    );
  }

  if (!input.runId.trim()) {
    throw new HistoricalFixtureError(
      "runId is required",
      HistoricalFixtureErrorCode.MISSING_RUN_ID,
    );
  }

  if (!StrategyRegistry.createBuiltIn().has(input.strategyId)) {
    throw new HistoricalFixtureError(
      `Unknown strategyId: ${input.strategyId}`,
      HistoricalFixtureErrorCode.INVALID_STRATEGY_ID,
    );
  }

  if (!Number.isFinite(input.initialCashCents) || input.initialCashCents < 0) {
    throw new HistoricalFixtureError(
      "initialCashCents must be a non-negative finite number",
      HistoricalFixtureErrorCode.INVALID_INITIAL_CASH,
    );
  }

  if (!Number.isFinite(input.durationMs) || input.durationMs < 0) {
    throw new HistoricalFixtureError(
      "durationMs must be a non-negative finite number",
      HistoricalFixtureErrorCode.INVALID_DURATION_MS,
    );
  }
}

function cloneBronzeRecords(
  bronzeRecords: readonly RawHistoricalRecord[],
): readonly RawHistoricalRecord[] {
  return bronzeRecords.map((record) => structuredClone(record));
}

function buildCliInput(
  input: BuildHistoricalResearchFixtureInput,
): HistoricalResearchCliInput {
  return {
    runId: input.runId,
    durationMs: input.durationMs,
    initialCashCents: input.initialCashCents,
    bronzeRecords: cloneBronzeRecords(input.bronzeRecords),
    strategyId: input.strategyId,
    engineConfig: structuredClone(input.engineConfig),
    fillConfig: input.fillConfig ? structuredClone(input.fillConfig) : undefined,
    costModelConfig: input.costModelConfig
      ? structuredClone(input.costModelConfig)
      : undefined,
    metricsConfig: input.metricsConfig ? structuredClone(input.metricsConfig) : undefined,
    exportConfig: input.exportConfig ? structuredClone(input.exportConfig) : undefined,
  };
}

/**
 * Validates bronze records through the dataset builder and returns a CLI-ready
 * research fixture input document.
 */
export function buildHistoricalResearchFixture(
  input: BuildHistoricalResearchFixtureInput,
): HistoricalResearchCliInput {
  validateInput(input);
  buildHistoricalDataset(input.bronzeRecords);

  return deepFreeze(buildCliInput(input));
}

export function serializeHistoricalResearchFixture(
  fixture: HistoricalResearchCliInput,
): string {
  return stableStringify({
    runId: fixture.runId,
    durationMs: fixture.durationMs,
    initialCashCents: fixture.initialCashCents,
    bronzeRecords: [...fixture.bronzeRecords],
    strategyId: fixture.strategyId,
    engineConfig: fixture.engineConfig,
    fillConfig: fixture.fillConfig,
    ...(fixture.costModelConfig !== undefined
      ? { costModelConfig: fixture.costModelConfig }
      : {}),
    metricsConfig: fixture.metricsConfig,
    exportConfig: fixture.exportConfig,
  });
}

export {
  HistoricalFixtureError,
  HistoricalFixtureErrorCode,
} from "./historicalFixtureTypes";
export type {
  BuildHistoricalResearchFixtureInput,
  HistoricalResearchCliInput,
  HistoricalResearchFixtureExportConfig,
  HistoricalResearchInput,
} from "./historicalFixtureTypes";
