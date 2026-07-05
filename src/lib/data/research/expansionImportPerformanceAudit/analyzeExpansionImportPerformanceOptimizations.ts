import { DEFAULT_EXPANSION_RATE_LIMIT_BACKOFF_MS } from "@/lib/data/importJobs/expansionExecutor/expansionImportRateLimit";
import type { HistoricalExpansionImportSummary } from "@/lib/data/importJobs/expansionExecutor/expansionExecutorTypes";
import type { HistoricalExpansionImportCheckpoint } from "@/lib/data/importJobs/expansionImportSafety";

import type { ComputedExpansionImportPerformanceMetrics } from "./computeExpansionImportPerformanceMetrics";
import type {
  ExpansionImportOptimizationSuggestion,
  ExpansionImportPerformanceRecommendations,
} from "./expansionImportPerformanceAuditTypes";

function estimateRecommendedBatchSize(metrics: ComputedExpansionImportPerformanceMetrics): number | null {
  const { summaryMetrics } = metrics;
  if (summaryMetrics.importedCount === 0) {
    return null;
  }

  if (summaryMetrics.rateLimitedCount === 0) {
    return Math.min(50, Math.max(10, Math.round(summaryMetrics.importedCount / 10)));
  }

  const importsPerRateLimitEvent =
    summaryMetrics.importedCount / Math.max(1, summaryMetrics.rateLimitedCount);
  const conservativeBatch = Math.max(5, Math.floor(importsPerRateLimitEvent * 0.7));
  return Math.min(100, conservativeBatch);
}

function estimateRecommendedBackoffMs(metrics: ComputedExpansionImportPerformanceMetrics): number | null {
  const { summaryMetrics } = metrics;
  if (summaryMetrics.rateLimitedCount === 0) {
    return DEFAULT_EXPANSION_RATE_LIMIT_BACKOFF_MS;
  }

  const averageBackoffMs =
    summaryMetrics.backoffDurationMs / Math.max(1, summaryMetrics.retryCount);
  return Math.round(Math.max(DEFAULT_EXPANSION_RATE_LIMIT_BACKOFF_MS, averageBackoffMs * 1.2));
}

function assessAdaptiveThrottling(
  metrics: ComputedExpansionImportPerformanceMetrics,
): Pick<
  ExpansionImportPerformanceRecommendations,
  "adaptiveThrottlingWouldHelp" | "adaptiveThrottlingRationale"
> {
  const { summaryMetrics } = metrics;
  const backoffShare = summaryMetrics.backoffShareOfElapsed;

  if (summaryMetrics.rateLimitedCount >= 10 || backoffShare >= 0.1) {
    return {
      adaptiveThrottlingWouldHelp: true,
      adaptiveThrottlingRationale:
        `Backoff consumed ${Math.round(backoffShare * 100)}% of elapsed time across ${summaryMetrics.rateLimitedCount} rate-limit events. Adaptive throttling could reduce wasted API calls and shorten total runtime.`,
    };
  }

  if (summaryMetrics.rateLimitedCount > 0) {
    return {
      adaptiveThrottlingWouldHelp: true,
      adaptiveThrottlingRationale:
        "Rate limits were observed. Adaptive throttling would provide modest gains by spacing requests before limits are hit.",
    };
  }

  return {
    adaptiveThrottlingWouldHelp: false,
    adaptiveThrottlingRationale:
      "No meaningful rate-limit backoff was recorded; adaptive throttling is unlikely to change runtime materially.",
  };
}

function assessParallelismSafety(
  metrics: ComputedExpansionImportPerformanceMetrics,
): string {
  if (metrics.summaryMetrics.rateLimitedCount > 0) {
    return "Unsafe for parallel market imports: Kalshi rate limits were triggered during this run. Parallelism would likely increase 429 responses and backoff time.";
  }

  if (metrics.summaryMetrics.importsPerMinute !== null && metrics.summaryMetrics.importsPerMinute > 120) {
    return "Marginally safe only with strict concurrency caps: throughput is high enough that parallel workers could still trip shared API limits.";
  }

  return "Limited parallelism may be safe for non-Kalshi phases (config generation, disk writes), but market import calls should remain serialized until rate-limit headroom is confirmed.";
}

function buildOptimizationSuggestions(input: {
  summary: HistoricalExpansionImportSummary;
  checkpoint: HistoricalExpansionImportCheckpoint | null;
  metrics: ComputedExpansionImportPerformanceMetrics;
  recommendedBatchSize: number | null;
  recommendedBackoffMs: number | null;
  adaptiveThrottlingWouldHelp: boolean;
}): ExpansionImportOptimizationSuggestion[] {
  const suggestions: ExpansionImportOptimizationSuggestion[] = [];
  const { summaryMetrics, timeEstimates } = input.metrics;

  if (summaryMetrics.rateLimitedCount > 0) {
    suggestions.push({
      id: "adaptive-backoff-reuse",
      category: "adaptive-backoff",
      title: "Reuse adaptive backoff between markets",
      rationale:
        `Recorded ${summaryMetrics.rateLimitedCount} rate-limit events and ${summaryMetrics.backoffDurationMs}ms of backoff. Persist backoff state across markets instead of resetting after each success.`,
      estimatedImpact: summaryMetrics.backoffShareOfElapsed >= 0.1 ? "high" : "medium",
      safeToApply: true,
    });
  }

  if (input.recommendedBatchSize !== null && summaryMetrics.rateLimitedCount > 0) {
    suggestions.push({
      id: "batch-with-cooldown",
      category: "batching",
      title: "Batch imports with cooldown pauses",
      rationale:
        `Observed ~${Math.round(summaryMetrics.importedCount / Math.max(1, summaryMetrics.rateLimitedCount))} imports per rate-limit event. Consider batches of ~${input.recommendedBatchSize} markets with a cooldown between batches.`,
      estimatedImpact: "medium",
      safeToApply: true,
    });
  }

  suggestions.push({
    id: "parallelism-assessment",
    category: "parallelism",
    title: "Keep Kalshi market imports serialized",
    rationale: assessParallelismSafety(input.metrics),
    estimatedImpact: summaryMetrics.rateLimitedCount > 0 ? "high" : "low",
    safeToApply: false,
  });

  if (
    input.checkpoint
    && (input.summary.runStatus === "partial" || input.summary.runStatus === "interrupted")
  ) {
    suggestions.push({
      id: "checkpoint-resume",
      category: "checkpoint-resume",
      title: "Resume from checkpoint after partial run",
      rationale:
        `Run ended with status "${input.summary.runStatus}" and ${input.metrics.checkpointRetryCount} checkpoint retry records. Use --resume to avoid re-importing completed markets.`,
      estimatedImpact: "high",
      safeToApply: true,
    });
  }

  const unsupportedTotal =
    summaryMetrics.unsupportedCount + summaryMetrics.skippedUnsupportedCount;
  if (unsupportedTotal > 0) {
    suggestions.push({
      id: "skip-known-unsupported",
      category: "unsupported-filter",
      title: "Skip known-unsupported markets before API import",
      rationale:
        `${unsupportedTotal} unsupported markets consumed planning or import time. Filter using planning history and supported-first selection before hitting detail endpoints.`,
      estimatedImpact: unsupportedTotal >= 10 ? "medium" : "low",
      safeToApply: true,
    });
  }

  if (timeEstimates.dedupeTimeEstimateMs > 0 || timeEstimates.discoveryTimeEstimateMs > 0) {
    const dedupedShare =
      summaryMetrics.discoveredMarketCount > 0
        ? summaryMetrics.skippedCount / summaryMetrics.discoveredMarketCount
        : 0;

    suggestions.push({
      id: "reduce-discovery-rescans",
      category: "discovery-dedupe",
      title: "Reduce duplicate discovery scans",
      rationale:
        dedupedShare >= 0.2
          ? `~${Math.round(dedupedShare * 100)}% of discovered markets were deduped. Cache discovery results per job window and reuse existing ticker scans across resume runs.`
          : `Estimated discovery overhead is ${timeEstimates.discoveryTimeEstimateMs}ms. Cache per-window discovery responses when resuming or re-running adjacent jobs.`,
      estimatedImpact: timeEstimates.discoveryTimeEstimateMs >= 60_000 ? "medium" : "low",
      safeToApply: true,
    });
  }

  if (input.recommendedBackoffMs !== null && summaryMetrics.rateLimitedCount > 0) {
    suggestions.push({
      id: "increase-backoff",
      category: "adaptive-backoff",
      title: "Increase base backoff after sustained 429s",
      rationale:
        `Average waited backoff per retry was ~${Math.round(summaryMetrics.backoffDurationMs / Math.max(1, summaryMetrics.retryCount))}ms. Try --rate-limit-backoff-ms ${input.recommendedBackoffMs} on the next run.`,
      estimatedImpact: "medium",
      safeToApply: true,
    });
  }

  return suggestions;
}

/** Derives optimization recommendations from computed expansion import performance metrics. */
export function analyzeExpansionImportPerformanceOptimizations(input: {
  summary: HistoricalExpansionImportSummary;
  checkpoint: HistoricalExpansionImportCheckpoint | null;
  metrics: ComputedExpansionImportPerformanceMetrics;
}): ExpansionImportPerformanceRecommendations {
  const recommendedBatchSize = estimateRecommendedBatchSize(input.metrics);
  const recommendedBackoffMs = estimateRecommendedBackoffMs(input.metrics);
  const adaptive = assessAdaptiveThrottling(input.metrics);

  return {
    recommendedBatchSize,
    recommendedBackoffMs,
    adaptiveThrottlingWouldHelp: adaptive.adaptiveThrottlingWouldHelp,
    adaptiveThrottlingRationale: adaptive.adaptiveThrottlingRationale,
    parallelismSafetyAssessment: assessParallelismSafety(input.metrics),
    optimizations: buildOptimizationSuggestions({
      ...input,
      recommendedBatchSize,
      recommendedBackoffMs,
      adaptiveThrottlingWouldHelp: adaptive.adaptiveThrottlingWouldHelp,
    }),
  };
}
