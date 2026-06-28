import { isUtcIsoTimestamp } from "@/lib/data/timestamps";

import {
  BtcHistoricalBronzeProviderError,
  BtcHistoricalBronzeProviderErrorCode,
} from "./btcHistoricalBronzeProviderTypes";
import type {
  BtcHistoricalBar,
  BtcHistoricalBronzeProvider,
  BtcHistoricalBronzeProviderImportInput,
  CreateInMemoryBtcHistoricalBronzeProviderInput,
} from "./btcHistoricalBronzeProviderTypes";
import {
  mapBtcHistoricalBarToBronzeRecord,
  sortBtcBronzeRecords,
} from "./BtcKlineBronzeMapper";

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

function validateImportInput(input: BtcHistoricalBronzeProviderImportInput): void {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new BtcHistoricalBronzeProviderError(
      "input must be a plain object",
      BtcHistoricalBronzeProviderErrorCode.INVALID_INPUT,
    );
  }

  if (!input.marketTicker.trim()) {
    throw new BtcHistoricalBronzeProviderError(
      "marketTicker is required",
      BtcHistoricalBronzeProviderErrorCode.MISSING_TICKER,
    );
  }

  for (const [label, value] of [
    ["startTime", input.startTime],
    ["endTime", input.endTime],
    ["collectionTime", input.collectionTime],
    ["observedAt", input.observedAt],
  ] as const) {
    if (!isUtcIsoTimestamp(value)) {
      throw new BtcHistoricalBronzeProviderError(
        `${label} must be a valid UTC ISO-8601 instant with Z suffix`,
        BtcHistoricalBronzeProviderErrorCode.INVALID_TIMESTAMP,
      );
    }
  }

  if (Date.parse(input.startTime) >= Date.parse(input.endTime)) {
    throw new BtcHistoricalBronzeProviderError(
      "startTime must be before endTime",
      BtcHistoricalBronzeProviderErrorCode.INVALID_TIME_RANGE,
    );
  }
}

function barOverlapsWindow(
  bar: BtcHistoricalBar,
  startTime: string,
  endTime: string,
): boolean {
  return (
    Date.parse(bar.closeTime) > Date.parse(startTime) &&
    Date.parse(bar.openTime) < Date.parse(endTime)
  );
}

function cloneBar(bar: BtcHistoricalBar): BtcHistoricalBar {
  return { ...bar };
}

/** Creates a deterministic in-memory BTC historical bronze provider for tests. */
export function createInMemoryBtcHistoricalBronzeProvider(
  input: CreateInMemoryBtcHistoricalBronzeProviderInput,
): BtcHistoricalBronzeProvider {
  const bars = input.bars.map(cloneBar);

  return {
    importBtcKlineRecords(importInput) {
      validateImportInput(importInput);

      const filteredBars = bars
        .filter((bar) =>
          barOverlapsWindow(bar, importInput.startTime, importInput.endTime),
        )
        .sort((left, right) => left.openTime.localeCompare(right.openTime));

      const records = filteredBars.map((bar) =>
        mapBtcHistoricalBarToBronzeRecord({
          bar,
          marketTicker: importInput.marketTicker,
          collectionTime: importInput.collectionTime,
          observedAt: importInput.observedAt,
        }),
      );

      return deepFreeze(sortBtcBronzeRecords(records));
    },
  };
}
