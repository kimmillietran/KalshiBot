import type { LoadedExpansionRunHistoryInputs } from "./loadExpansionRunHistoryInputs";
import type { ExpansionRunHistoryRun } from "./expansionRunHistoryTypes";

function computeRate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) {
    return null;
  }

  return Number((numerator / denominator).toFixed(4));
}

/** Builds a longitudinal run record from the current expansion import artifacts. */
export function buildExpansionRunHistoryRun(
  loaded: LoadedExpansionRunHistoryInputs,
): ExpansionRunHistoryRun {
  const { summary, performanceMetrics } = loaded;
  const { summaryMetrics, timeEstimates } = performanceMetrics;
  const attemptedImports = summary.summary.importedCount + summary.summary.failedCount;
  const discoveryOverheadShare =
    summaryMetrics.totalElapsedMs > 0
      ? Number(
          (timeEstimates.discoveryTimeEstimateMs / summaryMetrics.totalElapsedMs).toFixed(4),
        )
      : null;

  const researchYieldPerImportedMarket =
    summary.summary.importedCount > 0 && loaded.resultingAtlasMarketCount !== null
      ? Number((loaded.resultingAtlasMarketCount / summary.summary.importedCount).toFixed(4))
      : summary.summary.importedCount > 0 && loaded.resultingFixtureCount !== null
        ? Number((loaded.resultingFixtureCount / summary.summary.importedCount).toFixed(4))
        : null;

  return {
    runId: summary.generatedAt,
    generatedAt: summary.generatedAt,
    summarySourcePath: loaded.summaryPath,
    maxMarkets: summary.maxMarkets,
    plannedCount: summary.summary.plannedCount,
    importedCount: summary.summary.importedCount,
    failedCount: summary.summary.failedCount,
    skippedCount: summary.summary.skippedCount,
    unsupportedCount:
      summary.summary.unsupportedCount + summary.summary.skippedUnsupportedCount,
    rateLimitedCount: summary.rateLimitDiagnostics.rateLimitedCount,
    backoffDurationMs: summary.rateLimitDiagnostics.backoffDurationMs,
    elapsedMs: summary.summary.durationMs,
    importsPerMinute: summaryMetrics.importsPerMinute,
    discoveryTimeEstimateMs: timeEstimates.discoveryTimeEstimateMs,
    discoveryOverheadShare,
    discoverySegmentsCacheHit: loaded.discoverySegmentsCacheHit,
    discoverySegmentsRefreshed: loaded.discoverySegmentsRefreshed,
    estimatedDiscoverySavingsMs: loaded.estimatedDiscoverySavingsMs,
    cacheEnabled: loaded.cacheEnabled,
    discoverySegmentsCorrupt: loaded.discoverySegmentsCorrupt,
    sampleStrategy: summary.sampleStrategy,
    adaptiveThrottleEnabled: summary.adaptiveThrottleDiagnostics.adaptiveThrottleEnabled,
    resultingFixtureCount: loaded.resultingFixtureCount,
    resultingAtlasMarketCount: loaded.resultingAtlasMarketCount,
    researchYieldPerImportedMarket,
    importSuccessRate: computeRate(summary.summary.importedCount, attemptedImports),
    unsupportedRate: computeRate(
      summary.summary.unsupportedCount + summary.summary.skippedUnsupportedCount,
      summary.summary.discoveredMarketCount,
    ),
    rateLimitRate: computeRate(summary.rateLimitDiagnostics.rateLimitedCount, attemptedImports),
    execute: summary.execute,
    runStatus: summary.runStatus,
  };
}
