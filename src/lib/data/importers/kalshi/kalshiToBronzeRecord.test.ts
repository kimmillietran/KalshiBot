import { describe, expect, it } from "vitest";

import { DataSource } from "@/lib/data/provenance";
import { rawHistoricalRecordSchema } from "@/lib/data/schemas";

import {
  eventTimeFromMarketWire,
  kalshiUnixSecondsToEventTime,
  mapKalshiCandlestickPayloadToBronzeRecord,
  mapKalshiMarketPayloadToBronzeRecord,
  mapKalshiSettlementPayloadToBronzeRecord,
} from "./kalshiToBronzeRecord";

const COLLECTION_TIME = "2026-06-27T01:00:00.000Z";
const OBSERVED_AT = "2026-06-27T01:00:05.000Z";
const TICKER = "KXBTC15M-26JUN270115-15";
const REQUEST_PATH = "/historical/markets/KXBTC15M-26JUN270115-15";

const marketWire = {
  ticker: TICKER,
  event_ticker: "KXBTC15M-26JUN270115",
  status: "finalized",
  result: "yes",
  open_time: "2026-06-27T01:00:00.000Z",
  close_time: "2026-06-27T01:15:00.000Z",
  settlement_ts: "2026-06-27T01:20:00.000Z",
  settlement_value_dollars: "1.0000",
  expiration_value: "60010.25",
  floor_strike: 59990.31,
};

const candleWire = {
  end_period_ts: 1_700_000_060,
  volume: "12.00",
  open_interest: "45.00",
  price: { close: "0.5500" },
};

const baseInput = {
  ticker: TICKER,
  collectionTime: COLLECTION_TIME,
  observedAt: OBSERVED_AT,
  requestPath: REQUEST_PATH,
};

describe("kalshiToBronzeRecord", () => {
  it("maps market payload to a RawHistoricalRecord", () => {
    const record = mapKalshiMarketPayloadToBronzeRecord({
      ...baseInput,
      rawPayload: marketWire,
      eventTime: eventTimeFromMarketWire(marketWire),
    });

    expect(rawHistoricalRecordSchema.safeParse(record).success).toBe(true);
    expect(record.contentType).toBe("kalshi.historical.market");
    expect(record.provenance.source).toBe(DataSource.KALSHI_REST);
    expect(record.ticker).toBe(TICKER);
  });

  it("maps candlestick payload to a RawHistoricalRecord", () => {
    const record = mapKalshiCandlestickPayloadToBronzeRecord({
      ...baseInput,
      rawPayload: candleWire,
      eventTime: kalshiUnixSecondsToEventTime(candleWire.end_period_ts),
      requestPath: "/historical/markets/KXBTC-OLD/candlesticks?period_interval=1",
    });

    expect(rawHistoricalRecordSchema.safeParse(record).success).toBe(true);
    expect(record.contentType).toBe("kalshi.historical.candlestick");
    expect(record.provenance.source).toBe(DataSource.KALSHI_CANDLES);
    expect(record.eventTime).toBe(
      kalshiUnixSecondsToEventTime(candleWire.end_period_ts),
    );
  });

  it("maps settlement payload to a RawHistoricalRecord", () => {
    const record = mapKalshiSettlementPayloadToBronzeRecord({
      ...baseInput,
      rawPayload: { market: marketWire },
      eventTime: eventTimeFromMarketWire(marketWire),
    });

    expect(rawHistoricalRecordSchema.safeParse(record).success).toBe(true);
    expect(record.contentType).toBe("kalshi.historical.settlement");
    expect(record.provenance.fetchId).toBe(REQUEST_PATH);
  });

  it("preserves raw payload exactly without normalization", () => {
    const marketRecord = mapKalshiMarketPayloadToBronzeRecord({
      ...baseInput,
      rawPayload: marketWire,
      eventTime: eventTimeFromMarketWire(marketWire),
    });
    const candleRecord = mapKalshiCandlestickPayloadToBronzeRecord({
      ...baseInput,
      rawPayload: candleWire,
      eventTime: kalshiUnixSecondsToEventTime(candleWire.end_period_ts),
    });

    expect(marketRecord.payload).toBe(marketWire);
    expect(candleRecord.payload).toBe(candleWire);
    expect((marketRecord.payload as typeof marketWire).result).toBe("yes");
  });

  it("produces deterministic record IDs for identical inputs", () => {
    const input = {
      ...baseInput,
      rawPayload: marketWire,
      eventTime: eventTimeFromMarketWire(marketWire),
    };

    const first = mapKalshiMarketPayloadToBronzeRecord(input);
    const second = mapKalshiMarketPayloadToBronzeRecord(input);

    expect(second.recordId).toBe(first.recordId);
    expect(first.recordId).toMatch(/^kalshi-bronze-[0-9a-f]{8}$/);
  });

  it("changes record IDs when payload changes", () => {
    const first = mapKalshiMarketPayloadToBronzeRecord({
      ...baseInput,
      rawPayload: marketWire,
      eventTime: eventTimeFromMarketWire(marketWire),
    });
    const second = mapKalshiMarketPayloadToBronzeRecord({
      ...baseInput,
      rawPayload: { ...marketWire, result: "no" },
      eventTime: eventTimeFromMarketWire(marketWire),
    });

    expect(second.recordId).not.toBe(first.recordId);
  });

  it("falls back to close_time when settlement_ts is null", () => {
    const wire = {
      ...marketWire,
      settlement_ts: null,
      close_time: "2026-06-27T01:15:00.000Z",
    };

    expect(eventTimeFromMarketWire(wire)).toBe("2026-06-27T01:15:00.000Z");
  });

  it("normalizes settlement_ts with microsecond precision to millisecond EventTime", () => {
    const wire = {
      ...marketWire,
      settlement_ts: "2026-04-28T23:45:09.271822Z",
      close_time: "2026-06-27T01:15:00Z",
    };

    expect(eventTimeFromMarketWire(wire)).toBe("2026-04-28T23:45:09.271Z");
  });

  it("normalizes close_time without fractional seconds to .000Z", () => {
    const wire = {
      ...marketWire,
      settlement_ts: null,
      close_time: "2026-06-27T01:15:00Z",
    };

    expect(eventTimeFromMarketWire(wire)).toBe("2026-06-27T01:15:00.000Z");
  });

  it("throws deterministically for invalid market wire timestamps", () => {
    expect(() =>
      eventTimeFromMarketWire({
        settlement_ts: null,
        close_time: "not-a-timestamp",
      }),
    ).toThrow("Kalshi market wire close_time is invalid");

    expect(() =>
      eventTimeFromMarketWire({
        settlement_ts: "also-invalid",
        close_time: "2026-06-27T01:15:00.000Z",
      }),
    ).toThrow("Kalshi market wire settlement_ts is invalid");
  });

  it("accepts a live-shaped market wire mapped through rawHistoricalRecordSchema", () => {
    const liveMarketWire = {
      ticker: TICKER,
      event_ticker: "KXBTC15M-26JUN270115",
      status: "finalized",
      result: "yes",
      open_time: "2026-04-28T23:30:00Z",
      close_time: "2026-04-28T23:45:00Z",
      settlement_ts: "2026-04-28T23:45:09.271822Z",
      settlement_value_dollars: "1.0000",
      expiration_value: "60010.25",
      floor_strike: 59_990.31,
    };

    const record = mapKalshiMarketPayloadToBronzeRecord({
      ...baseInput,
      rawPayload: liveMarketWire,
      eventTime: eventTimeFromMarketWire(liveMarketWire),
    });

    expect(record.eventTime).toBe("2026-04-28T23:45:09.271Z");
    expect((record.payload as typeof liveMarketWire).open_time).toBe("2026-04-28T23:30:00Z");
    expect((record.payload as typeof liveMarketWire).close_time).toBe("2026-04-28T23:45:00Z");
    expect((record.payload as typeof liveMarketWire).floor_strike).toBe(59_990.31);
    expect(rawHistoricalRecordSchema.safeParse(record).success).toBe(true);
  });
});
