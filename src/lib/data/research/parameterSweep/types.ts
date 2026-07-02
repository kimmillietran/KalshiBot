import type { StrategySweepRunResult } from "@/lib/data/research/sweep";

export const DEFAULT_PARAMETER_SWEEP_REGISTRY_DIR = "data/research-datasets";
export const DEFAULT_PARAMETER_SWEEP_OUTPUT_DIR = "data/research-results";
export const PARAMETER_SWEEP_SUMMARY_FILENAME = "parameter-sweep-summary.json";

export type ParameterSweepDefinition = {
  strategyId: string;
  parameters: Readonly<Record<string, readonly unknown[]>>;
};

export type ParameterSet = {
  parameterSetId: string;
  config: Readonly<Record<string, unknown>>;
};

export type ParameterSetRunSummary = {
  parameterSetId: string;
  strategyId: string;
  config: Readonly<Record<string, unknown>>;
  runs: readonly StrategySweepRunResult[];
  durationMs: number;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
};

export type ParameterStrategySweepSummary = {
  definition: ParameterSweepDefinition;
  registryDir: string;
  outputDir: string;
  summaryPath: string;
  concurrency: number;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  parameterSets: readonly ParameterSetRunSummary[];
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
};

export type RunParameterStrategySweepInput = {
  definition: ParameterSweepDefinition;
  registryDir: string;
  outputDir: string;
  concurrency?: number;
  summaryPath?: string;
};
