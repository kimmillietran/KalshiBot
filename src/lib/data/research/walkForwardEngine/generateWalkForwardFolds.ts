import { WalkForwardSplitError, WalkForwardSplitErrorCode } from "./walkForwardSplitErrors";
import type {
  WalkForwardFold,
  WalkForwardMarketRef,
  WalkForwardRegistryMarket,
  WalkForwardSplitDefinition,
} from "./walkForwardSplitTypes";

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

function compareMarkets(
  left: WalkForwardRegistryMarket,
  right: WalkForwardRegistryMarket,
): number {
  const byCloseTime = left.marketCloseTime.localeCompare(right.marketCloseTime);
  if (byCloseTime !== 0) {
    return byCloseTime;
  }

  const bySeries = left.seriesTicker.localeCompare(right.seriesTicker);
  if (bySeries !== 0) {
    return bySeries;
  }

  return left.marketTicker.localeCompare(right.marketTicker);
}

function toMarketRef(
  market: WalkForwardRegistryMarket,
  orderedIndex: number,
): WalkForwardMarketRef {
  return deepFreeze({
    seriesTicker: market.seriesTicker,
    marketTicker: market.marketTicker,
    marketCloseTime: market.marketCloseTime,
    fixturePath: market.fixturePath,
    registryPath: market.registryPath,
    orderedIndex,
  });
}

export function orderWalkForwardMarkets(
  markets: readonly WalkForwardRegistryMarket[],
): readonly WalkForwardRegistryMarket[] {
  if (markets.length === 0) {
    throw new WalkForwardSplitError(
      "Walk-forward split requires at least one market",
      WalkForwardSplitErrorCode.EMPTY_DATASET,
    );
  }

  const seen = new Map<string, WalkForwardRegistryMarket>();

  for (const market of markets) {
    const key = `${market.seriesTicker}::${market.marketTicker}`;
    if (seen.has(key)) {
      throw new WalkForwardSplitError(
        `Duplicate market ticker in walk-forward dataset: ${market.marketTicker}`,
        WalkForwardSplitErrorCode.DUPLICATE_MARKET,
        { marketTicker: market.marketTicker, registryPath: market.registryPath },
      );
    }

    if (!market.marketCloseTime.trim()) {
      throw new WalkForwardSplitError(
        `Market ${market.marketTicker} is missing marketCloseTime for time-based splitting`,
        WalkForwardSplitErrorCode.MISSING_MARKET_CLOSE_TIME,
        { marketTicker: market.marketTicker, registryPath: market.registryPath },
      );
    }

    seen.set(key, market);
  }

  return Object.freeze([...markets].sort(compareMarkets));
}

export function validateWalkForwardSplitDefinition(
  config: WalkForwardSplitDefinition,
  marketCount: number,
): void {
  if (!config.splitId.trim()) {
    throw new WalkForwardSplitError(
      "splitId must be a non-empty string",
      WalkForwardSplitErrorCode.INVALID_SPLIT_ID,
    );
  }

  if (
    !Number.isInteger(config.trainingWindowSize)
    || !Number.isInteger(config.validationWindowSize)
    || config.trainingWindowSize <= 0
    || config.validationWindowSize <= 0
  ) {
    throw new WalkForwardSplitError(
      "trainingWindowSize and validationWindowSize must be positive integers",
      WalkForwardSplitErrorCode.INVALID_WINDOW_SIZE,
    );
  }

  if (!Number.isInteger(config.stepSize) || config.stepSize <= 0) {
    throw new WalkForwardSplitError(
      "stepSize must be a positive integer",
      WalkForwardSplitErrorCode.INVALID_STEP_SIZE,
    );
  }

  if (
    !Number.isInteger(config.embargoMarketCount)
    || config.embargoMarketCount < 0
  ) {
    throw new WalkForwardSplitError(
      "embargoMarketCount must be a non-negative integer",
      WalkForwardSplitErrorCode.INVALID_EMBARGO,
    );
  }

  const minimumMarkets =
    config.trainingWindowSize
    + config.embargoMarketCount
    + config.validationWindowSize;

  if (minimumMarkets > marketCount) {
    throw new WalkForwardSplitError(
      "trainingWindowSize plus embargoMarketCount plus validationWindowSize exceeds market count",
      WalkForwardSplitErrorCode.WINDOW_LARGER_THAN_DATASET,
    );
  }
}

function assertFoldPartitionsDoNotOverlap(fold: WalkForwardFold): void {
  const trainingKeys = new Set(
    fold.trainingMarkets.map((market) => `${market.seriesTicker}::${market.marketTicker}`),
  );

  for (const market of fold.validationMarkets) {
    const key = `${market.seriesTicker}::${market.marketTicker}`;
    if (trainingKeys.has(key)) {
      throw new WalkForwardSplitError(
        `Fold ${fold.foldIndex} contains overlapping train and validation markets`,
        WalkForwardSplitErrorCode.OVERLAPPING_FOLD_PARTITIONS,
        { marketTicker: market.marketTicker },
      );
    }
  }
}

function assertValidationWindowsDoNotOverlap(folds: readonly WalkForwardFold[]): void {
  for (let leftIndex = 0; leftIndex < folds.length; leftIndex += 1) {
    const left = folds[leftIndex];
    if (!left) {
      continue;
    }

    const leftStart = left.metadata.validationStartIndex;
    const leftEnd = left.metadata.validationEndIndex;

    for (let rightIndex = leftIndex + 1; rightIndex < folds.length; rightIndex += 1) {
      const right = folds[rightIndex];
      if (!right) {
        continue;
      }

      const rightStart = right.metadata.validationStartIndex;
      const rightEnd = right.metadata.validationEndIndex;
      const overlaps = leftStart <= rightEnd && rightStart <= leftEnd;

      if (overlaps) {
        throw new WalkForwardSplitError(
          "Validation windows overlap across folds while allowOverlappingValidationWindows is false",
          WalkForwardSplitErrorCode.OVERLAPPING_VALIDATION_WINDOWS,
        );
      }
    }
  }
}

/** Deterministic rolling walk-forward folds ordered by market close time. */
export function generateWalkForwardFolds(
  markets: readonly WalkForwardRegistryMarket[],
  config: WalkForwardSplitDefinition,
): readonly WalkForwardFold[] {
  const orderedMarkets = orderWalkForwardMarkets(markets);
  validateWalkForwardSplitDefinition(config, orderedMarkets.length);

  const folds: WalkForwardFold[] = [];

  for (let foldIndex = 0; ; foldIndex += 1) {
    const trainingStartIndex = foldIndex * config.stepSize;
    const trainingEndIndex = trainingStartIndex + config.trainingWindowSize - 1;
    const validationStartIndex =
      trainingEndIndex + 1 + config.embargoMarketCount;
    const validationEndIndex =
      validationStartIndex + config.validationWindowSize - 1;

    if (validationEndIndex >= orderedMarkets.length) {
      break;
    }

    const trainingMarkets = orderedMarkets
      .slice(trainingStartIndex, trainingEndIndex + 1)
      .map((market, offset) => toMarketRef(market, trainingStartIndex + offset));
    const validationMarkets = orderedMarkets
      .slice(validationStartIndex, validationEndIndex + 1)
      .map((market, offset) => toMarketRef(market, validationStartIndex + offset));

    const firstTraining = trainingMarkets[0];
    const lastTraining = trainingMarkets[trainingMarkets.length - 1];
    const firstValidation = validationMarkets[0];
    const lastValidation = validationMarkets[validationMarkets.length - 1];

    if (!firstTraining || !lastTraining || !firstValidation || !lastValidation) {
      throw new WalkForwardSplitError(
        `Fold ${foldIndex} produced empty train or validation partitions`,
        WalkForwardSplitErrorCode.EMPTY_FOLDS,
      );
    }

    const fold = deepFreeze({
      foldIndex,
      splitId: config.splitId,
      trainingMarkets: Object.freeze([...trainingMarkets]),
      validationMarkets: Object.freeze([...validationMarkets]),
      metadata: deepFreeze({
        trainingWindowSize: config.trainingWindowSize,
        validationWindowSize: config.validationWindowSize,
        stepSize: config.stepSize,
        embargoMarketCount: config.embargoMarketCount,
        trainingStartIndex,
        trainingEndIndex,
        validationStartIndex,
        validationEndIndex,
        trainingStartCloseTime: firstTraining.marketCloseTime,
        trainingEndCloseTime: lastTraining.marketCloseTime,
        validationStartCloseTime: firstValidation.marketCloseTime,
        validationEndCloseTime: lastValidation.marketCloseTime,
      }),
    });

    assertFoldPartitionsDoNotOverlap(fold);
    folds.push(fold);
  }

  if (folds.length === 0) {
    throw new WalkForwardSplitError(
      "Walk-forward split produced zero folds",
      WalkForwardSplitErrorCode.EMPTY_FOLDS,
    );
  }

  if (!config.allowOverlappingValidationWindows) {
    assertValidationWindowsDoNotOverlap(folds);
  }

  return Object.freeze(folds);
}
