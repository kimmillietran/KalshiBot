import { describe, expect, it } from "vitest";

import { buildHistoricalDataset } from "@/lib/data/datasets";
import { buildHistoricalResearchFixtureFromImportResult } from "@/lib/data/importJobs/fixtureBridge";
import { DataSource } from "@/lib/data/provenance";
import { kalshiCandle1mSchema } from "@/lib/data/schemas";
import type { RawHistoricalRecord } from "@/lib/data/types";
import { DEFAULT_ENGINE_CONFIG } from "@/lib/trading/config/defaults";

import { SilverMalformedPayloadError } from "./errors";
import {
  LIVE_KALSHI_HISTORICAL_IMPORT_BRONZE_RECORDS,
  LIVE_KALSHI_HISTORICAL_IMPORT_JOB_RESULT,
} from "./fixtures/liveKalshiHistoricalImport.fixture";
import { normalizeKalshiCandle } from "./normalizeCandles";
import { SILVER_BRONZE_CONTENT_TYPE } from "./shared";

const EVENT_TIME = "2026-06-27T01:15:00.000Z";
const COLLECTION_TIME = "2026-06-27T01:00:00.000Z";
const OBSERVED_AT = "2026-06-27T01:00:05.000Z";
const OPEN_TIME = "2026-06-27T01:14:00.000Z";
const CLOSE_TIME = "2026-06-27T01:15:00.000Z";
const TICKER = "KXBTC15M-26JUN270115-15";

const LIVE_CANDLE_PAYLOAD = {
  end_period_ts: 1_777_419_060,
  open_interest: "8544.43",
  price: { close: "0.5600" },
  volume: "10443.96",
} as const;

function createCandleBronze(
  payload: Record<string, unknown>,
  options?: { recordId?: string; eventTime?: string },
): RawHistoricalRecord {
  return {
    recordId: options?.recordId ?? "bronze-candle-001",
    ticker: TICKER,
    contentType: SILVER_BRONZE_CONTENT_TYPE.CANDLESTICK,
    eventTime: options?.eventTime ?? EVENT_TIME,
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

  it("accepts live-shaped Kalshi historical candle payloads", () => {
    const result = normalizeKalshiCandle(
      createCandleBronze(LIVE_CANDLE_PAYLOAD, {
        eventTime: "2026-04-28T23:31:00.000Z",
      }),
    );

    expect(kalshiCandle1mSchema.safeParse(result.record).success).toBe(true);
    expect(result.record.openTime).toBe("2026-04-28T23:30:00.000Z");
    expect(result.record.closeTime).toBe("2026-04-28T23:31:00.000Z");
    expect(result.record.volumeContracts).toBe(10_443.96);
  });

  it("maps price.close dollar strings to contract cents", () => {
    const result = normalizeKalshiCandle(
      createCandleBronze({
        end_period_ts: 1_777_419_060,
        volume: "1",
        price: { close: "0.5600" },
      }),
    );

    expect(result.record.yesBidCents).toBe(56);
    expect(result.record.yesAskCents).toBe(56);
    expect(result.record.noBidCents).toBe(44);
    expect(result.record.noAskCents).toBe(44);
  });

  it("rejects live-shaped payloads when price.close is missing", () => {
    expect(() =>
      normalizeKalshiCandle(
        createCandleBronze({
          end_period_ts: 1_700_000_060,
          volume: "12.00",
          price: {},
        }),
      ),
    ).toThrow(SilverMalformedPayloadError);

    expect(() =>
      normalizeKalshiCandle(
        createCandleBronze({
          end_period_ts: 1_700_000_060,
          volume: "12.00",
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

  it("builds a HistoricalDataset from a live-shaped import record set", () => {
    const dataset = buildHistoricalDataset([
      ...LIVE_KALSHI_HISTORICAL_IMPORT_BRONZE_RECORDS,
    ]);

    expect(dataset.snapshots).toHaveLength(1);
    expect(dataset.snapshots[0]?.kalshiCandles).toHaveLength(2);
    expect(dataset.snapshots[0]?.kalshiCandles[0]?.yesBidCents).toBe(56);
    expect(dataset.snapshots[0]?.kalshiCandles[1]?.yesBidCents).toBe(63);
  });

  it("bridges a valid HistoricalBronzeImportJobResult to a research fixture", () => {
    const fixture = buildHistoricalResearchFixtureFromImportResult({
      importResult: LIVE_KALSHI_HISTORICAL_IMPORT_JOB_RESULT,
      strategyId: "noop",
      runId: "fixture-run-6.21b",
      durationMs: 4_000,
      initialCashCents: 100_000,
      engineConfig: DEFAULT_ENGINE_CONFIG,
    });

    expect(fixture.bronzeRecords).toHaveLength(
      LIVE_KALSHI_HISTORICAL_IMPORT_BRONZE_RECORDS.length,
    );
    expect(fixture.strategyId).toBe("noop");
    expect(fixture.runId).toBe("fixture-run-6.21b");
  });
});
