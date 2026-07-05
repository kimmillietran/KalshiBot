import { classifyExpansionImportFailure } from "@/lib/data/importJobs/expansionExecutor/expansionImportCircuitBreaker";
import type {
  ExpansionImportJobResult,
  ExpansionImportMarketResult,
  HistoricalExpansionImportSummary,
} from "@/lib/data/importJobs/expansionExecutor/expansionExecutorTypes";
import type { HistoricalExpansionImportCheckpoint } from "@/lib/data/importJobs/expansionImportSafety";
import { classifyExpansionImportMarketOutcome } from "@/lib/data/research/coveragePlanner/importability/classifyExpansionImportMarketOutcome";
import { parseExpansionMarketCalendarMonth } from "@/lib/data/research/coveragePlanner/importability/parseExpansionMarketCalendarMonth";
import { percentile } from "@/lib/data/research/statisticalSignificance/deterministicSampling";

import type {
  DurationPercentiles,
  ExpansionImportDirectoryStats,
  ExpansionImportPerformanceSummaryMetrics,
  FailureBreakdownEntry,
  SlowMarketEntry,
  ThroughputBucket,
  TimeEstimateBreakdown,
} from "./expansionImportPerformanceAuditTypes";

const KALSHI_TICKER_HOUR_PATTERN =
  /-(\d{2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(\d{2})(\d{2})(\d{2})/i;

const DEDUPED_SKIP_PREFIX = "Market already present";

function parseMarketHourBucket(marketTicker: string): string | null {
  const match = marketTicker.match(KALSHI_TICKER_HOUR_PATTERN);
  if (!match) {
    return null;
  }

  const hour = Number(match[4]);
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) {
    return null;
  }

  return `${String(hour).padStart(2, "0")}:00`;
}

function parseJobWindowLabel(jobId: string): string {
  const match = jobId.match(/(\d{8})-(\d{8})$/);
  if (!match) {
    return jobId;
  }

  return `${match[1]!.slice(0, 4)}-${match[1]!.slice(4, 6)}-${match[1]!.slice(6, 8)} → ${match[2]!.slice(0, 4)}-${match[2]!.slice(4, 6)}-${match[2]!.slice(6, 8)}`;
}

function collectAllMarkets(summary: HistoricalExpansionImportSummary): ExpansionImportMarketResult[] {
  return summary.jobs.flatMap((job) => job.markets);
}

function computePercentiles(values: readonly number[]): DurationPercentiles {
  if (values.length === 0) {
    return { p50Ms: null, p95Ms: null, p99Ms: null };
  }

  const sorted = [...values].sort((left, right) => left - right);
  return {
    p50Ms: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    p99Ms: percentile(sorted, 99),
  };
}

function buildBreakdown(
  counts: ReadonlyMap<string, number>,
  total: number,
): FailureBreakdownEntry[] {
  return [...counts.entries()]
    .map(([category, count]) => ({
      category,
      count,
      share: total > 0 ? Number((count / total).toFixed(4)) : 0,
    }))
    .sort((left, right) => right.count - left.count);
}

function incrementCount(map: Map<string, number>, key: string, amount = 1): void {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function buildThroughputBuckets(
  jobs: readonly ExpansionImportJobResult[],
  bucketForMarket: (market: ExpansionImportMarketResult) => string | null,
  elapsedMs: number,
): ThroughputBucket[] {
  const buckets = new Map<string, { imported: number; failed: number; attempted: number }>();

  for (const job of jobs) {
    for (const market of job.markets) {
      const bucket = bucketForMarket(market);
      if (!bucket) {
        continue;
      }

      const entry = buckets.get(bucket) ?? { imported: 0, failed: 0, attempted: 0 };
      if (market.status === "imported") {
        entry.imported += 1;
        entry.attempted += 1;
      } else if (market.status === "failed") {
        entry.failed += 1;
        entry.attempted += 1;
      }
      buckets.set(bucket, entry);
    }
  }

  const minutes = elapsedMs / 60_000;

  return [...buckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([bucket, counts]) => ({
      bucket,
      importedCount: counts.imported,
      failedCount: counts.failed,
      attemptedCount: counts.attempted,
      importsPerMinute: minutes > 0 ? Number((counts.imported / minutes).toFixed(2)) : null,
    }));
}

function estimateImportWriteTimeMs(
  markets: readonly ExpansionImportMarketResult[],
  importsDirStats: ExpansionImportDirectoryStats,
): number | null {
  const importedWithPath = markets.filter(
    (market) => market.status === "imported" && market.importResultPath,
  ).length;

  if (importedWithPath === 0 || !importsDirStats.present) {
    return null;
  }

  const averageBytesPerImport =
    importsDirStats.importResultCount > 0
      ? importsDirStats.totalBytes / importsDirStats.importResultCount
      : 0;
  const estimatedMsPerKb = 2;
  return Math.round((averageBytesPerImport / 1024) * estimatedMsPerKb * importedWithPath);
}

export type ComputedExpansionImportPerformanceMetrics = {
  summaryMetrics: ExpansionImportPerformanceSummaryMetrics;
  timeEstimates: TimeEstimateBreakdown;
  failedMarketBreakdown: readonly FailureBreakdownEntry[];
  unsupportedMarketBreakdown: readonly FailureBreakdownEntry[];
  slowestMarkets: readonly SlowMarketEntry[];
  throughputByHour: readonly ThroughputBucket[];
  throughputByMonth: readonly ThroughputBucket[];
  throughputByWindow: readonly ThroughputBucket[];
  checkpointRetryCount: number;
};

/** Computes timing, throughput, and breakdown metrics from expansion import artifacts. */
export function computeExpansionImportPerformanceMetrics(input: {
  summary: HistoricalExpansionImportSummary;
  checkpoint: HistoricalExpansionImportCheckpoint | null;
  importsDirStats: ExpansionImportDirectoryStats;
}): ComputedExpansionImportPerformanceMetrics {
  const { summary } = input;
  const allMarkets = collectAllMarkets(summary);
  const importedDurations = allMarkets
    .filter((market) => market.status === "imported" && market.durationMs !== null)
    .map((market) => market.durationMs ?? 0);
  const totalElapsedMs = summary.summary.durationMs;
  const backoffDurationMs = summary.rateLimitDiagnostics.backoffDurationMs;

  const summaryMetrics: ExpansionImportPerformanceSummaryMetrics = {
    totalElapsedMs,
    importsPerMinute:
      totalElapsedMs > 0
        ? Number(((summary.summary.importedCount / totalElapsedMs) * 60_000).toFixed(2))
        : null,
    averageImportDurationMs:
      importedDurations.length > 0
        ? Math.round(
            importedDurations.reduce((sum, value) => sum + value, 0) / importedDurations.length,
          )
        : null,
    importDurationPercentiles: computePercentiles(importedDurations),
    rateLimitedCount: summary.rateLimitDiagnostics.rateLimitedCount,
    backoffDurationMs,
    backoffShareOfElapsed:
      totalElapsedMs > 0
        ? Number((backoffDurationMs / totalElapsedMs).toFixed(4))
        : 0,
    retryCount: summary.rateLimitDiagnostics.retryCount,
    importedCount: summary.summary.importedCount,
    failedCount: summary.summary.failedCount,
    skippedCount: summary.summary.skippedCount,
    plannedCount: summary.summary.plannedCount,
    discoveredMarketCount: summary.summary.discoveredMarketCount,
    unsupportedCount: summary.summary.unsupportedCount,
    skippedUnsupportedCount: summary.summary.skippedUnsupportedCount,
    maxMarkets: summary.maxMarkets,
    execute: summary.execute,
    runStatus: summary.runStatus,
  };

  let activeImportTimeMs = 0;
  let discoveryTimeEstimateMs = 0;
  let dedupedCount = 0;

  for (const job of summary.jobs) {
    const marketDurationSum = job.markets.reduce(
      (sum, market) => sum + (market.durationMs ?? 0),
      0,
    );
    activeImportTimeMs += marketDurationSum;
    discoveryTimeEstimateMs += Math.max(0, job.durationMs - marketDurationSum);

    for (const market of job.markets) {
      if (
        market.status === "skipped"
        && market.skipReason?.startsWith(DEDUPED_SKIP_PREFIX)
      ) {
        dedupedCount += 1;
      }
    }
  }

  const dedupeTimeEstimateMs = dedupedCount * 3;
  const importWriteTimeEstimateMs = estimateImportWriteTimeMs(allMarkets, input.importsDirStats);
  const attributedMs =
    activeImportTimeMs
    + backoffDurationMs
    + discoveryTimeEstimateMs
    + dedupeTimeEstimateMs
    + (importWriteTimeEstimateMs ?? 0);
  const unattributedOverheadMs = Math.max(0, totalElapsedMs - attributedMs);

  const timeEstimates: TimeEstimateBreakdown = {
    discoveryTimeEstimateMs,
    dedupeTimeEstimateMs,
    importWriteTimeEstimateMs,
    activeImportTimeMs,
    backoffTimeMs: backoffDurationMs,
    unattributedOverheadMs,
  };

  const failedCounts = new Map<string, number>();
  for (const market of allMarkets.filter((entry) => entry.status === "failed")) {
    const message = market.errorMessage ?? "unknown";
    const failureClass = classifyExpansionImportFailure(message);
    incrementCount(failedCounts, failureClass);
  }

  const unsupportedCounts = new Map<string, number>();
  for (const market of allMarkets) {
    const outcome = classifyExpansionImportMarketOutcome({
      status: market.status,
      errorMessage: market.errorMessage,
      skipReason: market.skipReason,
    });

    if (outcome === "compatibility-failure") {
      incrementCount(unsupportedCounts, "compatibility-failure");
    } else if (outcome === "unsupported-market") {
      incrementCount(unsupportedCounts, "skipped-unsupported");
    }
  }

  for (const job of summary.jobs) {
    if (job.skippedUnsupportedCount > 0) {
      incrementCount(unsupportedCounts, "pre-import-unsupported-skip", job.skippedUnsupportedCount);
    }
  }

  const slowestMarkets: SlowMarketEntry[] = allMarkets
    .filter((market) => market.durationMs !== null && market.durationMs > 0)
    .sort((left, right) => (right.durationMs ?? 0) - (left.durationMs ?? 0))
    .slice(0, 15)
    .map((market) => ({
      marketTicker: market.marketTicker,
      seriesTicker: market.seriesTicker,
      status: market.status,
      durationMs: market.durationMs ?? 0,
      errorMessage: market.errorMessage,
    }));

  const checkpointRetryCount =
    input.checkpoint?.jobs.reduce(
      (sum, job) =>
        sum + job.failedMarkets.reduce((jobSum, market) => jobSum + market.retryCount, 0),
      0,
    ) ?? 0;

  if (checkpointRetryCount > summaryMetrics.retryCount) {
    summaryMetrics.retryCount = checkpointRetryCount;
  }

  return {
    summaryMetrics,
    timeEstimates,
    failedMarketBreakdown: buildBreakdown(failedCounts, summary.summary.failedCount),
    unsupportedMarketBreakdown: buildBreakdown(
      unsupportedCounts,
      summary.summary.unsupportedCount + summary.summary.skippedUnsupportedCount,
    ),
    slowestMarkets,
    throughputByHour: buildThroughputBuckets(
      summary.jobs,
      (market) => parseMarketHourBucket(market.marketTicker),
      totalElapsedMs,
    ),
    throughputByMonth: buildThroughputBuckets(
      summary.jobs,
      (market) => parseExpansionMarketCalendarMonth(market.marketTicker),
      totalElapsedMs,
    ),
    throughputByWindow: buildThroughputBuckets(
      summary.jobs,
      (market) => {
        const job = summary.jobs.find((entry) =>
          entry.markets.some((candidate) => candidate.marketTicker === market.marketTicker),
        );
        return job ? parseJobWindowLabel(job.jobId) : null;
      },
      totalElapsedMs,
    ),
    checkpointRetryCount,
  };
}
