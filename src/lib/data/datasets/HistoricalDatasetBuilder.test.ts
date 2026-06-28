import { describe, expect, it } from "vitest";

import { serializeBronzeRecord } from "@/lib/data/bronze";
import { DataSource } from "@/lib/data/provenance";
import { SILVER_BRONZE_CONTENT_TYPE } from "@/lib/data/silver";
import type { RawHistoricalRecord } from "@/lib/data/types";
import { DATA_CONTRACT_VERSION } from "@/lib/data/versioning";

import {
  DATASET_BRONZE_CONTENT_TYPE,
  HistoricalDatasetBuildError,
  HistoricalDatasetBuildErrorCode,
} from "./datasetTypes";
import {
  buildHistoricalDataset,
  serializeHistoricalDataset,
} from "./HistoricalDatasetBuilder";

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
  const closeTimeMs = Date.parse(eventTime) + 60_000;
  const closeTime = new Date(closeTimeMs).toISOString();

  return [
    marketBronze(ticker, `${idPrefix}-market`, eventTime, windowClose),
    candleBronze(ticker, `${idPrefix}-candle`, openTime, closeTime),
    btcBronze(ticker, `${idPrefix}-btc`, openTime, closeTime),
    settlementBronze(ticker, `${idPrefix}-settlement`, eventTime, windowClose),
  ];
}

describe("buildHistoricalDataset", () => {
  it("builds a single-market dataset from bronze records", () => {
    const ticker = "KXBTC15M-26JUN261930-30";
    const records = completeMarketRecords(
      ticker,
      "2026-06-26T23:15:00.000Z",
      "2026-06-26T23:30:00.000Z",
      "single",
    );

    const dataset = buildHistoricalDataset(records);

    expect(dataset.snapshots).toHaveLength(1);
    expect(dataset.snapshots[0]!.ticker).toBe(ticker);
    expect(dataset.metadata.snapshotCount).toBe(1);
    expect(dataset.metadata.marketTickers).toEqual([ticker]);
    expect(dataset.metadata.contractVersion).toBe(DATA_CONTRACT_VERSION);
    expect(dataset.provenance.bronzeRecordCount).toBe(4);
    expect(dataset.provenance.bronzeRecordIds).toHaveLength(4);
  });

  it("builds a multi-market dataset with deterministic snapshot ordering", () => {
    const earlierTicker = "KXBTC15M-EARLIER";
    const laterTicker = "KXBTC15M-LATER";

    const records = [
      ...completeMarketRecords(
        laterTicker,
        "2026-06-26T23:30:00.000Z",
        "2026-06-26T23:45:00.000Z",
        "later",
      ),
      ...completeMarketRecords(
        earlierTicker,
        "2026-06-26T23:15:00.000Z",
        "2026-06-26T23:30:00.000Z",
        "earlier",
      ),
    ];

    const dataset = buildHistoricalDataset(records);

    expect(dataset.snapshots).toHaveLength(2);
    expect(dataset.snapshots[0]!.ticker).toBe(earlierTicker);
    expect(dataset.snapshots[1]!.ticker).toBe(laterTicker);
    expect(dataset.metadata.marketTickers).toEqual([earlierTicker, laterTicker]);
  });

  it("rejects incomplete snapshot groups missing required bronze records", () => {
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

    expect(() => buildHistoricalDataset(records)).toThrow(HistoricalDatasetBuildError);

    try {
      buildHistoricalDataset(records);
    } catch (error) {
      expect(error).toMatchObject({
        code: HistoricalDatasetBuildErrorCode.INCOMPLETE_SNAPSHOT_GROUP,
        ticker,
      });
    }
  });

  it("rejects duplicate bronze record ids", () => {
    const ticker = "KXBTC15M-DUP-ID";
    const duplicate = candleBronze(
      ticker,
      "dup-id",
      "2026-06-26T23:15:00.000Z",
      "2026-06-26T23:16:00.000Z",
    );

    const records = [
      marketBronze(
        ticker,
        "dup-market",
        "2026-06-26T23:15:00.000Z",
        "2026-06-26T23:30:00.000Z",
      ),
      duplicate,
      { ...duplicate },
      btcBronze(
        ticker,
        "dup-btc",
        "2026-06-26T23:15:00.000Z",
        "2026-06-26T23:16:00.000Z",
      ),
    ];

    expect(() => buildHistoricalDataset(records)).toThrow(HistoricalDatasetBuildError);

    try {
      buildHistoricalDataset(records);
    } catch (error) {
      expect(error).toMatchObject({
        code: HistoricalDatasetBuildErrorCode.DUPLICATE_RECORD_ID,
        recordId: "dup-id",
      });
    }
  });

  it("rejects conflicting duplicate market windows for the same ticker", () => {
    const ticker = "KXBTC15M-DUP-MARKET";

    const records = [
      marketBronze(
        ticker,
        "market-a",
        "2026-06-26T23:15:00.000Z",
        "2026-06-26T23:30:00.000Z",
      ),
      marketBronze(
        ticker,
        "market-b",
        "2026-06-26T23:30:00.000Z",
        "2026-06-26T23:45:00.000Z",
      ),
      candleBronze(
        ticker,
        "dup-market-candle",
        "2026-06-26T23:15:00.000Z",
        "2026-06-26T23:16:00.000Z",
      ),
      btcBronze(
        ticker,
        "dup-market-btc",
        "2026-06-26T23:15:00.000Z",
        "2026-06-26T23:16:00.000Z",
      ),
    ];

    expect(() => buildHistoricalDataset(records)).toThrow(HistoricalDatasetBuildError);

    try {
      buildHistoricalDataset(records);
    } catch (error) {
      expect(error).toMatchObject({
        code: HistoricalDatasetBuildErrorCode.DUPLICATE_MARKET_WINDOW,
        ticker,
      });
    }
  });

  it("returns deeply frozen immutable outputs", () => {
    const ticker = "KXBTC15M-IMMUTABLE";
    const dataset = buildHistoricalDataset(
      completeMarketRecords(
        ticker,
        "2026-06-26T23:15:00.000Z",
        "2026-06-26T23:30:00.000Z",
        "immutable",
      ),
    );

    expect(Object.isFrozen(dataset)).toBe(true);
    expect(Object.isFrozen(dataset.snapshots)).toBe(true);
    expect(Object.isFrozen(dataset.metadata)).toBe(true);
    expect(Object.isFrozen(dataset.provenance)).toBe(true);
    expect(Object.isFrozen(dataset.snapshots[0]!.kalshiCandles)).toBe(true);
    expect(Object.isFrozen(dataset.snapshots[0]!.btcBars)).toBe(true);
  });

  it("serializes datasets deterministically", () => {
    const records = completeMarketRecords(
      "KXBTC15M-SERIALIZE",
      "2026-06-26T23:15:00.000Z",
      "2026-06-26T23:30:00.000Z",
      "serialize",
    );

    const first = serializeHistoricalDataset(buildHistoricalDataset(records));
    const second = serializeHistoricalDataset(buildHistoricalDataset(records));

    expect(first).toBe(second);
    expect(first).toContain("KXBTC15M-SERIALIZE");
  });

  it("does not mutate input bronze records", () => {
    const records = completeMarketRecords(
      "KXBTC15M-UNCHANGED",
      "2026-06-26T23:15:00.000Z",
      "2026-06-26T23:30:00.000Z",
      "unchanged",
    );
    const before = records.map((record) => serializeBronzeRecord(record));

    buildHistoricalDataset(records);

    const after = records.map((record) => serializeBronzeRecord(record));
    expect(after).toEqual(before);
  });
});
