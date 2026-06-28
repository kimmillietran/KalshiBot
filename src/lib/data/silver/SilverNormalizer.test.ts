import { describe, expect, it } from "vitest";

import { DataSource } from "@/lib/data/provenance";
import {
  kalshiCandle1mSchema,
  marketWindowSchema,
  settlementRecordSchema,
} from "@/lib/data/schemas";
import type { RawHistoricalRecord } from "@/lib/data/types";

import {
  SilverInvalidBronzeRecordError,
  SilverMalformedPayloadError,
  SilverUnsupportedContentTypeError,
} from "./errors";
import { normalizeRecord } from "./normalizeRecord";
import { SilverNormalizer } from "./SilverNormalizer";
import { SILVER_BRONZE_CONTENT_TYPE } from "./shared";

const COLLECTION_TIME = "2026-06-27T01:00:00.000Z";
const OBSERVED_AT = "2026-06-27T01:00:05.000Z";
const TICKER = "KXBTC15M-26JUN270115-15";

function baseBronze(
  contentType: string,
  payload: Record<string, unknown>,
  recordId: string,
  eventTime: string,
): RawHistoricalRecord {
  return {
    recordId,
    ticker: TICKER,
    contentType,
    eventTime,
    collectionTime: COLLECTION_TIME,
    observedAt: OBSERVED_AT,
    payload,
    provenance: {
      source: DataSource.KALSHI_REST,
      collectionTime: COLLECTION_TIME,
      observedAt: OBSERVED_AT,
    },
  };
}

describe("SilverNormalizer", () => {
  const normalizer = new SilverNormalizer();

  it("dispatches market bronze records", () => {
    const result = normalizer.normalize(
      baseBronze(
        SILVER_BRONZE_CONTENT_TYPE.MARKET,
        {
          open_time: "2026-06-27T01:00:00.000Z",
          close_time: "2026-06-27T01:15:00.000Z",
          floor_strike: 59_990.31,
          event_ticker: "KXBTC15M-26JUN270115",
          status: "closed",
        },
        "market-1",
        "2026-06-27T01:15:00.000Z",
      ),
    );

    expect(marketWindowSchema.safeParse(result.record).success).toBe(true);
    expect(result.record.status).toBe("closed");
  });

  it("dispatches candle bronze records", () => {
    const result = normalizer.normalize(
      baseBronze(
        SILVER_BRONZE_CONTENT_TYPE.CANDLESTICK,
        {
          open_time: "2026-06-27T01:14:00.000Z",
          close_time: "2026-06-27T01:15:00.000Z",
          yes_bid_cents: 48,
          yes_ask_cents: 52,
          no_bid_cents: 47,
          no_ask_cents: 51,
          volume_contracts: null,
        },
        "candle-1",
        "2026-06-27T01:15:00.000Z",
      ),
    );

    expect(kalshiCandle1mSchema.safeParse(result.record).success).toBe(true);
  });

  it("dispatches settlement bronze records", () => {
    const result = normalizer.normalize(
      baseBronze(
        SILVER_BRONZE_CONTENT_TYPE.SETTLEMENT,
        {
          floor_strike: 59_990.31,
          expiration_value: "60010.25",
          result: "no",
          settlement_ts: "2026-06-27T01:20:00.000Z",
        },
        "settlement-1",
        "2026-06-27T01:20:00.000Z",
      ),
    );

    expect(settlementRecordSchema.safeParse(result.record).success).toBe(true);
    expect(result.record.result).toBe("no");
  });

  it("rejects unknown bronze content types", () => {
    expect(() =>
      normalizer.normalize(
        baseBronze("application/unknown", {}, "unknown-1", OBSERVED_AT),
      ),
    ).toThrow(SilverUnsupportedContentTypeError);
  });

  it("rejects malformed payloads through normalizeRecord", () => {
    expect(() =>
      normalizeRecord(
        baseBronze(
          SILVER_BRONZE_CONTENT_TYPE.MARKET,
          { invalid: true },
          "bad-market",
          OBSERVED_AT,
        ),
      ),
    ).toThrow(SilverMalformedPayloadError);
  });

  it("serializes normalized output deterministically", () => {
    const bronze = baseBronze(
      SILVER_BRONZE_CONTENT_TYPE.SETTLEMENT,
      {
        floor_strike: 59_990.31,
        expiration_value: "60010.25",
        result: "yes",
        settlement_ts: "2026-06-27T01:20:00.000Z",
      },
      "settlement-2",
      "2026-06-27T01:20:00.000Z",
    );

    const first = JSON.stringify(normalizer.normalize(bronze));
    const second = JSON.stringify(normalizer.normalize(bronze));
    expect(first).toBe(second);
  });

  it("rejects invalid bronze records with SilverInvalidBronzeRecordError", () => {
    expect(() =>
      normalizer.normalize({
        ...baseBronze(SILVER_BRONZE_CONTENT_TYPE.MARKET, {}, "bad-bronze", OBSERVED_AT),
        ticker: "",
      }),
    ).toThrow(SilverInvalidBronzeRecordError);
  });

  it("wraps invalid quality_flags in SilverMalformedPayloadError", () => {
    expect(() =>
      normalizer.normalize(
        baseBronze(
          SILVER_BRONZE_CONTENT_TYPE.MARKET,
          {
            open_time: "2026-06-27T01:00:00.000Z",
            close_time: "2026-06-27T01:15:00.000Z",
            floor_strike: 59_990.31,
            event_ticker: "KXBTC15M-26JUN270115",
            status: "closed",
            quality_flags: ["not-a-real-flag"],
          },
          "market-bad-flags",
          "2026-06-27T01:15:00.000Z",
        ),
      ),
    ).toThrow(SilverMalformedPayloadError);
  });

  it("exposes stable error codes", () => {
    try {
      normalizer.normalize(
        baseBronze("application/unknown", {}, "unknown-code", OBSERVED_AT),
      );
    } catch (error) {
      expect(error).toMatchObject({
        name: "SilverUnsupportedContentTypeError",
        code: "unsupported-content-type",
        recordId: "unknown-code",
      });
    }

    try {
      normalizer.normalize({
        ...baseBronze(SILVER_BRONZE_CONTENT_TYPE.MARKET, {}, "invalid-bronze", OBSERVED_AT),
        ticker: "",
      });
    } catch (error) {
      expect(error).toMatchObject({
        name: "SilverInvalidBronzeRecordError",
        code: "invalid-bronze-record",
      });
    }
  });

  it("does not mutate bronze input during normalization", () => {
    const bronze = baseBronze(
      SILVER_BRONZE_CONTENT_TYPE.MARKET,
      {
        open_time: "2026-06-27T01:00:00.000Z",
        close_time: "2026-06-27T01:15:00.000Z",
        floor_strike: 59_990.31,
        event_ticker: "KXBTC15M-26JUN270115",
        status: "closed",
      },
      "market-mutate",
      "2026-06-27T01:15:00.000Z",
    );
    const snapshot = JSON.stringify(bronze);

    normalizer.normalize(bronze);

    expect(JSON.stringify(bronze)).toBe(snapshot);
  });
});
