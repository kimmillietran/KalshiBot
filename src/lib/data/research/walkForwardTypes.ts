import type { HistoricalTradingSnapshot } from "@/lib/data/snapshots/types";

import type {
  ParameterSweepExperimentConfig,
  ParameterSweepExperimentResult,
} from "./parameterSweepTypes";

export type WalkForwardPhase = "training" | "testing";

export type WalkForwardConfig = {
  validationId: string;
  trainingWindowSize: number;
  testingWindowSize: number;
  stepSize: number;
  experimentConfig: ParameterSweepExperimentConfig;
};

export type WalkForwardWindow = {
  trainingSnapshots: readonly HistoricalTradingSnapshot[];
  testingSnapshots: readonly HistoricalTradingSnapshot[];
  trainingStartIndex: number;
  trainingEndIndex: number;
  testingStartIndex: number;
  testingEndIndex: number;
};

export type WalkForwardRunResult = {
  window: WalkForwardWindow;
  trainingResult: ParameterSweepExperimentResult;
  testingResult: ParameterSweepExperimentResult;
};

export type WalkForwardResult = {
  validationId: string;
  windows: readonly WalkForwardWindow[];
  completedRuns: readonly WalkForwardRunResult[];
};

export type RunWalkForwardExperimentFn = (
  config: ParameterSweepExperimentConfig,
  snapshots: readonly HistoricalTradingSnapshot[],
  phase: WalkForwardPhase,
) => ParameterSweepExperimentResult;

export type RunWalkForwardValidationInput = {
  snapshots: readonly HistoricalTradingSnapshot[];
  config: WalkForwardConfig;
};

export type RunWalkForwardValidationOptions = {
  runExperiment?: RunWalkForwardExperimentFn;
};
