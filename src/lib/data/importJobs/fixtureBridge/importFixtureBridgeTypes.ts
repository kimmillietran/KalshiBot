import type { HistoricalBacktestMetricsConfig } from "@/lib/data/backtesting";
import type { BacktestFillSimulationConfig } from "@/lib/data/backtesting/strategyTypes";
import type { HistoricalResearchFixtureExportConfig } from "@/lib/data/fixtures";
import type { BuiltinStrategyId } from "@/lib/data/strategies";
import type { EngineConfig } from "@/types/domain/trading";

import type { HistoricalBronzeImportJobCoreResult } from "../historicalBronzeImportJobTypes";

export type BuildHistoricalResearchFixtureFromImportResultInput = {
  importResult: HistoricalBronzeImportJobCoreResult;
  strategyId: BuiltinStrategyId;
  runId: string;
  durationMs: number;
  initialCashCents: number;
  engineConfig: EngineConfig;
  fillConfig?: BacktestFillSimulationConfig;
  metricsConfig?: HistoricalBacktestMetricsConfig;
  exportConfig?: HistoricalResearchFixtureExportConfig;
};

export const ImportFixtureBridgeErrorCode = {
  INVALID_INPUT: "invalid-input",
  INVALID_IMPORT_RESULT: "invalid-import-result",
} as const;

export type ImportFixtureBridgeErrorCode =
  (typeof ImportFixtureBridgeErrorCode)[keyof typeof ImportFixtureBridgeErrorCode];

export class ImportFixtureBridgeError extends Error {
  readonly code: ImportFixtureBridgeErrorCode;

  constructor(message: string, code: ImportFixtureBridgeErrorCode) {
    super(message);
    this.name = "ImportFixtureBridgeError";
    this.code = code;
  }
}
