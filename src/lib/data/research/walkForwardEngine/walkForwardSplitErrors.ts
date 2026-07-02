export const WalkForwardSplitErrorCode = {
  MISSING_REGISTRY_DIR: "missing-registry-dir",
  INVALID_REGISTRY: "invalid-registry",
  EMPTY_DATASET: "empty-dataset",
  INVALID_SPLIT_ID: "invalid-split-id",
  INVALID_WINDOW_SIZE: "invalid-window-size",
  INVALID_STEP_SIZE: "invalid-step-size",
  INVALID_EMBARGO: "invalid-embargo",
  WINDOW_LARGER_THAN_DATASET: "window-larger-than-dataset",
  EMPTY_FOLDS: "empty-folds",
  DUPLICATE_MARKET: "duplicate-market",
  MISSING_MARKET_CLOSE_TIME: "missing-market-close-time",
  OVERLAPPING_FOLD_PARTITIONS: "overlapping-fold-partitions",
  OVERLAPPING_VALIDATION_WINDOWS: "overlapping-validation-windows",
  INVALID_GENERATED_AT: "invalid-generated-at",
} as const;

export type WalkForwardSplitErrorCode =
  (typeof WalkForwardSplitErrorCode)[keyof typeof WalkForwardSplitErrorCode];

export class WalkForwardSplitError extends Error {
  readonly code: WalkForwardSplitErrorCode;
  readonly marketTicker?: string;
  readonly registryPath?: string;

  constructor(
    message: string,
    code: WalkForwardSplitErrorCode,
    options?: { marketTicker?: string; registryPath?: string },
  ) {
    super(message);
    this.name = "WalkForwardSplitError";
    this.code = code;
    this.marketTicker = options?.marketTicker;
    this.registryPath = options?.registryPath;
  }
}
