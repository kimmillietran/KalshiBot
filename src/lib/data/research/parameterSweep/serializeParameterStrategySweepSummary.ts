import { posix } from "node:path";

import { stableStringify } from "@/lib/trading/config/hashConfig";

import { PARAMETER_SWEEP_SUMMARY_FILENAME, type ParameterStrategySweepSummary } from "./types";

export function serializeParameterStrategySweepSummary(
  summary: ParameterStrategySweepSummary,
): string {
  return stableStringify({
    definition: {
      strategyId: summary.definition.strategyId,
      parameters: summary.definition.parameters,
    },
    registryDir: summary.registryDir,
    outputDir: summary.outputDir,
    summaryPath: summary.summaryPath,
    concurrency: summary.concurrency,
    startedAt: summary.startedAt,
    completedAt: summary.completedAt,
    durationMs: summary.durationMs,
    totalRuns: summary.totalRuns,
    successfulRuns: summary.successfulRuns,
    failedRuns: summary.failedRuns,
    parameterSets: summary.parameterSets.map((parameterSet) => ({
      parameterSetId: parameterSet.parameterSetId,
      strategyId: parameterSet.strategyId,
      config: parameterSet.config,
      durationMs: parameterSet.durationMs,
      totalRuns: parameterSet.totalRuns,
      successfulRuns: parameterSet.successfulRuns,
      failedRuns: parameterSet.failedRuns,
      runs: [...parameterSet.runs],
    })),
  });
}

export function resolveParameterStrategySweepSummaryPath(
  outputDir: string,
  strategyId: string,
  summaryPath?: string,
): string {
  const normalizedOutputDir = outputDir.replace(/\\/g, "/");
  const requested = summaryPath?.trim();

  if (requested && (requested.includes("/") || requested.includes("\\"))) {
    return posix.normalize(requested.replace(/\\/g, "/"));
  }

  if (requested) {
    return posix.join(normalizedOutputDir, strategyId, requested);
  }

  return posix.join(
    normalizedOutputDir,
    strategyId,
    PARAMETER_SWEEP_SUMMARY_FILENAME,
  );
}
