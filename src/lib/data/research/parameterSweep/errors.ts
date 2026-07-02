export const ParameterStrategySweepErrorCode = {
  INVALID_DEFINITION: "invalid-definition",
  INVALID_STRATEGY_ID: "invalid-strategy-id",
  EMPTY_PARAMETER_VALUES: "empty-parameter-values",
  DUPLICATE_PARAMETER_VALUE: "duplicate-parameter-value",
  DUPLICATE_PARAMETER_CONFIG: "duplicate-parameter-config",
  INVALID_CONFIG_JSON: "invalid-config-json",
  UNKNOWN_STRATEGY_ID: "unknown-strategy-id",
} as const;

export type ParameterStrategySweepErrorCode =
  (typeof ParameterStrategySweepErrorCode)[keyof typeof ParameterStrategySweepErrorCode];

export class ParameterStrategySweepError extends Error {
  readonly code: ParameterStrategySweepErrorCode;

  constructor(
    message: string,
    code: ParameterStrategySweepErrorCode,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ParameterStrategySweepError";
    this.code = code;
  }
}
