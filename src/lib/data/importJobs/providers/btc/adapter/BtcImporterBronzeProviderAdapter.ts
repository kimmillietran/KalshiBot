import type { BtcHistoricalImporterBar } from "@/lib/data/importers/btc";
import { isUtcIsoTimestamp } from "@/lib/data/timestamps";

import type { BtcHistoricalBronzeProvider } from "../../../historicalBronzeImportJobTypes";
import type { HistoricalBronzeProviderImportInput } from "../../../historicalBronzeImportJobTypes";
import {
  BtcHistoricalBronzeProviderError,
  BtcHistoricalBronzeProviderErrorCode,
} from "../btcHistoricalBronzeProviderTypes";
import type { BtcHistoricalBar } from "../btcHistoricalBronzeProviderTypes";
import {
  mapBtcHistoricalBarToBronzeRecord,
  sortBtcBronzeRecords,
} from "../BtcKlineBronzeMapper";

import {
  BtcImporterBronzeProviderAdapterError,
  BtcImporterBronzeProviderAdapterErrorCode,
} from "./btcImporterProviderAdapterTypes";
import type { CreateBtcHistoricalBronzeProviderFromImporterInput } from "./btcImporterProviderAdapterTypes";

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

function validateImportInput(input: HistoricalBronzeProviderImportInput): void {
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

function resolveImporterBars(
  result: readonly BtcHistoricalImporterBar[] | Promise<readonly BtcHistoricalImporterBar[]>,
): readonly BtcHistoricalBar[] {
  if (result instanceof Promise) {
    throw new BtcImporterBronzeProviderAdapterError(
      "BtcHistoricalImporter.getHistoricalBars returned a Promise; prefetch bars before importBtcKlineRecords",
      BtcImporterBronzeProviderAdapterErrorCode.ASYNC_IMPORTER_RESULT,
    );
  }

  return result;
}

function mapBarsToBronzeRecords(
  bars: readonly BtcHistoricalBar[],
  input: HistoricalBronzeProviderImportInput,
) {
  const records = bars.map((bar) =>
    mapBtcHistoricalBarToBronzeRecord({
      bar,
      marketTicker: input.marketTicker,
      collectionTime: input.collectionTime,
      observedAt: input.observedAt,
    }),
  );

  return deepFreeze(sortBtcBronzeRecords(records));
}

/**
 * Adapts a BTC historical importer into the sync bronze provider contract
 * expected by {@link runHistoricalBronzeImportJob}.
 *
 * The importer must resolve bars synchronously from the adapter's perspective.
 * Async HTTP importers should be prefetched by the caller before import execution.
 */
export function createBtcHistoricalBronzeProviderFromImporter(
  config: CreateBtcHistoricalBronzeProviderFromImporterInput,
): BtcHistoricalBronzeProvider {
  const { importer, symbol, interval } = config;

  return Object.freeze({
    importBtcKlineRecords(input) {
      validateImportInput(input);

      const bars = resolveImporterBars(
        importer.getHistoricalBars({
          symbol,
          interval,
          startTime: input.startTime,
          endTime: input.endTime,
        }),
      );

      return mapBarsToBronzeRecords(bars, input);
    },
  });
}

export type { CreateBtcHistoricalBronzeProviderFromImporterInput } from "./btcImporterProviderAdapterTypes";
