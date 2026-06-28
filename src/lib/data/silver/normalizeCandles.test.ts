import { describe, expect, it } from "vitest";

import { DataSource } from "@/lib/data/provenance";
import { kalshiCandle1mSchema } from "@/lib/data/schemas";
import type { RawHistoricalRecord } from "@/lib/data/types";

import { SilverMalformedPayloadError } from "./errors";
import { normalizeKalshiCandle } from "./normalizeCandles";
import { SILVER_BRONZE_CONTENT_TYPE } from "./shared";

const EVENT_TIME = "2026-06-27T01:15:00.000Z";
const COLLECTION_TIME = "2026-06-27T01:00:00.000Z";
const OBSERVED_AT = "2026-06-27T01:00:05.000Z";
const OPEN_TIME = "2026-06-27T01:14:00.000Z";
const CLOSE_TIME = "2026-06-27T01:15:00.000Z";
const TICKER = "KXBTC15M-26JUN270115-15";

function createCandleBronze(
  payload: Record<string, unknown>,
): RawHistoricalRecord {
  return {
    recordId: "bronze-candle-001",
    ticker: TICKER,
    contentType: SILVER_BRONZE_CONTENT_TYPE.CANDLESTICK,
    eventTime: EVENT_TIME,
    collectionTime: COLLECTION_TIME,
    observedAt: OBSERVED_AT,
    payload,
    provenance: {
      source: DataSource.KALSHI_CANDLES,
      collectionTime: COLLECTION_TIME,
      observedAt: OBSERVED_AT,
      fetchId: "/historical/markets/KXBTC15M-26JUN270115-15/candlesticks",
    },
  };
}

const validCandlePayload = {
  open_time: OPEN_TIME,
  close_time: CLOSE_TIME,
  yes_bid_cents: 48,
  yes_ask_cents: 52,
  no_bid_cents: 47,
  no_ask_cents: 51,
  volume_contracts: 120,
};

describe("normalizeKalshiCandle", () => {
  it("normalizes a valid candle bronze record", () => {
    const result = normalizeKalshiCandle(createCandleBronze(validCandlePayload));

    expect(kalshiCandle1mSchema.safeParse(result.record).success).toBe(true);
    expect(result.record.ticker).toBe(TICKER);
    expect(result.record.yesBidCents).toBe(48);
    expect(result.record.yesAskCents).toBe(52);
    expect(result.record.volumeContracts).toBe(120);
  });

  it("preserves temporal fields and provenance", () => {
    const bronze = createCandleBronze(validCandlePayload);
    const result = normalizeKalshiCandle(bronze);

    expect(result.bronzeRecordId).toBe(bronze.recordId);
    expect(result.provenance).toEqual(bronze.provenance);
    expect(result.record.eventTime).toBe(EVENT_TIME);
    expect(result.record.collectionTime).toBe(COLLECTION_TIME);
    expect(result.record.observedAt).toBe(OBSERVED_AT);
  });

  it("rejects incomplete Kalshi wire payloads without quote fields", () => {
    expect(() =>
      normalizeKalshiCandle(
        createCandleBronze({
          end_period_ts: 1_700_000_060,
          volume: "12.00",
          price: { close: "0.5500" },
        }),
      ),
    ).toThrow(SilverMalformedPayloadError);
  });

  it("rejects invalid bid/ask spreads", () => {
    expect(() =>
      normalizeKalshiCandle(
        createCandleBronze({
          ...validCandlePayload,
          yes_bid_cents: 55,
          yes_ask_cents: 50,
        }),
      ),
    ).toThrow(SilverMalformedPayloadError);
  });

  it("is deterministic for identical bronze inputs", () => {
    const bronze = createCandleBronze(validCandlePayload);
    expect(normalizeKalshiCandle(bronze)).toEqual(normalizeKalshiCandle(bronze));
  });
});
