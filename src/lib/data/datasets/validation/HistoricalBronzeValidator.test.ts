import { describe, expect, it } from "vitest";

import { serializeBronzeRecord } from "@/lib/data/bronze";
import { DataSource } from "@/lib/data/provenance";
import { SILVER_BRONZE_CONTENT_TYPE } from "@/lib/data/silver";
import type { RawHistoricalRecord } from "@/lib/data/types";

import { DATASET_BRONZE_CONTENT_TYPE } from "../datasetTypes";
import {
  HistoricalBronzeValidationErrorCode,
} from "./historicalBronzeValidationTypes";
import {
  serializeHistoricalBronzeValidation,
  validateHistoricalBronzeDataset,
} from "./HistoricalBronzeValidator";

const COLLECTION_TIME = "2026-06-27T01:00:00.000Z";
const OBSERVED_AT = "2026-06-27T01:00:05.000Z";

function baseBronze(
  contentType: string,
  payload: Record<string, unknown>,
  options: {
    recordId: string;
    ticker: string;
    eventTime: string;
    source?: (typeof DataSource)[keyof typeof DataSource];
  },
): RawHistoricalRecord {
  return {
    recordId: options.recordId,
    ticker: options.ticker,
    contentType,
    eventTime: options.eventTime,
    collectionTime: COLLECTION_TIME,
    observedAt: OBSERVED_AT,
    payload,
    provenance: {
      source: options.source ?? DataSource.KALSHI_REST,
      collectionTime: COLLECTION_TIME,
      observedAt: OBSERVED_AT,
      fetchId: `fetch-${options.recordId}`,
    },
  };
}

function marketBronze(
  ticker: string,
  recordId: string,
  eventTime: string,
  windowClose: string,
): RawHistoricalRecord {
  return baseBronze(
    SILVER_BRONZE_CONTENT_TYPE.MARKET,
    {
      open_time: eventTime,
      close_time: windowClose,
      floor_strike: 59_990.31,
      event_ticker: `${ticker.split("-")[0]}-EVENT`,
      status: "closed",
    },
    { recordId, ticker, eventTime },
  );
}

function candleBronze(
  ticker: string,
  recordId: string,
  openTime: string,
  closeTime: string,
): RawHistoricalRecord {
  return baseBronze(
    SILVER_BRONZE_CONTENT_TYPE.CANDLESTICK,
    {
      open_time: openTime,
      close_time: closeTime,
      yes_bid_cents: 48,
      yes_ask_cents: 52,
      no_bid_cents: 47,
      no_ask_cents: 51,
      volume_contracts: 120,
    },
    {
      recordId,
      ticker,
      eventTime: closeTime,
      source: DataSource.KALSHI_CANDLES,
    },
  );
}

function btcBronze(
  ticker: string,
  recordId: string,
  openTime: string,
  closeTime: string,
  overrides: Record<string, unknown> = {},
): RawHistoricalRecord {
  return baseBronze(
    DATASET_BRONZE_CONTENT_TYPE.BTC_KLINE,
    {
      open_time: openTime,
      close_time: closeTime,
      open_usd: 59_980.5,
      high_usd: 60_010.25,
      low_usd: 59_960.0,
      close_usd: 59_995.75,
      volume_btc: 12.5,
      ...overrides,
    },
    {
      recordId,
      ticker,
      eventTime: closeTime,
      source: DataSource.BINANCE_SPOT,
    },
  );
}

function settlementBronze(
  ticker: string,
  recordId: string,
  eventTime: string,
  windowClose: string,
): RawHistoricalRecord {
  return baseBronze(
    SILVER_BRONZE_CONTENT_TYPE.SETTLEMENT,
    {
      floor_strike: 59_990.31,
      expiration_value: "60010.25",
      result: "yes",
      settlement_ts: windowClose,
    },
    { recordId, ticker, eventTime },
  );
}

function completeMarketRecords(
  ticker: string,
  eventTime: string,
  windowClose: string,
  idPrefix: string,
): RawHistoricalRecord[] {
  const openTime = eventTime;
  const closeTime = new Date(Date.parse(eventTime) + 60_000).toISOString();

  return [
    marketBronze(ticker, `${idPrefix}-market`, eventTime, windowClose),
    candleBronze(ticker, `${idPrefix}-candle`, openTime, closeTime),
    btcBronze(ticker, `${idPrefix}-btc`, openTime, closeTime),
    settlementBronze(ticker, `${idPrefix}-settlement`, eventTime, windowClose),
  ];
}

describe("validateHistoricalBronzeDataset", () => {
  it("accepts a valid complete market dataset", () => {
    const records = completeMarketRecords(
      "KXBTC15M-VALID",
      "2026-06-26T23:15:00.000Z",
      "2026-06-26T23:30:00.000Z",
      "valid",
    );

    const result = validateHistoricalBronzeDataset(records);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.statistics.totalRecords).toBe(4);
    expect(result.statistics.marketCount).toBe(1);
    expect(result.statistics.btcBarCount).toBe(1);
    expect(result.statistics.settlementCount).toBe(1);
  });

  it("detects duplicate record ids", () => {
    const records = completeMarketRecords(
      "KXBTC15M-DUP-ID",
      "2026-06-26T23:15:00.000Z",
      "2026-06-26T23:30:00.000Z",
      "dup-id",
    );
    records.push({ ...records[1]!, recordId: records[1]!.recordId });

    const result = validateHistoricalBronzeDataset(records);

    expect(result.valid).toBe(false);
    expect(result.errors.some(
      (issue) => issue.errorCode === HistoricalBronzeValidationErrorCode.DUPLICATE_RECORD_ID,
    )).toBe(true);
    expect(result.statistics.duplicateCount).toBeGreaterThan(0);
  });

  it("detects duplicate settlements for the same ticker", () => {
    const ticker = "KXBTC15M-DUP-SETTLE";
    const records = completeMarketRecords(
      ticker,
      "2026-06-26T23:15:00.000Z",
      "2026-06-26T23:30:00.000Z",
      "dup-settle",
    );
    records.push(
      settlementBronze(
        ticker,
        "dup-settle-settlement-2",
        "2026-06-26T23:15:00.000Z",
        "2026-06-26T23:30:00.000Z",
      ),
    );

    const result = validateHistoricalBronzeDataset(records);

    expect(result.valid).toBe(false);
    expect(result.errors.some(
      (issue) =>
        issue.errorCode === HistoricalBronzeValidationErrorCode.DUPLICATE_SETTLEMENT,
    )).toBe(true);
  });

  it("detects duplicate BTC bars for the same ticker and interval", () => {
    const ticker = "KXBTC15M-DUP-BTC";
    const openTime = "2026-06-26T23:15:00.000Z";
    const closeTime = "2026-06-26T23:16:00.000Z";
    const records = completeMarketRecords(
      ticker,
      openTime,
      "2026-06-26T23:30:00.000Z",
      "dup-btc",
    );
    records.push(btcBronze(ticker, "dup-btc-btc-copy", openTime, closeTime));

    const result = validateHistoricalBronzeDataset(records);

    expect(result.valid).toBe(false);
    expect(result.errors.some(
      (issue) => issue.errorCode === HistoricalBronzeValidationErrorCode.DUPLICATE_BTC_BAR,
    )).toBe(true);
  });

  it("detects malformed records and unsupported content types", () => {
    const malformed = {
      ...completeMarketRecords(
        "KXBTC15M-MALFORMED",
        "2026-06-26T23:15:00.000Z",
        "2026-06-26T23:30:00.000Z",
        "malformed",
      )[0]!,
      payload: null,
    } as unknown as RawHistoricalRecord;

    const unsupported = baseBronze(
      "unknown.content.type",
      {},
      {
        recordId: "unsupported-1",
        ticker: "KXBTC15M-UNSUPPORTED",
        eventTime: "2026-06-26T23:15:00.000Z",
      },
    );

    const result = validateHistoricalBronzeDataset([malformed, unsupported]);

    expect(result.valid).toBe(false);
    expect(result.errors.some(
      (issue) => issue.errorCode === HistoricalBronzeValidationErrorCode.MALFORMED_PAYLOAD,
    )).toBe(true);
    expect(result.errors.some(
      (issue) =>
        issue.errorCode === HistoricalBronzeValidationErrorCode.UNSUPPORTED_CONTENT_TYPE,
    )).toBe(true);
  });

  it("detects incomplete market groups", () => {
    const ticker = "KXBTC15M-INCOMPLETE";
    const records = [
      marketBronze(
        ticker,
        "incomplete-market",
        "2026-06-26T23:15:00.000Z",
        "2026-06-26T23:30:00.000Z",
      ),
      candleBronze(
        ticker,
        "incomplete-candle",
        "2026-06-26T23:15:00.000Z",
        "2026-06-26T23:16:00.000Z",
      ),
    ];

    const result = validateHistoricalBronzeDataset(records);

    expect(result.valid).toBe(false);
    expect(result.errors.some(
      (issue) =>
        issue.errorCode === HistoricalBronzeValidationErrorCode.INCOMPLETE_MARKET_GROUP,
    )).toBe(true);
  });

  it("detects orphan settlement records", () => {
    const result = validateHistoricalBronzeDataset([
      settlementBronze(
        "KXBTC15M-ORPHAN-SETTLE",
        "orphan-settlement",
        "2026-06-26T23:15:00.000Z",
        "2026-06-26T23:30:00.000Z",
      ),
    ]);

    expect(result.valid).toBe(false);
    expect(result.errors.some(
      (issue) => issue.errorCode === HistoricalBronzeValidationErrorCode.ORPHAN_SETTLEMENT,
    )).toBe(true);
  });

  it("detects orphan BTC history records", () => {
    const result = validateHistoricalBronzeDataset([
      btcBronze(
        "KXBTC15M-ORPHAN-BTC",
        "orphan-btc",
        "2026-06-26T23:15:00.000Z",
        "2026-06-26T23:16:00.000Z",
      ),
    ]);

    expect(result.valid).toBe(false);
    expect(result.errors.some(
      (issue) => issue.errorCode === HistoricalBronzeValidationErrorCode.ORPHAN_BTC_HISTORY,
    )).toBe(true);
  });

  it("sorts validation issues deterministically", () => {
    const records = [
      settlementBronze(
        "KXBTC15M-Z",
        "issue-z",
        "2026-06-26T23:30:00.000Z",
        "2026-06-26T23:45:00.000Z",
      ),
      settlementBronze(
        "KXBTC15M-A",
        "issue-a",
        "2026-06-26T23:15:00.000Z",
        "2026-06-26T23:30:00.000Z",
      ),
    ];

    const result = validateHistoricalBronzeDataset(records);
    const tickers = result.errors.map((issue) => issue.ticker);

    expect(tickers.indexOf("KXBTC15M-A")).toBeGreaterThanOrEqual(0);
    expect(tickers.indexOf("KXBTC15M-Z")).toBeGreaterThanOrEqual(0);
    expect(tickers.indexOf("KXBTC15M-A")).toBeLessThan(tickers.indexOf("KXBTC15M-Z"));
  });

  it("returns deeply frozen immutable output", () => {
    const result = validateHistoricalBronzeDataset(
      completeMarketRecords(
        "KXBTC15M-FROZEN",
        "2026-06-26T23:15:00.000Z",
        "2026-06-26T23:30:00.000Z",
        "frozen",
      ),
    );

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.errors)).toBe(true);
    expect(Object.isFrozen(result.warnings)).toBe(true);
    expect(Object.isFrozen(result.statistics)).toBe(true);
  });

  it("serializes validation results deterministically", () => {
    const records = completeMarketRecords(
      "KXBTC15M-SERIALIZE",
      "2026-06-26T23:15:00.000Z",
      "2026-06-26T23:30:00.000Z",
      "serialize",
    );

    const first = serializeHistoricalBronzeValidation(
      validateHistoricalBronzeDataset(records),
    );
    const second = serializeHistoricalBronzeValidation(
      validateHistoricalBronzeDataset(records),
    );

    expect(first).toBe(second);
  });

  it("produces identical validation for identical inputs regardless of order", () => {
    const records = completeMarketRecords(
      "KXBTC15M-ORDER",
      "2026-06-26T23:15:00.000Z",
      "2026-06-26T23:30:00.000Z",
      "order",
    );
    const reversed = [...records].reverse();

    const first = serializeHistoricalBronzeValidation(
      validateHistoricalBronzeDataset(records),
    );
    const second = serializeHistoricalBronzeValidation(
      validateHistoricalBronzeDataset(reversed),
    );

    expect(first).toBe(second);
  });

  it("does not mutate input bronze records", () => {
    const records = completeMarketRecords(
      "KXBTC15M-UNCHANGED",
      "2026-06-26T23:15:00.000Z",
      "2026-06-26T23:30:00.000Z",
      "unchanged",
    );
    const before = records.map((record) => serializeBronzeRecord(record));

    validateHistoricalBronzeDataset(records);

    const after = records.map((record) => serializeBronzeRecord(record));
    expect(after).toEqual(before);
  });

  it("detects invalid OHLC and negative prices in BTC bars", () => {
    const ticker = "KXBTC15M-BAD-OHLC";
    const openTime = "2026-06-26T23:15:00.000Z";
    const closeTime = "2026-06-26T23:16:00.000Z";
    const records = [
      marketBronze(
        ticker,
        "bad-ohlc-market",
        openTime,
        "2026-06-26T23:30:00.000Z",
      ),
      candleBronze(ticker, "bad-ohlc-candle", openTime, closeTime),
      btcBronze(ticker, "bad-ohlc-btc", openTime, closeTime, {
        open_usd: -1,
        high_usd: 10,
        low_usd: 20,
        close_usd: 15,
        volume_btc: -3,
      }),
    ];

    const result = validateHistoricalBronzeDataset(records);
    const codes = result.errors.map((issue) => issue.errorCode);

    expect(result.valid).toBe(false);
    expect(codes).toContain(HistoricalBronzeValidationErrorCode.NEGATIVE_PRICE);
    expect(codes).toContain(HistoricalBronzeValidationErrorCode.INVALID_OHLC);
    expect(codes).toContain(HistoricalBronzeValidationErrorCode.INVALID_VOLUME);
  });
});
