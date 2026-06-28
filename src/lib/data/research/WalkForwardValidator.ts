import { stableStringify } from "@/lib/trading/config/hashConfig";
import type { HistoricalTradingSnapshot } from "@/lib/data/snapshots/types";

import { WalkForwardValidationError, WalkForwardErrorCode } from "./errors";
import {
  validateParameterSweepExperimentConfig,
} from "./ParameterSweep";
import type {
  ParameterSweepExperimentConfig,
  ParameterSweepExperimentResult,
} from "./parameterSweepTypes";
import type {
  RunWalkForwardValidationInput,
  RunWalkForwardValidationOptions,
  WalkForwardConfig,
  WalkForwardPhase,
  WalkForwardResult,
  WalkForwardRunResult,
  WalkForwardWindow,
} from "./walkForwardTypes";

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }

  Object.freeze(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreeze(item);
    }
  } else {
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
  }

  return value;
}

function sliceSnapshots(
  snapshots: readonly HistoricalTradingSnapshot[],
  startIndex: number,
  endIndex: number,
): readonly HistoricalTradingSnapshot[] {
  return Object.freeze(snapshots.slice(startIndex, endIndex + 1));
}

function validateWindowGenerationInputs(
  snapshotCount: number,
  trainingWindowSize: number,
  testingWindowSize: number,
  stepSize: number,
): void {
  if (snapshotCount === 0) {
    throw new WalkForwardValidationError(WalkForwardErrorCode.EMPTY_SNAPSHOTS);
  }

  if (
    !Number.isFinite(trainingWindowSize) ||
    !Number.isFinite(testingWindowSize) ||
    trainingWindowSize <= 0 ||
    testingWindowSize <= 0
  ) {
    throw new WalkForwardValidationError(
      WalkForwardErrorCode.INVALID_WINDOW_SIZE,
    );
  }

  if (!Number.isFinite(stepSize) || stepSize <= 0) {
    throw new WalkForwardValidationError(WalkForwardErrorCode.INVALID_STEP_SIZE);
  }

  if (trainingWindowSize + testingWindowSize > snapshotCount) {
    throw new WalkForwardValidationError(
      WalkForwardErrorCode.WINDOW_LARGER_THAN_DATASET,
    );
  }
}

export function validateWalkForwardConfig(
  config: WalkForwardConfig,
  snapshotCount: number,
): void {
  if (!config.validationId.trim()) {
    throw new WalkForwardValidationError(
      WalkForwardErrorCode.INVALID_VALIDATION_ID,
    );
  }

  validateWindowGenerationInputs(
    snapshotCount,
    config.trainingWindowSize,
    config.testingWindowSize,
    config.stepSize,
  );

  validateParameterSweepExperimentConfig(config.experimentConfig);

  if (config.experimentConfig.sweepId !== config.validationId) {
    throw new WalkForwardValidationError(
      WalkForwardErrorCode.INVALID_EXPERIMENT_CONFIG,
    );
  }
}

/** Deterministic rolling walk-forward windows with no overlap inside each window. */
export function generateWalkForwardWindows(
  snapshots: readonly HistoricalTradingSnapshot[],
  trainingWindowSize: number,
  testingWindowSize: number,
  stepSize: number,
): readonly WalkForwardWindow[] {
  validateWindowGenerationInputs(
    snapshots.length,
    trainingWindowSize,
    testingWindowSize,
    stepSize,
  );

  const windows: WalkForwardWindow[] = [];

  for (
    let windowIndex = 0;
    ;
    windowIndex += 1
  ) {
    const trainingStartIndex = windowIndex * stepSize;
    const trainingEndIndex = trainingStartIndex + trainingWindowSize - 1;
    const testingStartIndex = trainingEndIndex + 1;
    const testingEndIndex = testingStartIndex + testingWindowSize - 1;

    if (testingEndIndex >= snapshots.length) {
      break;
    }

    windows.push(
      deepFreeze({
        trainingSnapshots: sliceSnapshots(
          snapshots,
          trainingStartIndex,
          trainingEndIndex,
        ),
        testingSnapshots: sliceSnapshots(
          snapshots,
          testingStartIndex,
          testingEndIndex,
        ),
        trainingStartIndex,
        trainingEndIndex,
        testingStartIndex,
        testingEndIndex,
      }),
    );
  }

  return Object.freeze(windows);
}

function buildPhaseExperimentConfig(
  baseConfig: ParameterSweepExperimentConfig,
  phase: WalkForwardPhase,
  window: WalkForwardWindow,
): ParameterSweepExperimentConfig {
  return {
    experimentId: `${baseConfig.experimentId}-${phase}-${window.trainingStartIndex}-${window.testingEndIndex}`,
    sweepId: baseConfig.sweepId,
    parameters: {
      ...baseConfig.parameters,
      phase,
      trainingStartIndex: window.trainingStartIndex,
      trainingEndIndex: window.trainingEndIndex,
      testingStartIndex: window.testingStartIndex,
      testingEndIndex: window.testingEndIndex,
    },
  };
}

export function runWalkForwardResearchExperiment(
  config: ParameterSweepExperimentConfig,
  snapshots: readonly HistoricalTradingSnapshot[],
  phase: WalkForwardPhase,
): ParameterSweepExperimentResult {
  validateParameterSweepExperimentConfig(config);

  if (snapshots.length === 0) {
    throw new WalkForwardValidationError(
      WalkForwardErrorCode.EMPTY_WINDOW_SNAPSHOTS,
    );
  }

  const stubResult: ParameterSweepExperimentResult = deepFreeze({
    experimentId: config.experimentId,
    sweepId: config.sweepId,
    parameters: deepFreeze({ ...config.parameters }),
    status: "completed" as const,
  });

  return deepFreeze({
    ...stubResult,
    parameters: deepFreeze({
      ...config.parameters,
      phase,
      snapshotCount: snapshots.length,
    }),
  });
}

export function runWalkForwardValidation(
  input: RunWalkForwardValidationInput,
  options: RunWalkForwardValidationOptions = {},
): WalkForwardResult {
  validateWalkForwardConfig(input.config, input.snapshots.length);

  const executeExperiment =
    options.runExperiment ?? runWalkForwardResearchExperiment;
  const windows = generateWalkForwardWindows(
    input.snapshots,
    input.config.trainingWindowSize,
    input.config.testingWindowSize,
    input.config.stepSize,
  );
  const completedRuns: WalkForwardRunResult[] = [];

  for (const window of windows) {
    const trainingConfig = buildPhaseExperimentConfig(
      input.config.experimentConfig,
      "training",
      window,
    );
    const testingConfig = buildPhaseExperimentConfig(
      input.config.experimentConfig,
      "testing",
      window,
    );

    completedRuns.push(
      deepFreeze({
        window,
        trainingResult: executeExperiment(
          trainingConfig,
          window.trainingSnapshots,
          "training",
        ),
        testingResult: executeExperiment(
          testingConfig,
          window.testingSnapshots,
          "testing",
        ),
      }),
    );
  }

  return deepFreeze({
    validationId: input.config.validationId,
    windows,
    completedRuns: Object.freeze([...completedRuns]),
  });
}

export function serializeWalkForwardResult(result: WalkForwardResult): string {
  return stableStringify(result);
}
