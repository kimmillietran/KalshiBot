import type { HistoricalBacktestMetricsConfig } from "@/lib/data/backtesting";
import type { BacktestFillSimulationConfig } from "@/lib/data/backtesting/strategyTypes";
import type { HistoricalDatasetMetadata } from "@/lib/data/datasets";
import type { ResearchExportGeneratedMetadata } from "@/lib/data/research/export/researchExportTypes";
import type { BuiltinStrategyId } from "@/lib/data/strategies";
import type { RawHistoricalRecord } from "@/lib/data/types";
import type { EngineConfig } from "@/types/domain/trading";

export const HistoricalFixtureErrorCode = {
  EMPTY_BRONZE_RECORDS: "empty-bronze-records",
  MISSING_RUN_ID: "missing-run-id",
  INVALID_STRATEGY_ID: "invalid-strategy-id",
  INVALID_INITIAL_CASH: "invalid-initial-cash",
  INVALID_DURATION_MS: "invalid-duration-ms",
  INVALID_CONFIG: "invalid-config",
} as const;

export type HistoricalFixtureErrorCode =
  (typeof HistoricalFixtureErrorCode)[keyof typeof HistoricalFixtureErrorCode];

export class HistoricalFixtureError extends Error {
  readonly code: HistoricalFixtureErrorCode;

  constructor(message: string, code: HistoricalFixtureErrorCode) {
    super(message);
    this.name = "HistoricalFixtureError";
    this.code = code;
  }
}

/** Optional export metadata carried through fixture JSON for downstream export builders. */
export type HistoricalResearchFixtureExportConfig = {
  exportId?: string;
  generated?: ResearchExportGeneratedMetadata;
};

export type BuildHistoricalResearchFixtureInput = {
  bronzeRecords: readonly RawHistoricalRecord[];
  strategyId: BuiltinStrategyId;
  runId: string;
  durationMs: number;
  initialCashCents: number;
  engineConfig: EngineConfig;
  fillConfig?: BacktestFillSimulationConfig;
  metricsConfig?: HistoricalBacktestMetricsConfig;
  exportConfig?: HistoricalResearchFixtureExportConfig;
};

/** CLI-ready research input JSON produced by the fixture generator. */
export type HistoricalResearchCliInput = {
  runId: string;
  durationMs: number;
  initialCashCents: number;
  bronzeRecords: readonly RawHistoricalRecord[];
  strategyId: BuiltinStrategyId;
  engineConfig: EngineConfig;
  fillConfig?: BacktestFillSimulationConfig;
  metricsConfig?: HistoricalBacktestMetricsConfig;
  exportConfig?: HistoricalResearchFixtureExportConfig;
};

/** Validated research input with dataset metadata from the bronze pipeline. */
export type HistoricalResearchInput = {
  cliInput: HistoricalResearchCliInput;
  datasetMetadata: HistoricalDatasetMetadata;
};
