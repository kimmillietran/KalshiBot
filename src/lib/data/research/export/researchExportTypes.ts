import type { HistoricalBacktestResult } from "@/lib/data/backtesting/historicalBacktestTypes";
import type { BacktestMetricsSummary } from "@/lib/data/backtesting/metricsTypes";
import type { HistoricalDatasetMetadata } from "@/lib/data/datasets/datasetTypes";

import type { ResearchComparison } from "../comparison/comparisonTypes";

/** Completed historical research run artifact produced by the CLI orchestrator (6.8A). */
export type HistoricalResearchRun = {
  datasetMetadata: HistoricalDatasetMetadata;
  backtestResult: HistoricalBacktestResult;
  durationMs: number;
  config: {
    runId: string;
    initialCashCents: number;
  };
};

export const ResearchExportType = {
  RESEARCH_RUN: "research-run",
  RESEARCH_COMPARISON: "research-comparison",
} as const;

export type ResearchExportType =
  (typeof ResearchExportType)[keyof typeof ResearchExportType];

/** Caller-supplied generation metadata — no runtime timestamps. */
export type ResearchExportGeneratedMetadata = {
  generatedAt: string;
  generatedBy?: string;
  label?: string;
  source?: string;
};

export type ResearchExportSummaryMetrics = {
  finalEquityCents: number;
  totalPnlCents: number | null;
  totalReturnPct: number;
  maxDrawdownPct: number;
  sharpeRatio: number | null;
  winRatePct: number;
  tradeCount: number;
};

export type ResearchExportRankingRow = {
  rank: number;
  experimentId: string;
  metrics: ResearchExportSummaryMetrics;
};

export type ResearchExportTableRow = {
  rowKey: string;
  values: Readonly<Record<string, string | number | null>>;
};

export const RESEARCH_EXPORT_TABLE_COLUMNS = [
  "rank",
  "experimentId",
  "runId",
  "strategyId",
  "datasetId",
  "finalEquityCents",
  "totalPnlCents",
  "totalReturnPct",
  "maxDrawdownPct",
  "sharpeRatio",
  "winRatePct",
  "tradeCount",
  "durationMs",
] as const;

export type ResearchExportTableColumn =
  (typeof RESEARCH_EXPORT_TABLE_COLUMNS)[number];

export type ResearchExportDocument = {
  exportId: string;
  exportType: ResearchExportType;
  generated: ResearchExportGeneratedMetadata;
  strategyId: string | null;
  datasetMetadata: HistoricalDatasetMetadata | null;
  summary: ResearchExportSummaryMetrics;
  rankings: readonly ResearchExportRankingRow[] | null;
  tableRows: readonly ResearchExportTableRow[];
};

export type BuildResearchRunExportInput = {
  exportId: string;
  generated: ResearchExportGeneratedMetadata;
  run: HistoricalResearchRun;
};

export type BuildResearchComparisonExportInput = {
  exportId: string;
  generated: ResearchExportGeneratedMetadata;
  comparison: ResearchComparison;
};

export const ResearchExportErrorCode = {
  INVALID_EXPORT_ID: "invalid-export-id",
  INVALID_GENERATED_METADATA: "invalid-generated-metadata",
  INVALID_RESEARCH_RUN: "invalid-research-run",
  INVALID_COMPARISON: "invalid-comparison",
} as const;

export type ResearchExportErrorCode =
  (typeof ResearchExportErrorCode)[keyof typeof ResearchExportErrorCode];

const ERROR_MESSAGES: Record<ResearchExportErrorCode, string> = {
  [ResearchExportErrorCode.INVALID_EXPORT_ID]:
    "exportId must be a non-empty string",
  [ResearchExportErrorCode.INVALID_GENERATED_METADATA]:
    "generated metadata requires a non-empty generatedAt timestamp",
  [ResearchExportErrorCode.INVALID_RESEARCH_RUN]:
    "Historical research run input is invalid",
  [ResearchExportErrorCode.INVALID_COMPARISON]:
    "Research comparison input is invalid",
};

export class ResearchExportError extends Error {
  readonly code: ResearchExportErrorCode;

  constructor(code: ResearchExportErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "ResearchExportError";
    this.code = code;
  }
}

export function summaryMetricsFromBacktest(
  metrics: BacktestMetricsSummary,
): ResearchExportSummaryMetrics {
  return {
    finalEquityCents: metrics.endEquityCents,
    totalPnlCents: metrics.totalPnlCents,
    totalReturnPct: metrics.totalReturnPct,
    maxDrawdownPct: metrics.maxDrawdownPct,
    sharpeRatio: metrics.sharpeRatio,
    winRatePct: metrics.winRatePct,
    tradeCount: metrics.tradeCount,
  };
}
