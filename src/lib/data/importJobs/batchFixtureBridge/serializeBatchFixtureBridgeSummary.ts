import { posix } from "node:path";

import { stableStringify } from "@/lib/trading/config/hashConfig";

import {
  DEFAULT_BATCH_FIXTURE_SUMMARY_FILENAME,
  type BatchFixtureBridgeSummary,
} from "./batchFixtureBridgeTypes";

/** Deterministic JSON serialization for batch fixture summaries. */
export function serializeBatchFixtureBridgeSummary(
  summary: BatchFixtureBridgeSummary,
): string {
  return stableStringify({
    inputDir: summary.inputDir,
    outputDir: summary.outputDir,
    summaryPath: summary.summaryPath,
    startedAt: summary.startedAt,
    completedAt: summary.completedAt,
    durationMs: summary.durationMs,
    totalImports: summary.totalImports,
    successfulFixtures: summary.successfulFixtures,
    failedFixtures: summary.failedFixtures,
    skippedFixtures: summary.skippedFixtures,
    markets: [...summary.markets],
  });
}

export function resolveBatchFixtureSummaryPath(
  outputDir: string,
  summaryPath?: string,
): string {
  const normalizedOutputDir = outputDir.replace(/\\/g, "/");
  const requested = summaryPath?.trim() || DEFAULT_BATCH_FIXTURE_SUMMARY_FILENAME;

  if (requested.includes("/") || requested.includes("\\")) {
    return posix.normalize(requested.replace(/\\/g, "/"));
  }

  return posix.join(normalizedOutputDir, requested);
}
