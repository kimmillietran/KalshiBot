import { posix } from "node:path";

import { stableStringify } from "@/lib/trading/config/hashConfig";

import {
  DEFAULT_BATCH_RESEARCH_SUMMARY_FILENAME,
  type BatchResearchSummary,
} from "./batchResearchTypes";

/** Deterministic JSON serialization for batch research summaries. */
export function serializeBatchResearchSummary(summary: BatchResearchSummary): string {
  return stableStringify({
    registryDir: summary.registryDir,
    outputDir: summary.outputDir,
    summaryPath: summary.summaryPath,
    concurrency: summary.concurrency,
    startedAt: summary.startedAt,
    completedAt: summary.completedAt,
    durationMs: summary.durationMs,
    totalDatasets: summary.totalDatasets,
    successfulRuns: summary.successfulRuns,
    failedRuns: summary.failedRuns,
    skippedRuns: summary.skippedRuns,
    markets: [...summary.markets],
  });
}

export function resolveBatchResearchSummaryPath(
  outputDir: string,
  summaryPath?: string,
): string {
  const normalizedOutputDir = outputDir.replace(/\\/g, "/");
  const requested = summaryPath?.trim() || DEFAULT_BATCH_RESEARCH_SUMMARY_FILENAME;

  if (requested.includes("/") || requested.includes("\\")) {
    return posix.normalize(requested.replace(/\\/g, "/"));
  }

  return posix.join(normalizedOutputDir, requested);
}
