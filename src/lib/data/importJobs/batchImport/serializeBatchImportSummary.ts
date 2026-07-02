import { posix } from "node:path";

import { stableStringify } from "@/lib/trading/config/hashConfig";

import {
  BATCH_IMPORT_SUMMARY_FILENAME,
  type BatchImportSummary,
} from "./batchImportTypes";

/** Deterministic JSON serialization for batch import summaries. */
export function serializeBatchImportSummary(summary: BatchImportSummary): string {
  return stableStringify({
    inputDir: summary.inputDir,
    outputDir: summary.outputDir,
    concurrency: summary.concurrency,
    requestDelayMs: summary.requestDelayMs,
    maxRetries: summary.maxRetries,
    retryBaseDelayMs: summary.retryBaseDelayMs,
    startedAt: summary.startedAt,
    completedAt: summary.completedAt,
    durationMs: summary.durationMs,
    totalConfigs: summary.totalConfigs,
    successfulImports: summary.successfulImports,
    failedImports: summary.failedImports,
    skippedImports: summary.skippedImports,
    retryCount: summary.retryCount,
    recoveredImports: summary.recoveredImports,
    failedAfterRetries: summary.failedAfterRetries,
    failureReasonCounts: summary.failureReasonCounts,
    summaryPath: summary.summaryPath,
    markets: [...summary.markets],
  });
}

export function buildBatchImportSummaryPath(outputDir: string): string {
  return posix.join(outputDir.replace(/\\/g, "/"), BATCH_IMPORT_SUMMARY_FILENAME);
}
