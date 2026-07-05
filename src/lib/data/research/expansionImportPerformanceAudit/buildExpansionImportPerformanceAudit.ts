import { analyzeExpansionImportPerformanceOptimizations } from "./analyzeExpansionImportPerformanceOptimizations";
import { computeExpansionImportPerformanceMetrics } from "./computeExpansionImportPerformanceMetrics";
import type {
  BuildExpansionImportPerformanceAuditInput,
  ExpansionImportPerformanceAuditReport,
} from "./expansionImportPerformanceAuditTypes";
import { loadExpansionImportPerformanceAuditInputs } from "./loadExpansionImportPerformanceAuditInputs";

/** Builds the expansion import performance audit report from summary and checkpoint artifacts. */
export function buildExpansionImportPerformanceAudit(
  input: BuildExpansionImportPerformanceAuditInput,
): ExpansionImportPerformanceAuditReport {
  const loaded = loadExpansionImportPerformanceAuditInputs(input.config, input.io);
  const metrics = computeExpansionImportPerformanceMetrics({
    summary: loaded.summary,
    checkpoint: loaded.checkpoint,
    importsDirStats: loaded.importsDirStats,
  });
  const recommendations = analyzeExpansionImportPerformanceOptimizations({
    summary: loaded.summary,
    checkpoint: loaded.checkpoint,
    metrics,
  });

  return {
    generatedAt: input.generatedAt,
    outputPath: input.config.outputPath,
    htmlOutputPath: input.config.htmlOutputPath,
    config: input.config,
    inputStatus: loaded.inputStatus,
    inputPaths: {
      expansionImportSummaryPath: input.config.expansionImportSummaryPath,
      expansionImportCheckpointPath: input.config.expansionImportCheckpointPath,
      importConfigsDir: input.config.importConfigsDir,
      importsDir: input.config.importsDir,
    },
    summaryMetrics: metrics.summaryMetrics,
    timeEstimates: metrics.timeEstimates,
    failedMarketBreakdown: metrics.failedMarketBreakdown,
    unsupportedMarketBreakdown: metrics.unsupportedMarketBreakdown,
    slowestMarkets: metrics.slowestMarkets,
    throughputByHour: metrics.throughputByHour,
    throughputByMonth: metrics.throughputByMonth,
    throughputByWindow: metrics.throughputByWindow,
    importConfigsStats: loaded.importConfigsStats,
    importsDirStats: loaded.importsDirStats,
    recommendations,
  };
}
