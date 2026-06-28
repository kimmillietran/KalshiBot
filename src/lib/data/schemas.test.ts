import { describe, expect, it } from "vitest";

import { DataSource } from "./provenance";
import {
  btcBar1mSchema,
  kalshiCandle1mSchema,
  marketWindowSchema,
  settlementRecordSchema,
} from "./schemas";
import { DATA_CONTRACT_VERSION } from "./versioning";

const EVENT_TIME = "2026-06-26T23:15:00.000Z";
const COLLECTION_TIME = "2026-06-27T01:00:00.000Z";
const OBSERVED_AT = "2026-06-27T01:00:05.000Z";
const OPEN_TIME = "2026-06-26T23:15:00.000Z";
const CLOSE_TIME = "2026-06-26T23:16:00.000Z";
const WINDOW_CLOSE = "2026-06-26T23:30:00.000Z";
const TICKER = "KXBTC15M-26JUN261930-30";
const SERIES = "KXBTC15M";

const temporalFields = {
  eventTime: EVENT_TIME,
  collectionTime: COLLECTION_TIME,
  observedAt: OBSERVED_AT,
};

const validMarketWindow = {
  ...temporalFields,
  ticker: TICKER,
  seriesTicker: SERIES,
  openTime: OPEN_TIME,
  closeTime: WINDOW_CLOSE,
  strikePriceUsd: 59_990.31,
  status: "closed" as const,
  qualityFlags: [],
  datasetVersion: DATA_CONTRACT_VERSION,
};

const validKalshiCandle = {
  ...temporalFields,
  ticker: TICKER,
  openTime: OPEN_TIME,
  closeTime: CLOSE_TIME,
  yesBidCents: 48,
  yesAskCents: 52,
  noBidCents: 47,
  noAskCents: 51,
  volumeContracts: 120,
  qualityFlags: [],
  datasetVersion: DATA_CONTRACT_VERSION,
};

const validBtcBar = {
  ...temporalFields,
  openTime: OPEN_TIME,
  closeTime: CLOSE_TIME,
  openUsd: 59_980.5,
  highUsd: 60_010.25,
  lowUsd: 59_960.0,
  closeUsd: 59_995.75,
  volumeBtc: 12.5,
  qualityFlags: [],
  datasetVersion: DATA_CONTRACT_VERSION,
};

const validSettlement = {
  ...temporalFields,
  ticker: TICKER,
  strikePriceUsd: 59_990.31,
  settlementPriceUsd: 60_012.44,
  result: "yes" as const,
  settledAt: WINDOW_CLOSE,
  qualityFlags: [],
  datasetVersion: DATA_CONTRACT_VERSION,
};

describe("historical data schemas", () => {
  it("accepts a valid market window", () => {
    expect(marketWindowSchema.safeParse(validMarketWindow).success).toBe(true);
  });

  it("accepts a valid Kalshi 1m candle", () => {
    expect(kalshiCandle1mSchema.safeParse(validKalshiCandle).success).toBe(true);
  });

  it("accepts a valid BTC 1m bar", () => {
    expect(btcBar1mSchema.safeParse(validBtcBar).success).toBe(true);
  });

  it("accepts a valid settlement record", () => {
    expect(settlementRecordSchema.safeParse(validSettlement).success).toBe(true);
  });

  it("rejects invalid UTC timestamps", () => {
    const result = marketWindowSchema.safeParse({
      ...validMarketWindow,
      eventTime: "2026-06-26T23:15:00-07:00",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid bid/ask cents on Kalshi candles", () => {
    const invertedBidAsk = kalshiCandle1mSchema.safeParse({
      ...validKalshiCandle,
      yesBidCents: 55,
      yesAskCents: 50,
    });
    expect(invertedBidAsk.success).toBe(false);

    const outOfRange = kalshiCandle1mSchema.safeParse({
      ...validKalshiCandle,
      noAskCents: 101,
    });
    expect(outOfRange.success).toBe(false);
  });

  it("rejects invalid settlement values", () => {
    const invalidResult = settlementRecordSchema.safeParse({
      ...validSettlement,
      result: "maybe",
    });
    expect(invalidResult.success).toBe(false);

    const nonFiniteStrike = settlementRecordSchema.safeParse({
      ...validSettlement,
      strikePriceUsd: Number.NaN,
    });
    expect(nonFiniteStrike.success).toBe(false);
  });

  it("requires eventTime, collectionTime, and observedAt on silver records", () => {
    const withoutEventTime = { ...validMarketWindow };
    delete (withoutEventTime as { eventTime?: string }).eventTime;
    expect(marketWindowSchema.safeParse(withoutEventTime).success).toBe(false);

    const withoutCollectionTime = { ...validMarketWindow };
    delete (withoutCollectionTime as { collectionTime?: string }).collectionTime;
    expect(marketWindowSchema.safeParse(withoutCollectionTime).success).toBe(
      false,
    );

    const withoutObservedAt = { ...validMarketWindow };
    delete (withoutObservedAt as { observedAt?: string }).observedAt;
    expect(marketWindowSchema.safeParse(withoutObservedAt).success).toBe(false);
  });

  it("rejects missing ticker", () => {
    const result = marketWindowSchema.safeParse({
      ...validMarketWindow,
      ticker: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects impossible BTC OHLC values", () => {
    const result = btcBar1mSchema.safeParse({
      ...validBtcBar,
      highUsd: 59_900,
      lowUsd: 60_000,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-finite BTC prices", () => {
    const result = btcBar1mSchema.safeParse({
      ...validBtcBar,
      closeUsd: Number.POSITIVE_INFINITY,
    });
    expect(result.success).toBe(false);
  });

  it("produces JSON-serializable validated records", () => {
    const parsed = marketWindowSchema.parse(validMarketWindow);
    const roundTrip = JSON.parse(JSON.stringify(parsed));
    expect(marketWindowSchema.safeParse(roundTrip).success).toBe(true);
  });

  it("validates deterministically for identical inputs", () => {
    const first = marketWindowSchema.safeParse(validMarketWindow);
    const second = marketWindowSchema.safeParse(validMarketWindow);
    expect(first.success).toBe(second.success);
    if (first.success && second.success) {
      expect(first.data).toEqual(second.data);
    }
  });

  it("documents bronze provenance source literals", () => {
    expect(DataSource.KALSHI_REST).toBe("kalshi-rest");
    expect(DataSource.BINANCE_SPOT).toBe("binance-spot");
  });
});
