import type { HistoricalTradingSnapshot } from "@/lib/data/snapshots/types";

import type {
  ResearchExperimentConfig,
  ResearchExperimentResult,
} from "./parameterSweepTypes";

export type WalkForwardPhase = "training" | "testing";

export type WalkForwardConfig = {
  validationId: string;
  trainingWindowSize: number;
  testingWindowSize: number;
  stepSize: number;
  experimentConfig: ResearchExperimentConfig;
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
  trainingResult: ResearchExperimentResult;
  testingResult: ResearchExperimentResult;
};

export type WalkForwardResult = {
  validationId: string;
  windows: readonly WalkForwardWindow[];
  completedRuns: readonly WalkForwardRunResult[];
};

export type RunWalkForwardExperimentFn = (
  config: ResearchExperimentConfig,
  snapshots: readonly HistoricalTradingSnapshot[],
  phase: WalkForwardPhase,
) => ResearchExperimentResult;

export type RunWalkForwardValidationInput = {
  snapshots: readonly HistoricalTradingSnapshot[];
  config: WalkForwardConfig;
};

export type RunWalkForwardValidationOptions = {
  runExperiment?: RunWalkForwardExperimentFn;
};
