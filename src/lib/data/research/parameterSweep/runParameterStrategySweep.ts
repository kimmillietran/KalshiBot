import { posix } from "node:path";

import {
  runStrategySweep,
  type StrategySweepRunnerDeps,
} from "@/lib/data/research/sweep";

import { ParameterStrategySweepError, ParameterStrategySweepErrorCode } from "./errors";
import { generateParameterSets } from "./generateParameterSets";
import {
  resolveParameterStrategySweepSummaryPath,
  serializeParameterStrategySweepSummary,
} from "./serializeParameterStrategySweepSummary";
import type {
  ParameterSetRunSummary,
  ParameterStrategySweepSummary,
  RunParameterStrategySweepInput,
} from "./types";

function normalizePath(path: string): string {
  return posix.normalize(path.replace(/\\/g, "/"));
}

function parseConcurrency(value: number | undefined): number {
  const concurrency = value ?? 1;
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new ParameterStrategySweepError(
      "concurrency must be a positive integer",
      ParameterStrategySweepErrorCode.INVALID_DEFINITION,
    );
  }

  return concurrency;
}

function assertKnownStrategy(
  strategyId: string,
  deps: StrategySweepRunnerDeps,
): void {
  if (!deps.strategyRegistry.has(strategyId)) {
    throw new ParameterStrategySweepError(
      `Unknown strategy id "${strategyId}"`,
      ParameterStrategySweepErrorCode.UNKNOWN_STRATEGY_ID,
    );
  }
}

/** Executes one strategy across markets for every generated parameter set. */
export async function runParameterStrategySweep(
  input: RunParameterStrategySweepInput,
  deps: StrategySweepRunnerDeps,
): Promise<ParameterStrategySweepSummary> {
  const now = deps.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const startMs = Date.now();
  const concurrency = parseConcurrency(input.concurrency);
  const normalizedRegistryDir = normalizePath(input.registryDir);
  const normalizedOutputDir = normalizePath(input.outputDir);
  const strategyId = input.definition.strategyId.trim();

  assertKnownStrategy(strategyId, deps);

  const parameterSets = generateParameterSets(input.definition);
  const summaryPath = resolveParameterStrategySweepSummaryPath(
    normalizedOutputDir,
    strategyId,
    input.summaryPath,
  );
  const parameterSetSummaries: ParameterSetRunSummary[] = [];

  for (const parameterSet of parameterSets) {
    const setStartMs = Date.now();
    const sweepSummary = await runStrategySweep(
      {
        registryDir: normalizedRegistryDir,
        outputDir: normalizedOutputDir,
        strategyIds: [strategyId],
        strategyConfig: parameterSet.config,
        parameterSetId: parameterSet.parameterSetId,
        concurrency,
        writeSummary: false,
      },
      deps,
    );

    parameterSetSummaries.push({
      parameterSetId: parameterSet.parameterSetId,
      strategyId,
      config: parameterSet.config,
      runs: sweepSummary.runs,
      durationMs: Date.now() - setStartMs,
      totalRuns: sweepSummary.totalRuns,
      successfulRuns: sweepSummary.successfulRuns,
      failedRuns: sweepSummary.failedRuns,
    });
  }

  const completedAt = now().toISOString();
  const totalRuns = parameterSetSummaries.reduce(
    (total, parameterSet) => total + parameterSet.totalRuns,
    0,
  );
  const successfulRuns = parameterSetSummaries.reduce(
    (total, parameterSet) => total + parameterSet.successfulRuns,
    0,
  );
  const failedRuns = parameterSetSummaries.reduce(
    (total, parameterSet) => total + parameterSet.failedRuns,
    0,
  );

  const summary: ParameterStrategySweepSummary = {
    definition: input.definition,
    registryDir: normalizedRegistryDir,
    outputDir: normalizedOutputDir,
    summaryPath,
    concurrency,
    startedAt,
    completedAt,
    durationMs: Date.now() - startMs,
    parameterSets: Object.freeze([...parameterSetSummaries]),
    totalRuns,
    successfulRuns,
    failedRuns,
  };

  deps.filesystem.mkdir(posix.dirname(summaryPath));
  deps.filesystem.writeFile(
    summaryPath,
    serializeParameterStrategySweepSummary(summary),
  );

  return summary;
}
