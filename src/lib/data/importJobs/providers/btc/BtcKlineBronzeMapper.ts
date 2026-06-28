import { DATASET_BRONZE_CONTENT_TYPE } from "@/lib/data/datasets/datasetTypes";
import { DataSource, type FetchProvenance } from "@/lib/data/provenance";
import { isUtcIsoTimestamp } from "@/lib/data/timestamps";
import type {
  CollectionTime,
  EventTime,
  ObservedAt,
} from "@/lib/data/timestamps";
import type { RawHistoricalRecord } from "@/lib/data/types";
import { fnv1a32, stableStringify } from "@/lib/trading/config/hashConfig";

import {
  BtcHistoricalBronzeProviderError,
  BtcHistoricalBronzeProviderErrorCode,
} from "./btcHistoricalBronzeProviderTypes";
import type {
  BtcHistoricalBar,
  MapBtcHistoricalBarToBronzeRecordInput,
} from "./btcHistoricalBronzeProviderTypes";

const SUPPORTED_BTC_SOURCES = new Set<FetchProvenance["source"]>([
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

function validateUtcTimestamp(value: string, label: string): void {
  if (!isUtcIsoTimestamp(value)) {
    throw new BtcHistoricalBronzeProviderError(
      `${label} must be a valid UTC ISO-8601 instant with Z suffix`,
      BtcHistoricalBronzeProviderErrorCode.INVALID_TIMESTAMP,
    );
  }
}

function validateNonEmptyTicker(ticker: string): void {
  if (!ticker.trim()) {
    throw new BtcHistoricalBronzeProviderError(
      "marketTicker is required",
      BtcHistoricalBronzeProviderErrorCode.MISSING_TICKER,
    );
  }
}

function validateSource(source: FetchProvenance["source"]): void {
  if (!SUPPORTED_BTC_SOURCES.has(source)) {
    throw new BtcHistoricalBronzeProviderError(
      "bar.source must be a supported BTC data source",
      BtcHistoricalBronzeProviderErrorCode.MISSING_SOURCE,
    );
  }
}

function validateOhlc(bar: BtcHistoricalBar): void {
  const { openUsd, highUsd, lowUsd, closeUsd } = bar;
  const values = [openUsd, highUsd, lowUsd, closeUsd];

  if (values.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new BtcHistoricalBronzeProviderError(
      "BTC OHLC prices must be positive finite numbers",
      BtcHistoricalBronzeProviderErrorCode.NEGATIVE_PRICE,
    );
  }

  if (highUsd < lowUsd) {
    throw new BtcHistoricalBronzeProviderError(
      "highUsd must be greater than or equal to lowUsd",
      BtcHistoricalBronzeProviderErrorCode.INVALID_OHLC,
    );
  }

  if (highUsd < openUsd || highUsd < closeUsd) {
    throw new BtcHistoricalBronzeProviderError(
      "highUsd must be greater than or equal to openUsd and closeUsd",
      BtcHistoricalBronzeProviderErrorCode.INVALID_OHLC,
    );
  }

  if (lowUsd > openUsd || lowUsd > closeUsd) {
    throw new BtcHistoricalBronzeProviderError(
      "lowUsd must be less than or equal to openUsd and closeUsd",
      BtcHistoricalBronzeProviderErrorCode.INVALID_OHLC,
    );
  }
}

function validateBar(bar: BtcHistoricalBar): void {
  validateUtcTimestamp(bar.openTime, "bar.openTime");
  validateUtcTimestamp(bar.closeTime, "bar.closeTime");

  if (Date.parse(bar.openTime) >= Date.parse(bar.closeTime)) {
    throw new BtcHistoricalBronzeProviderError(
      "bar.openTime must be before bar.closeTime",
      BtcHistoricalBronzeProviderErrorCode.INVALID_TIME_RANGE,
    );
  }

  validateSource(bar.source);
  validateOhlc(bar);

  if (!Number.isFinite(bar.volume) || bar.volume < 0) {
    throw new BtcHistoricalBronzeProviderError(
      "bar.volume must be a non-negative finite number",
      BtcHistoricalBronzeProviderErrorCode.INVALID_VOLUME,
    );
  }
}

function buildRecordId(
  ticker: string,
  eventTime: string,
  payload: Record<string, unknown>,
): string {
  const digest = fnv1a32(
    stableStringify({
      contentType: DATASET_BRONZE_CONTENT_TYPE.BTC_KLINE,
      ticker,
      eventTime,
      payload,
    }),
  );

  return `btc-bronze-${digest}`;
}

function buildPayload(bar: BtcHistoricalBar): Record<string, unknown> {
  return {
    open_time: bar.openTime,
    close_time: bar.closeTime,
    open_usd: bar.openUsd,
    high_usd: bar.highUsd,
    low_usd: bar.lowUsd,
    close_usd: bar.closeUsd,
    volume_btc: bar.volume,
  };
}

/** Maps a normalized BTC historical bar into a bronze kline record. */
export function mapBtcHistoricalBarToBronzeRecord(
  input: MapBtcHistoricalBarToBronzeRecordInput,
): RawHistoricalRecord {
  validateNonEmptyTicker(input.marketTicker);
  validateUtcTimestamp(input.collectionTime, "collectionTime");
  validateUtcTimestamp(input.observedAt, "observedAt");
  validateBar(input.bar);

  const marketTicker = input.marketTicker.trim();
  const payload = buildPayload(input.bar);
  const eventTime = input.bar.closeTime as EventTime;

  const record: RawHistoricalRecord = {
    recordId: buildRecordId(marketTicker, eventTime, payload),
    ticker: marketTicker,
    contentType: DATASET_BRONZE_CONTENT_TYPE.BTC_KLINE,
    eventTime,
    collectionTime: input.collectionTime as CollectionTime,
    observedAt: input.observedAt as ObservedAt,
    payload,
    provenance: {
      source: input.bar.source,
      collectionTime: input.collectionTime as CollectionTime,
      observedAt: input.observedAt as ObservedAt,
      fetchId: `btc-import-${marketTicker}-${eventTime}`,
    },
  };

  return deepFreeze(record);
}

export function compareBtcBronzeRecords(
  left: RawHistoricalRecord,
  right: RawHistoricalRecord,
): number {
  const byEventTime = left.eventTime.localeCompare(right.eventTime);
  if (byEventTime !== 0) {
    return byEventTime;
  }

  const byCollectionTime = left.collectionTime.localeCompare(right.collectionTime);
  if (byCollectionTime !== 0) {
    return byCollectionTime;
  }

  const byTicker = left.ticker.localeCompare(right.ticker);
  if (byTicker !== 0) {
    return byTicker;
  }

  return left.recordId.localeCompare(right.recordId);
}

export function sortBtcBronzeRecords(
  records: readonly RawHistoricalRecord[],
): RawHistoricalRecord[] {
  return [...records].sort(compareBtcBronzeRecords);
}

export function serializeBtcBronzeRecords(
  records: readonly RawHistoricalRecord[],
): string {
  return stableStringify(records);
}

export { validateBar as validateBtcHistoricalBar };
