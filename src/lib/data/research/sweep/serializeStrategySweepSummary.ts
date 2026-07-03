import { posix } from "node:path";

import { stableStringify } from "@/lib/trading/config/hashConfig";

import {
  SWEEP_SUMMARY_FILENAME,
  type StrategySweepSummary,
} from "./strategySweepTypes";

/** Deterministic JSON serialization for strategy sweep summaries. */
export function serializeStrategySweepSummary(summary: StrategySweepSummary): string {
  return stableStringify({
    registryDir: summary.registryDir,
    outputDir: summary.outputDir,
    summaryPath: summary.summaryPath,
    concurrency: summary.concurrency,
    startedAt: summary.startedAt,
    completedAt: summary.completedAt,
    durationMs: summary.durationMs,
    strategiesExecuted: [...summary.strategiesExecuted],
    includeSynthesized: summary.includeSynthesized,
    synthesizedStrategiesExecuted: [...summary.synthesizedStrategiesExecuted],
    warnings: [...summary.warnings],
    marketsTested: summary.marketsTested,
    totalRuns: summary.totalRuns,
    successfulRuns: summary.successfulRuns,
    failedRuns: summary.failedRuns,
    runs: [...summary.runs],
  });
}

export function resolveStrategySweepSummaryPath(
  outputDir: string,
  summaryPath?: string,
): string {
  const normalizedOutputDir = outputDir.replace(/\\/g, "/");
  const requested = summaryPath?.trim() || SWEEP_SUMMARY_FILENAME;

  if (requested.includes("/") || requested.includes("\\")) {
    return posix.normalize(requested.replace(/\\/g, "/"));
  }

  return posix.join(normalizedOutputDir, requested);
}
