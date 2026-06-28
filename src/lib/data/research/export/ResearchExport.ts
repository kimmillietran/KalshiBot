import { fnv1a32, stableStringify } from "@/lib/trading/config/hashConfig";

import type { BacktestMetricsSummary } from "@/lib/data/backtesting/metricsTypes";
import type { ResearchComparison } from "../comparison/comparisonTypes";
import type { ComparisonMetricValues } from "../comparison/comparisonTypes";

import {
  ResearchExportError,
  ResearchExportErrorCode,
  ResearchExportType,
  RESEARCH_EXPORT_TABLE_COLUMNS,
  summaryMetricsFromBacktest,
} from "./researchExportTypes";
import type {
  BuildResearchComparisonExportInput,
  BuildResearchRunExportInput,
  HistoricalResearchRun,
  ResearchExportDocument,
  ResearchExportGeneratedMetadata,
  ResearchExportRankingRow,
  ResearchExportSummaryMetrics,
  ResearchExportTableRow,
} from "./researchExportTypes";

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

function validateExportId(exportId: string): void {
  if (!exportId.trim()) {
    throw new ResearchExportError(ResearchExportErrorCode.INVALID_EXPORT_ID);
  }
}

function validateGeneratedMetadata(generated: ResearchExportGeneratedMetadata): void {
  if (!generated.generatedAt.trim()) {
    throw new ResearchExportError(
      ResearchExportErrorCode.INVALID_GENERATED_METADATA,
    );
  }
}

function validateBacktestMetrics(
  metrics: BacktestMetricsSummary,
): void {
  const required = [
    metrics.endEquityCents,
    metrics.totalPnlCents,
    metrics.totalReturnPct,
    metrics.maxDrawdownPct,
    metrics.winRatePct,
    metrics.tradeCount,
  ];

  for (const value of required) {
    if (!Number.isFinite(value)) {
      throw new ResearchExportError(ResearchExportErrorCode.INVALID_RESEARCH_RUN);
    }
  }

  if (
    metrics.sharpeRatio !== null &&
    !Number.isFinite(metrics.sharpeRatio)
  ) {
    throw new ResearchExportError(ResearchExportErrorCode.INVALID_RESEARCH_RUN);
  }
}

function validateResearchRun(run: HistoricalResearchRun): void {
  if (!run.config.runId.trim()) {
    throw new ResearchExportError(ResearchExportErrorCode.INVALID_RESEARCH_RUN);
  }

  if (!run.backtestResult.metadata.strategyId.trim()) {
    throw new ResearchExportError(ResearchExportErrorCode.INVALID_RESEARCH_RUN);
  }

  if (!run.datasetMetadata.datasetId.trim()) {
    throw new ResearchExportError(ResearchExportErrorCode.INVALID_RESEARCH_RUN);
  }

  validateBacktestMetrics(run.backtestResult.metrics);
}

function validateComparison(comparison: ResearchComparison): void {
  if (!comparison.comparisonId.trim() || comparison.rankings.length === 0) {
    throw new ResearchExportError(ResearchExportErrorCode.INVALID_COMPARISON);
  }
}

function summaryFromComparisonMetrics(
  metrics: ComparisonMetricValues,
): ResearchExportSummaryMetrics {
  return {
    finalEquityCents: metrics.finalEquityCents,
    totalPnlCents: null,
    totalReturnPct: metrics.totalReturnPct,
    maxDrawdownPct: metrics.maxDrawdownPct,
    sharpeRatio: metrics.sharpeRatio,
    winRatePct: metrics.winRatePct,
    tradeCount: metrics.tradeCount,
  };
}

function buildTableRow(
  rowKey: string,
  values: Record<string, string | number | null>,
): ResearchExportTableRow {
  const orderedValues: Record<string, string | number | null> = {};
  for (const column of RESEARCH_EXPORT_TABLE_COLUMNS) {
    orderedValues[column] = values[column] ?? null;
  }

  return deepFreeze({
    rowKey,
    values: deepFreeze(orderedValues),
  });
}

function buildRunTableRow(
  run: HistoricalResearchRun,
  summary: ResearchExportSummaryMetrics,
): ResearchExportTableRow {
  return buildTableRow(run.config.runId, {
    rank: 1,
    experimentId: null,
    runId: run.config.runId,
    strategyId: run.backtestResult.metadata.strategyId,
    datasetId: run.datasetMetadata.datasetId,
    finalEquityCents: summary.finalEquityCents,
    totalPnlCents: summary.totalPnlCents,
    totalReturnPct: summary.totalReturnPct,
    maxDrawdownPct: summary.maxDrawdownPct,
    sharpeRatio: summary.sharpeRatio,
    winRatePct: summary.winRatePct,
    tradeCount: summary.tradeCount,
    durationMs: run.durationMs,
  });
}

function buildComparisonTableRow(
  ranking: ResearchExportRankingRow,
): ResearchExportTableRow {
  return buildTableRow(ranking.experimentId, {
    rank: ranking.rank,
    experimentId: ranking.experimentId,
    runId: null,
    strategyId: null,
    datasetId: null,
    finalEquityCents: ranking.metrics.finalEquityCents,
    totalPnlCents: ranking.metrics.totalPnlCents,
    totalReturnPct: ranking.metrics.totalReturnPct,
    maxDrawdownPct: ranking.metrics.maxDrawdownPct,
    sharpeRatio: ranking.metrics.sharpeRatio,
    winRatePct: ranking.metrics.winRatePct,
    tradeCount: ranking.metrics.tradeCount,
    durationMs: null,
  });
}

function sortTableRows(
  rows: readonly ResearchExportTableRow[],
): readonly ResearchExportTableRow[] {
  return Object.freeze(
    [...rows].sort((left, right) => left.rowKey.localeCompare(right.rowKey)),
  );
}

function buildRankingRows(
  comparison: ResearchComparison,
): readonly ResearchExportRankingRow[] {
  return Object.freeze(
    comparison.rankings.map((ranking) =>
      deepFreeze({
        rank: ranking.rank,
        experimentId: ranking.experimentId,
        metrics: deepFreeze(summaryFromComparisonMetrics(ranking.metrics)),
      }),
    ),
  );
}

function cloneGeneratedMetadata(
  generated: ResearchExportGeneratedMetadata,
): ResearchExportGeneratedMetadata {
  return deepFreeze({
    generatedAt: generated.generatedAt,
    ...(generated.generatedBy !== undefined
      ? { generatedBy: generated.generatedBy }
      : {}),
    ...(generated.label !== undefined ? { label: generated.label } : {}),
    ...(generated.source !== undefined ? { source: generated.source } : {}),
  });
}

function cloneDatasetMetadata(
  metadata: HistoricalResearchRun["datasetMetadata"],
): HistoricalResearchRun["datasetMetadata"] {
  return deepFreeze({
    datasetId: metadata.datasetId,
    contractVersion: metadata.contractVersion,
    snapshotCount: metadata.snapshotCount,
    marketTickers: Object.freeze([...metadata.marketTickers]),
  });
}

function buildDocumentExportId(
  exportId: string,
  exportType: ResearchExportType,
  payload: unknown,
): string {
  if (exportId.trim()) {
    return exportId.trim();
  }

  const digest = fnv1a32(
    stableStringify({
      exportType,
      payload,
    }),
  );
  return `research-export-${digest}`;
}

/** Builds an export document for a completed historical research run. */
export function buildResearchRunExport(
  input: BuildResearchRunExportInput,
): ResearchExportDocument {
  validateExportId(input.exportId);
  validateGeneratedMetadata(input.generated);
  validateResearchRun(input.run);

  const summary = summaryMetricsFromBacktest(input.run.backtestResult.metrics);
  const tableRows = sortTableRows([buildRunTableRow(input.run, summary)]);

  return deepFreeze({
    exportId: buildDocumentExportId(input.exportId, ResearchExportType.RESEARCH_RUN, {
      runId: input.run.config.runId,
      summary,
    }),
    exportType: ResearchExportType.RESEARCH_RUN,
    generated: cloneGeneratedMetadata(input.generated),
    strategyId: input.run.backtestResult.metadata.strategyId,
    datasetMetadata: cloneDatasetMetadata(input.run.datasetMetadata),
    summary: deepFreeze({ ...summary }),
    rankings: null,
    tableRows,
  });
}

/** Builds an export document for a completed research comparison. */
export function buildResearchComparisonExport(
  input: BuildResearchComparisonExportInput,
): ResearchExportDocument {
  validateExportId(input.exportId);
  validateGeneratedMetadata(input.generated);
  validateComparison(input.comparison);

  const rankings = buildRankingRows(input.comparison);
  const summary = deepFreeze({
    ...rankings[0]!.metrics,
  });
  const tableRows = sortTableRows(
    rankings.map((ranking) => buildComparisonTableRow(ranking)),
  );

  return deepFreeze({
    exportId: buildDocumentExportId(
      input.exportId,
      ResearchExportType.RESEARCH_COMPARISON,
      {
        comparisonId: input.comparison.comparisonId,
        rankings,
      },
    ),
    exportType: ResearchExportType.RESEARCH_COMPARISON,
    generated: cloneGeneratedMetadata(input.generated),
    strategyId: null,
    datasetMetadata: null,
    summary,
    rankings,
    tableRows,
  });
}

/** Deterministic JSON-like serialization for export documents. */
export function serializeResearchExportDocument(
  document: ResearchExportDocument,
): string {
  return stableStringify(document);
}
