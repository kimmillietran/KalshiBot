import { describe, expect, it } from "vitest";

import { DataQualityFlag } from "@/lib/data/schemas";
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

  it("normalizes live settlement payload with microsecond settlement_ts", () => {
    const result = normalizeSettlement(
      createSettlementBronze({
        market: {
          ticker: "KXBTC15M-26APR281945-45",
          event_ticker: "KXBTC15M",
          status: "finalized",
          result: "yes",
          open_time: "2026-04-28T23:45:09.271822Z",
          close_time: "2026-04-28T23:45:09.271822Z",
          settlement_ts: "2026-04-28T23:45:09.271822Z",
          settlement_value_dollars: "1.0000",
          expiration_value: "76282.84",
          floor_strike: null,
        },
      }),
    );

    expect(settlementRecordSchema.safeParse(result.record).success).toBe(true);
    expect(result.record.settledAt).toBe("2026-04-28T23:45:09.271Z");
    expect(result.record.settlementPriceUsd).toBe(76_282.84);
    expect(result.record.result).toBe("yes");
  });

  it("does not fail when floor_strike is null but settlement fields are present", () => {
    const result = normalizeSettlement(
      createSettlementBronze({
        market: {
          ...settlementBody,
          floor_strike: null,
          settlement_ts: "2026-04-28T23:45:09.271822Z",
          expiration_value: "76282.84",
          settlement_value_dollars: "1.0000",
        },
      }),
    );

    expect(result.record.strikePriceUsd).toBe(76_282.84);
    expect(result.record.qualityFlags).toContain(DataQualityFlag.PARTIAL_WINDOW);
  });

  it("rejects deterministically when settlement value fields are missing", () => {
    const bronze = createSettlementBronze({
      market: {
        floor_strike: null,
        result: "yes",
        settlement_ts: "2026-04-28T23:45:09.271822Z",
      },
    });

    expect(() => normalizeSettlement(bronze)).toThrow(SilverMalformedPayloadError);

    try {
      normalizeSettlement(bronze);
    } catch (error) {
      expect(error).toBeInstanceOf(SilverMalformedPayloadError);
      expect((error as SilverMalformedPayloadError).details.join(" ")).toMatch(
        /expiration_value or settlement_value_dollars/i,
      );
    }
  });
});
