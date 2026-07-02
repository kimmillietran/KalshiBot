export const ExecutionCostModelErrorCode = {
  INVALID_CONFIG: "invalid-config",
  INVALID_FEE: "invalid-fee",
  INVALID_MODEL: "invalid-model",
  INVALID_PRICE: "invalid-price",
  INVALID_QUANTITY: "invalid-quantity",
  UNSUPPORTED_SPREAD_MODEL: "unsupported-spread-model",
} as const;

export type ExecutionCostModelErrorCode =
  (typeof ExecutionCostModelErrorCode)[keyof typeof ExecutionCostModelErrorCode];

export class ExecutionCostModelError extends Error {
  readonly code: ExecutionCostModelErrorCode;

  constructor(message: string, code: ExecutionCostModelErrorCode) {
    super(message);
    this.name = "ExecutionCostModelError";
    this.code = code;
  }
}
