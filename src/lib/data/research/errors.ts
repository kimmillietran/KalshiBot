export const ParameterSweepErrorCode = {
  EMPTY_PARAMETER_LIST: "empty-parameter-list",
  INVALID_PARAMETER_NAME: "invalid-parameter-name",
  DUPLICATE_PARAMETER_NAME: "duplicate-parameter-name",
  EMPTY_PARAMETER_VALUES: "empty-parameter-values",
  DUPLICATE_PARAMETER_VALUE: "duplicate-parameter-value",
  INVALID_SWEEP_ID: "invalid-sweep-id",
  EXPERIMENT_FACTORY_FAILED: "experiment-factory-failed",
  INVALID_EXPERIMENT_CONFIG: "invalid-experiment-config",
} as const;

export type ParameterSweepErrorCode =
  (typeof ParameterSweepErrorCode)[keyof typeof ParameterSweepErrorCode];

const ERROR_MESSAGES: Record<ParameterSweepErrorCode, string> = {
  [ParameterSweepErrorCode.EMPTY_PARAMETER_LIST]:
    "Parameter sweep requires at least one sweep parameter",
  [ParameterSweepErrorCode.INVALID_PARAMETER_NAME]:
    "Sweep parameter names must be non-empty strings",
  [ParameterSweepErrorCode.DUPLICATE_PARAMETER_NAME]:
    "Sweep parameter names must be unique",
  [ParameterSweepErrorCode.EMPTY_PARAMETER_VALUES]:
    "Each sweep parameter must include at least one value",
  [ParameterSweepErrorCode.DUPLICATE_PARAMETER_VALUE]:
    "Sweep parameter values must be unique within a parameter",
  [ParameterSweepErrorCode.INVALID_SWEEP_ID]:
    "sweepId must be a non-empty string",
  [ParameterSweepErrorCode.EXPERIMENT_FACTORY_FAILED]:
    "experimentFactory failed while building a research experiment",
  [ParameterSweepErrorCode.INVALID_EXPERIMENT_CONFIG]:
    "Research experiment configuration is invalid",
};

export class ParameterSweepError extends Error {
  readonly code: ParameterSweepErrorCode;

  constructor(code: ParameterSweepErrorCode, options?: { cause?: unknown }) {
    super(ERROR_MESSAGES[code], options);
    this.name = "ParameterSweepError";
    this.code = code;
  }
}

export class ParameterSweepExperimentFactoryError extends ParameterSweepError {
  constructor(cause: unknown) {
    super(ParameterSweepErrorCode.EXPERIMENT_FACTORY_FAILED, { cause });
    this.name = "ParameterSweepExperimentFactoryError";
  }
}

export const WalkForwardErrorCode = {
  EMPTY_SNAPSHOTS: "empty-snapshots",
  INVALID_VALIDATION_ID: "invalid-validation-id",
  INVALID_WINDOW_SIZE: "invalid-window-size",
  INVALID_STEP_SIZE: "invalid-step-size",
  WINDOW_LARGER_THAN_DATASET: "window-larger-than-dataset",
  INVALID_EXPERIMENT_CONFIG: "invalid-experiment-config",
  EMPTY_WINDOW_SNAPSHOTS: "empty-window-snapshots",
} as const;

export type WalkForwardErrorCode =
  (typeof WalkForwardErrorCode)[keyof typeof WalkForwardErrorCode];

const WALK_FORWARD_ERROR_MESSAGES: Record<WalkForwardErrorCode, string> = {
  [WalkForwardErrorCode.EMPTY_SNAPSHOTS]:
    "Walk-forward validation requires at least one historical snapshot",
  [WalkForwardErrorCode.INVALID_VALIDATION_ID]:
    "validationId must be a non-empty string",
  [WalkForwardErrorCode.INVALID_WINDOW_SIZE]:
    "trainingWindowSize and testingWindowSize must be positive",
  [WalkForwardErrorCode.INVALID_STEP_SIZE]:
    "stepSize must be a positive number",
  [WalkForwardErrorCode.WINDOW_LARGER_THAN_DATASET]:
    "trainingWindowSize plus testingWindowSize exceeds snapshot count",
  [WalkForwardErrorCode.INVALID_EXPERIMENT_CONFIG]:
    "Research experiment configuration is invalid for walk-forward validation",
  [WalkForwardErrorCode.EMPTY_WINDOW_SNAPSHOTS]:
    "Walk-forward window partitions must contain snapshots",
};

export class WalkForwardValidationError extends Error {
  readonly code: WalkForwardErrorCode;

  constructor(code: WalkForwardErrorCode, options?: { cause?: unknown }) {
    super(WALK_FORWARD_ERROR_MESSAGES[code], options);
    this.name = "WalkForwardValidationError";
    this.code = code;
  }
}
