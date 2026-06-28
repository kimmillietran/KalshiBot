import { describe, expect, it } from "vitest";

import { DataSource } from "@/lib/data/provenance";
import { settlementRecordSchema } from "@/lib/data/schemas";
import type { RawHistoricalRecord } from "@/lib/data/types";

import { SilverMalformedPayloadError } from "./errors";
import { normalizeSettlement } from "./normalizeSettlement";
import { SILVER_BRONZE_CONTENT_TYPE } from "./shared";

const EVENT_TIME = "2026-06-27T01:20:00.000Z";
const COLLECTION_TIME = "2026-06-27T01:00:00.000Z";
const OBSERVED_AT = "2026-06-27T01:00:05.000Z";
const SETTLED_AT = "2026-06-27T01:20:00.000Z";
const TICKER = "KXBTC15M-26JUN270115-15";

const settlementBody = {
  floor_strike: 59_990.31,
  expiration_value: "60010.25",
  result: "yes",
  settlement_ts: SETTLED_AT,
};

function createSettlementBronze(
  payload: Record<string, unknown>,
): RawHistoricalRecord {
  return {
    recordId: "bronze-settlement-001",
    ticker: TICKER,
    contentType: SILVER_BRONZE_CONTENT_TYPE.SETTLEMENT,
    eventTime: EVENT_TIME,
    collectionTime: COLLECTION_TIME,
    observedAt: OBSERVED_AT,
    payload,
    provenance: {
      source: DataSource.KALSHI_REST,
      collectionTime: COLLECTION_TIME,
      observedAt: OBSERVED_AT,
      fetchId: "/historical/markets/KXBTC15M-26JUN270115-15",
    },
  };
}

describe("normalizeSettlement", () => {
  it("normalizes a valid settlement bronze record", () => {
    const result = normalizeSettlement(
      createSettlementBronze({ market: settlementBody }),
    );

    expect(settlementRecordSchema.safeParse(result.record).success).toBe(true);
    expect(result.record.ticker).toBe(TICKER);
    expect(result.record.strikePriceUsd).toBe(59_990.31);
    expect(result.record.settlementPriceUsd).toBe(60_010.25);
    expect(result.record.result).toBe("yes");
    expect(result.record.settledAt).toBe(SETTLED_AT);
  });

  it("accepts direct settlement payloads without market wrapper", () => {
    const result = normalizeSettlement(createSettlementBronze(settlementBody));
    expect(result.record.result).toBe("yes");
  });

  it("preserves temporal fields and provenance", () => {
    const bronze = createSettlementBronze({ market: settlementBody });
    const result = normalizeSettlement(bronze);

    expect(result.bronzeRecordId).toBe(bronze.recordId);
    expect(result.provenance).toEqual(bronze.provenance);
    expect(result.record.eventTime).toBe(EVENT_TIME);
    expect(result.record.collectionTime).toBe(COLLECTION_TIME);
    expect(result.record.observedAt).toBe(OBSERVED_AT);
  });

  it("rejects invalid settlement values", () => {
    expect(() =>
      normalizeSettlement(
        createSettlementBronze({
          ...settlementBody,
          result: "maybe",
        }),
      ),
    ).toThrow(SilverMalformedPayloadError);

    expect(() =>
      normalizeSettlement(
        createSettlementBronze({
          ...settlementBody,
          expiration_value: "not-a-number",
        }),
      ),
    ).toThrow(SilverMalformedPayloadError);
  });

  it("is deterministic for identical bronze inputs", () => {
    const bronze = createSettlementBronze({ market: settlementBody });
    expect(normalizeSettlement(bronze)).toEqual(normalizeSettlement(bronze));
  });
});
