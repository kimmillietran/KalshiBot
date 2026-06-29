import { DataSource } from "@/lib/data/provenance";
import { isUtcIsoTimestamp } from "@/lib/data/timestamps";

import {
  BtcHistoricalImporterError,
  BtcHistoricalImporterErrorCode,
  BtcHistoricalInterval,
} from "../btcHistoricalImporterTypes";
import type {
  BtcHistoricalImporter,
  BtcHistoricalImporterBar,
  GetHistoricalBarsInput,
} from "../btcHistoricalImporterTypes";

import type {
  CoinbaseHistoricalHttpClient,
  CreateCoinbaseHistoricalImporterInput,
} from "./coinbaseHistoricalImporterTypes";
import {
  COINBASE_HISTORICAL_PRODUCT_ID,
  COINBASE_INTERVAL_GRANULARITY,
  COINBASE_MAX_CANDLES_PER_REQUEST,
} from "./coinbaseHistoricalImporterTypes";

const SUPPORTED_INTERVALS = new Set<string>(Object.values(BtcHistoricalInterval));

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

function readTimestampSeconds(value: unknown, label: string): number {
  const parsed = readFiniteNumber(value, label);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new BtcHistoricalImporterError(
      `${label} must be a non-negative integer unix timestamp in seconds`,
      BtcHistoricalImporterErrorCode.MALFORMED_RESPONSE,
    );
  }

  return parsed;
}

function msToUtcIso(ms: number): string {
  return new Date(ms).toISOString();
}

function intervalToCloseTimeMs(openTimeMs: number, granularitySeconds: number): number {
  return openTimeMs + granularitySeconds * 1000 - 1;
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

function parseCoinbaseCandleRow(
  row: unknown,
  granularitySeconds: number,
): BtcHistoricalImporterBar {
  if (!Array.isArray(row) || row.length < 6) {
    throw new BtcHistoricalImporterError(
      "Coinbase candle row must be a [time, low, high, open, close, volume] array",
      BtcHistoricalImporterErrorCode.MALFORMED_RESPONSE,
    );
  }

  const openTimeMs = readTimestampSeconds(row[0], "candle time") * 1000;
  const lowUsd = readFiniteNumber(row[1], "candle low price");
  const highUsd = readFiniteNumber(row[2], "candle high price");
  const openUsd = readFiniteNumber(row[3], "candle open price");
  const closeUsd = readFiniteNumber(row[4], "candle close price");
  const volume = readFiniteNumber(row[5], "candle volume");

  const bar: BtcHistoricalImporterBar = {
    openTime: msToUtcIso(openTimeMs),
    closeTime: msToUtcIso(intervalToCloseTimeMs(openTimeMs, granularitySeconds)),
    openUsd,
    highUsd,
    lowUsd,
    closeUsd,
    volume,
    source: DataSource.COINBASE_SPOT,
  };

  validateBar(bar);
  return bar;
}

function parseCandlesResponse(
  body: unknown,
  granularitySeconds: number,
): BtcHistoricalImporterBar[] {
  if (body === null) {
    return [];
  }

  if (!Array.isArray(body)) {
    throw new BtcHistoricalImporterError(
      "Coinbase candles response must be an array",
      BtcHistoricalImporterErrorCode.MALFORMED_RESPONSE,
    );
  }

  if (body.length === 0) {
    return [];
  }

  return body.map((row) => parseCoinbaseCandleRow(row, granularitySeconds));
}

function sortBars(bars: readonly BtcHistoricalImporterBar[]): BtcHistoricalImporterBar[] {
  return [...bars].sort((left, right) => left.openTime.localeCompare(right.openTime));
}

function dedupeBars(bars: readonly BtcHistoricalImporterBar[]): BtcHistoricalImporterBar[] {
  const byOpenTime = new Map<string, BtcHistoricalImporterBar>();

  for (const bar of bars) {
    byOpenTime.set(bar.openTime, bar);
  }

  return sortBars([...byOpenTime.values()]);
}

function filterBarsToWindow(
  bars: readonly BtcHistoricalImporterBar[],
  startTime: string,
  endTime: string,
): BtcHistoricalImporterBar[] {
  const startMs = Date.parse(startTime);
  const endMs = Date.parse(endTime);

  return bars.filter((bar) => {
    const openMs = Date.parse(bar.openTime);
    return openMs >= startMs && openMs < endMs;
  });
}

function buildRequestChunks(
  startMs: number,
  endMs: number,
  granularitySeconds: number,
): Array<{ startMs: number; endMs: number }> {
  const chunkDurationMs = COINBASE_MAX_CANDLES_PER_REQUEST * granularitySeconds * 1000;
  const chunks: Array<{ startMs: number; endMs: number }> = [];
  let cursor = startMs;

  while (cursor < endMs) {
    const chunkEnd = Math.min(cursor + chunkDurationMs, endMs);
    chunks.push({ startMs: cursor, endMs: chunkEnd });
    cursor = chunkEnd;
  }

  return chunks;
}

async function fetchBarsForWindow(
  httpClient: CoinbaseHistoricalHttpClient,
  input: GetHistoricalBarsInput,
  granularitySeconds: number,
): Promise<BtcHistoricalImporterBar[]> {
  const startMs = Date.parse(input.startTime);
  const endMs = Date.parse(input.endTime);
  const chunks = buildRequestChunks(startMs, endMs, granularitySeconds);
  const merged: BtcHistoricalImporterBar[] = [];

  for (const chunk of chunks) {
    const body = await httpClient.fetchCandles({
      productId: COINBASE_HISTORICAL_PRODUCT_ID,
      granularity: granularitySeconds,
      startTime: msToUtcIso(chunk.startMs),
      endTime: msToUtcIso(chunk.endMs),
    });

    merged.push(...parseCandlesResponse(body, granularitySeconds));
  }

  return dedupeBars(filterBarsToWindow(merged, input.startTime, input.endTime));
}

/** Creates a Coinbase Exchange historical BTC importer backed by an injectable HTTP client. */
export function createCoinbaseHistoricalImporter(
  config: CreateCoinbaseHistoricalImporterInput,
): BtcHistoricalImporter {
  const httpClient = config.httpClient;

  return {
    async getHistoricalBars(input) {
      validateGetHistoricalBarsInput(input);

      const granularitySeconds = COINBASE_INTERVAL_GRANULARITY[input.interval];
      const bars = await fetchBarsForWindow(httpClient, input, granularitySeconds);

      return deepFreeze(bars.map((bar) => deepFreeze({ ...bar })));
    },
  };
}

export type { CreateCoinbaseHistoricalImporterInput } from "./coinbaseHistoricalImporterTypes";
