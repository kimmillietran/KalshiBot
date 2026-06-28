import { DataSource, type FetchProvenance } from "@/lib/data/provenance";
import { isUtcIsoTimestamp } from "@/lib/data/timestamps";

import {
  BtcHistoricalImporterError,
  BtcHistoricalImporterErrorCode,
  BtcHistoricalInterval,
} from "./btcHistoricalImporterTypes";
import type {
  BtcHistoricalHttpClient,
  BtcHistoricalHttpFetchKlinesInput,
  BtcHistoricalImporter,
  BtcHistoricalImporterBar,
  CreateBtcHistoricalImporterInput,
  GetHistoricalBarsInput,
} from "./btcHistoricalImporterTypes";

const SUPPORTED_INTERVALS = new Set<string>(Object.values(BtcHistoricalInterval));
const SUPPORTED_SOURCES = new Set<FetchProvenance["source"]>([
  DataSource.BINANCE_SPOT,
  DataSource.COINBASE_SPOT,
]);

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

function validateSource(source: FetchProvenance["source"]): void {
  if (!SUPPORTED_SOURCES.has(source)) {
    throw new BtcHistoricalImporterError(
      "source must be a supported BTC data source",
      BtcHistoricalImporterErrorCode.UNSUPPORTED_SOURCE,
    );
  }
}

function validateUtcTimestamp(value: string, label: string): void {
  if (!isUtcIsoTimestamp(value)) {
    throw new BtcHistoricalImporterError(
      `${label} must be a valid UTC ISO-8601 instant with Z suffix`,
      BtcHistoricalImporterErrorCode.INVALID_TIMESTAMP,
    );
  }
}

function validateGetHistoricalBarsInput(input: GetHistoricalBarsInput): void {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new BtcHistoricalImporterError(
      "input must be a plain object",
      BtcHistoricalImporterErrorCode.INVALID_INPUT,
    );
  }

  if (!input.symbol.trim()) {
    throw new BtcHistoricalImporterError(
      "symbol is required",
      BtcHistoricalImporterErrorCode.INVALID_SYMBOL,
    );
  }

  if (!SUPPORTED_INTERVALS.has(input.interval)) {
    throw new BtcHistoricalImporterError(
      "interval must be a supported BTC historical interval",
      BtcHistoricalImporterErrorCode.INVALID_INTERVAL,
    );
  }

  validateUtcTimestamp(input.startTime, "startTime");
  validateUtcTimestamp(input.endTime, "endTime");

  if (Date.parse(input.startTime) >= Date.parse(input.endTime)) {
    throw new BtcHistoricalImporterError(
      "startTime must be before endTime",
      BtcHistoricalImporterErrorCode.INVALID_TIME_RANGE,
    );
  }
}

function readFiniteNumber(value: unknown, label: string): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(parsed)) {
    throw new BtcHistoricalImporterError(
      `${label} must be a finite number`,
      BtcHistoricalImporterErrorCode.MALFORMED_RESPONSE,
    );
  }

  return parsed;
}

function readTimestampMs(value: unknown, label: string): number {
  const parsed = readFiniteNumber(value, label);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new BtcHistoricalImporterError(
      `${label} must be a non-negative integer millisecond timestamp`,
      BtcHistoricalImporterErrorCode.MALFORMED_RESPONSE,
    );
  }

  return parsed;
}

function msToUtcIso(ms: number): string {
  return new Date(ms).toISOString();
}

function validateOhlc(bar: Pick<
  BtcHistoricalImporterBar,
  "openUsd" | "highUsd" | "lowUsd" | "closeUsd"
>): void {
  const { openUsd, highUsd, lowUsd, closeUsd } = bar;
  const values = [openUsd, highUsd, lowUsd, closeUsd];

  if (values.some((value) => value <= 0)) {
    throw new BtcHistoricalImporterError(
      "BTC OHLC prices must be positive",
      BtcHistoricalImporterErrorCode.NEGATIVE_PRICE,
    );
  }

  if (highUsd < lowUsd) {
    throw new BtcHistoricalImporterError(
      "highUsd must be greater than or equal to lowUsd",
      BtcHistoricalImporterErrorCode.INVALID_OHLC,
    );
  }

  if (highUsd < openUsd || highUsd < closeUsd) {
    throw new BtcHistoricalImporterError(
      "highUsd must be greater than or equal to openUsd and closeUsd",
      BtcHistoricalImporterErrorCode.INVALID_OHLC,
    );
  }

  if (lowUsd > openUsd || lowUsd > closeUsd) {
    throw new BtcHistoricalImporterError(
      "lowUsd must be less than or equal to openUsd and closeUsd",
      BtcHistoricalImporterErrorCode.INVALID_OHLC,
    );
  }
}

function validateBar(bar: BtcHistoricalImporterBar): void {
  validateUtcTimestamp(bar.openTime, "openTime");
  validateUtcTimestamp(bar.closeTime, "closeTime");

  if (Date.parse(bar.openTime) >= Date.parse(bar.closeTime)) {
    throw new BtcHistoricalImporterError(
      "openTime must be before closeTime",
      BtcHistoricalImporterErrorCode.INVALID_TIME_RANGE,
    );
  }

  validateOhlc(bar);

  if (bar.volume < 0) {
    throw new BtcHistoricalImporterError(
      "volume must be non-negative",
      BtcHistoricalImporterErrorCode.INVALID_VOLUME,
    );
  }
}

function parseBinanceKlineRow(
  row: unknown,
  source: FetchProvenance["source"],
): BtcHistoricalImporterBar {
  if (!Array.isArray(row) || row.length < 7) {
    throw new BtcHistoricalImporterError(
      "BTC kline row must be a Binance-compatible array",
      BtcHistoricalImporterErrorCode.MALFORMED_RESPONSE,
    );
  }

  const openTimeMs = readTimestampMs(row[0], "kline open time");
  const openUsd = readFiniteNumber(row[1], "kline open price");
  const highUsd = readFiniteNumber(row[2], "kline high price");
  const lowUsd = readFiniteNumber(row[3], "kline low price");
  const closeUsd = readFiniteNumber(row[4], "kline close price");
  const volume = readFiniteNumber(row[5], "kline volume");
  const closeTimeMs = readTimestampMs(row[6], "kline close time");

  const bar: BtcHistoricalImporterBar = {
    openTime: msToUtcIso(openTimeMs),
    closeTime: msToUtcIso(closeTimeMs),
    openUsd,
    highUsd,
    lowUsd,
    closeUsd,
    volume,
    source,
  };

  validateBar(bar);
  return bar;
}

function parseKlinesResponse(
  body: unknown,
  source: FetchProvenance["source"],
): BtcHistoricalImporterBar[] {
  if (body === null) {
    return [];
  }

  if (!Array.isArray(body)) {
    throw new BtcHistoricalImporterError(
      "BTC klines response must be an array",
      BtcHistoricalImporterErrorCode.MALFORMED_RESPONSE,
    );
  }

  if (body.length === 0) {
    return [];
  }

  return body.map((row) => parseBinanceKlineRow(row, source));
}

function sortBars(bars: readonly BtcHistoricalImporterBar[]): BtcHistoricalImporterBar[] {
  return [...bars].sort((left, right) => left.openTime.localeCompare(right.openTime));
}

function toFetchInput(input: GetHistoricalBarsInput): BtcHistoricalHttpFetchKlinesInput {
  return {
    symbol: input.symbol.trim(),
    interval: input.interval,
    startTimeMs: Date.parse(input.startTime),
    endTimeMs: Date.parse(input.endTime),
  };
}

/** Creates a BTC historical importer backed by an injectable HTTP client. */
export function createBtcHistoricalImporter(
  config: CreateBtcHistoricalImporterInput,
): BtcHistoricalImporter {
  validateSource(config.source);

  const httpClient: BtcHistoricalHttpClient = config.httpClient;
  const source = config.source;

  return {
    async getHistoricalBars(input) {
      validateGetHistoricalBarsInput(input);

      const body = await httpClient.fetchKlines(toFetchInput(input));
      const bars = sortBars(parseKlinesResponse(body, source));

      return deepFreeze(bars.map((bar) => deepFreeze({ ...bar })));
    },
  };
}
