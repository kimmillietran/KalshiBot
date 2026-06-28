import { describe, expect, it } from "vitest";

import { DataSource } from "@/lib/data/provenance";
import { marketWindowSchema } from "@/lib/data/schemas";
import type { RawHistoricalRecord } from "@/lib/data/types";
import { DATA_CONTRACT_VERSION } from "@/lib/data/versioning";

import { SilverMalformedPayloadError } from "./errors";
import { normalizeMarketWindow } from "./normalizeMarketWindow";
import { SILVER_BRONZE_CONTENT_TYPE } from "./shared";

const EVENT_TIME = "2026-06-27T01:15:00.000Z";
const COLLECTION_TIME = "2026-06-27T01:00:00.000Z";
const OBSERVED_AT = "2026-06-27T01:00:05.000Z";
const OPEN_TIME = "2026-06-27T01:00:00.000Z";
const CLOSE_TIME = "2026-06-27T01:15:00.000Z";
const TICKER = "KXBTC15M-26JUN270115-15";

function createMarketBronze(
  payload: Record<string, unknown>,
  overrides: Partial<RawHistoricalRecord> = {},
): RawHistoricalRecord {
  return {
    recordId: "bronze-market-001",
    ticker: TICKER,
    contentType: SILVER_BRONZE_CONTENT_TYPE.MARKET,
    eventTime: EVENT_TIME,
    collectionTime: COLLECTION_TIME,
    observedAt: OBSERVED_AT,
    payload,
    provenance: {
      source: DataSource.KALSHI_REST,
      collectionTime: COLLECTION_TIME,
      observedAt: OBSERVED_AT,
      fetchId: "/historical/markets/KXBTC15M-26JUN270115-15",
      apiVersion: "kalshi-trade-api-v2",
    },
    ...overrides,
  };
}

const validMarketPayload = {
  open_time: OPEN_TIME,
  close_time: CLOSE_TIME,
  floor_strike: 59_990.31,
  event_ticker: "KXBTC15M-26JUN270115",
  status: "finalized",
};

describe("normalizeMarketWindow", () => {
  it("normalizes a valid market bronze record", () => {
    const result = normalizeMarketWindow(createMarketBronze(validMarketPayload));

    expect(marketWindowSchema.safeParse(result.record).success).toBe(true);
    expect(result.record.ticker).toBe(TICKER);
    expect(result.record.seriesTicker).toBe("KXBTC15M");
    expect(result.record.strikePriceUsd).toBe(59_990.31);
    expect(result.record.status).toBe("settled");
    expect(result.record.datasetVersion).toBe(DATA_CONTRACT_VERSION);
  });

  it("preserves bronze provenance and temporal fields", () => {
    const bronze = createMarketBronze(validMarketPayload);
    const result = normalizeMarketWindow(bronze);

    expect(result.bronzeRecordId).toBe(bronze.recordId);
    expect(result.provenance).toEqual(bronze.provenance);
    expect(result.record.eventTime).toBe(EVENT_TIME);
    expect(result.record.collectionTime).toBe(COLLECTION_TIME);
    expect(result.record.observedAt).toBe(OBSERVED_AT);
  });

  it("rejects malformed market payloads", () => {
    expect(() =>
      normalizeMarketWindow(
        createMarketBronze({
          close_time: CLOSE_TIME,
          floor_strike: 59_990.31,
          event_ticker: "KXBTC15M-26JUN270115",
          status: "finalized",
        }),
      ),
    ).toThrow(SilverMalformedPayloadError);
  });

  it("rejects unknown payload shapes", () => {
    expect(() =>
      normalizeMarketWindow(createMarketBronze({ unexpected: true })),
    ).toThrow(SilverMalformedPayloadError);
  });

  it("is deterministic for identical bronze inputs", () => {
    const bronze = createMarketBronze(validMarketPayload);
    const first = normalizeMarketWindow(bronze);
    const second = normalizeMarketWindow(bronze);

    expect(first).toEqual(second);
  });
});
