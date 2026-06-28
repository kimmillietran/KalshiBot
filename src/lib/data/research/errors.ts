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
