import { describe, expect, it, vi } from "vitest";

import { DataSource } from "@/lib/data/provenance";
import { rawHistoricalRecordSchema } from "@/lib/data/schemas";
import type {
  HistoricalCandlesticksResult,
  HistoricalMarketRecord,
  HistoricalSettlementResult,
} from "@/lib/data/importers/kalshi/kalshiHistoricalTypes";
import {
  eventTimeFromMarketWire,
  kalshiUnixSecondsToEventTime,
  KALSHI_BRONZE_CONTENT_TYPE,
} from "@/lib/data/importers/kalshi";
import { DATASET_BRONZE_CONTENT_TYPE } from "@/lib/data/datasets/datasetTypes";
import { validateHistoricalBronzeDataset } from "@/lib/data/datasets/validation";

import { createKalshiHistoricalBronzeProvider } from "./KalshiHistoricalBronzeProvider";
import type {
  KalshiHistoricalBronzeImporter,
  KalshiHistoricalBronzeProviderMethodInput,
} from "./kalshiHistoricalBronzeProviderTypes";

const COLLECTION_TIME = "2026-06-27T01:00:00.000Z";
const OBSERVED_AT = "2026-06-27T01:00:05.000Z";
const MARKET_TICKER = "KXBTC15M-26JUN270115-15";
const START_TIME = "2026-06-26T23:15:00.000Z";
const END_TIME = "2026-06-26T23:30:00.000Z";

const SAMPLE_MARKET: HistoricalMarketRecord = {
  ticker: MARKET_TICKER,
  eventTicker: "KXBTC15M-26JUN270115",
  status: "finalized",
  result: "yes",
  openTime: "2026-06-27T01:00:00.000Z",
  closeTime: "2026-06-27T01:15:00.000Z",
  settlementTs: "2026-06-27T01:20:00.000Z",
  settlementValueDollars: "1.0000",
  expirationValue: "60010.25",
  floorStrike: 59_990.31,
};

const SAMPLE_CANDLESTICKS: HistoricalCandlesticksResult = {
  ticker: MARKET_TICKER,
  interval: 1,
  candlesticks: [
    {
      endPeriodTs: 1_719_468_960,
      volume: "12.00",
      openInterest: "45.00",
      priceClose: "0.5200",
    },
    {
      endPeriodTs: 1_719_469_020,
      volume: "8.00",
      openInterest: "40.00",
      priceClose: "0.5400",
    },
  ],
  provenance: {
    source: "kalshi-historical-api",
    fetchedAt: COLLECTION_TIME,
    requestPath: "/historical/markets/KXBTC15M-26JUN270115-15/candlesticks",
  },
};

const SAMPLE_SETTLEMENT: HistoricalSettlementResult = {
  ticker: MARKET_TICKER,
  result: "yes",
  status: "finalized",
  settlementTs: "2026-06-27T01:20:00.000Z",
  settlementValueDollars: "1.0000",
  expirationValue: "60010.25",
  provenance: {
    source: "kalshi-historical-api",
    fetchedAt: COLLECTION_TIME,
    requestPath: `/historical/markets/${MARKET_TICKER}`,
  },
};

const LIVE_MARKET_TICKER = "KXBTC15M-26APR281945-45";

const LIVE_MARKET: HistoricalMarketRecord = {
  ticker: LIVE_MARKET_TICKER,
  eventTicker: "KXBTC15M-26APR281945",
  status: "finalized",
  result: "yes",
  openTime: "2026-04-28T23:30:00Z",
  closeTime: "2026-04-28T23:45:00Z",
  settlementTs: "2026-04-28T23:45:09.271822Z",
  settlementValueDollars: "1.0000",
  expirationValue: "76282.84",
  floorStrike: 76_266.61,
};

function providerInput(
  overrides: Partial<KalshiHistoricalBronzeProviderMethodInput> = {},
): KalshiHistoricalBronzeProviderMethodInput {
  return {
    marketTicker: MARKET_TICKER,
    startTime: START_TIME,
    endTime: END_TIME,
    collectionTime: COLLECTION_TIME,
    observedAt: OBSERVED_AT,
    ...overrides,
  };
}

function createImporter(
  overrides: Partial<KalshiHistoricalBronzeImporter> = {},
): KalshiHistoricalBronzeImporter {
  return {
    getMarketByTicker: vi.fn(() => SAMPLE_MARKET),
    getMarketCandlesticks: vi.fn(() => SAMPLE_CANDLESTICKS),
    getSettlementResult: vi.fn(() => SAMPLE_SETTLEMENT),
    ...overrides,
  };
}

function createProvider(importer: KalshiHistoricalBronzeImporter = createImporter()) {
  return createKalshiHistoricalBronzeProvider({
    importer,
    collectionTime: COLLECTION_TIME,
    observedAt: OBSERVED_AT,
  });
}

describe("createKalshiHistoricalBronzeProvider", () => {
  it("imports and maps market records", () => {
    const provider = createProvider();
    const records = provider.importKalshiMarketRecords(providerInput());

    expect(records).toHaveLength(1);
    expect(rawHistoricalRecordSchema.safeParse(records[0]).success).toBe(true);
    expect(records[0]?.contentType).toBe(KALSHI_BRONZE_CONTENT_TYPE.market);
    expect(records[0]?.ticker).toBe(MARKET_TICKER);
    expect(records[0]?.provenance.source).toBe(DataSource.KALSHI_REST);
    expect(records[0]?.collectionTime).toBe(COLLECTION_TIME);
    expect(records[0]?.observedAt).toBe(OBSERVED_AT);
  });

  it("imports and maps candle records", () => {
    const provider = createProvider();
    const records = provider.importKalshiCandleRecords(providerInput());

    expect(records).toHaveLength(2);
    expect(records.every((record) =>
      rawHistoricalRecordSchema.safeParse(record).success,
    )).toBe(true);
    expect(records[0]?.contentType).toBe(KALSHI_BRONZE_CONTENT_TYPE.candlestick);
    expect(records[0]?.provenance.source).toBe(DataSource.KALSHI_CANDLES);
    expect(records[0]?.eventTime).toBe(
      kalshiUnixSecondsToEventTime(SAMPLE_CANDLESTICKS.candlesticks[0]!.endPeriodTs),
    );
  });

  it("imports and maps settlement records", () => {
    const provider = createProvider();
    const records = provider.importKalshiSettlementRecords(providerInput());

    expect(records).toHaveLength(1);
    expect(rawHistoricalRecordSchema.safeParse(records[0]).success).toBe(true);
    expect(records[0]?.contentType).toBe(KALSHI_BRONZE_CONTENT_TYPE.settlement);
    expect(records[0]?.provenance.source).toBe(DataSource.KALSHI_REST);
    expect((records[0]?.payload as { market: unknown }).market).toBeTruthy();
  });

  it("calls the importer with the requested ticker and time range", () => {
    const importer = createImporter();
    const provider = createProvider(importer);
    const input = providerInput();

    provider.importKalshiMarketRecords(input);
    provider.importKalshiCandleRecords(input);
    provider.importKalshiSettlementRecords(input);

    const expectedDateRange = {
      startTs: Math.floor(Date.parse(START_TIME) / 1000),
      endTs: Math.floor(Date.parse(END_TIME) / 1000),
    };

    expect(importer.getMarketByTicker).toHaveBeenCalledWith(
      MARKET_TICKER,
      expectedDateRange,
    );
    expect(importer.getMarketCandlesticks).toHaveBeenCalledWith(
      MARKET_TICKER,
      expectedDateRange,
    );
    expect(importer.getSettlementResult).toHaveBeenCalledWith(MARKET_TICKER);
  });

  it("returns deterministically ordered candle records", () => {
    const shuffled: HistoricalCandlesticksResult = {
      ...SAMPLE_CANDLESTICKS,
      candlesticks: [...SAMPLE_CANDLESTICKS.candlesticks].reverse(),
    };
    const provider = createProvider(
      createImporter({
        getMarketCandlesticks: vi.fn(() => shuffled),
      }),
    );

    const records = provider.importKalshiCandleRecords(providerInput());
    const eventTimes = records.map((record) => record.eventTime);

    expect(eventTimes).toEqual([...eventTimes].sort((left, right) => left.localeCompare(right)));
    expect(records[0]?.eventTime).toBe(
      kalshiUnixSecondsToEventTime(SAMPLE_CANDLESTICKS.candlesticks[0]!.endPeriodTs),
    );
  });

  it("does not call global fetch", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const provider = createProvider();

    provider.importKalshiMarketRecords(providerInput());
    provider.importKalshiCandleRecords(providerInput());
    provider.importKalshiSettlementRecords(providerInput());

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("propagates importer errors", () => {
    const importerError = new Error("kalshi importer failed");
    const provider = createProvider(
      createImporter({
        getMarketByTicker: vi.fn(() => {
          throw importerError;
        }),
      }),
    );

    expect(() => provider.importKalshiMarketRecords(providerInput())).toThrow(importerError);
  });

  it("returns an empty array when the importer has no market data", () => {
    const provider = createProvider(
      createImporter({
        getMarketByTicker: vi.fn(() => null),
      }),
    );

    expect(provider.importKalshiMarketRecords(providerInput())).toEqual([]);
  });

  it("returns an empty array when settlement data is unavailable", () => {
    const provider = createProvider(
      createImporter({
        getSettlementResult: vi.fn(() => null),
      }),
    );

    expect(provider.importKalshiSettlementRecords(providerInput())).toEqual([]);
  });

  it("propagates mapper errors for malformed importer responses", () => {
    const provider = createProvider(
      createImporter({
        getMarketByTicker: vi.fn(() => ({
          ...SAMPLE_MARKET,
          closeTime: "",
        })),
      }),
    );

    expect(() => provider.importKalshiMarketRecords(providerInput())).toThrow(
      /missing required fields/i,
    );
  });

  it("does not mutate provider input", () => {
    const provider = createProvider();
    const input = providerInput();
    const snapshot = structuredClone(input);

    provider.importKalshiMarketRecords(input);
    provider.importKalshiCandleRecords(input);
    provider.importKalshiSettlementRecords(input);

    expect(input).toEqual(snapshot);
  });

  it("produces identical output for identical mocked importer responses", () => {
    const importer = createImporter();
    const first = createProvider(importer);
    const second = createProvider(importer);
    const input = providerInput();

    const firstMarket = first.importKalshiMarketRecords(input);
    const secondMarket = second.importKalshiMarketRecords(input);

    expect(secondMarket.map((record) => record.recordId)).toEqual(
      firstMarket.map((record) => record.recordId),
    );
    expect(firstMarket[0]?.eventTime).toBe(
      eventTimeFromMarketWire((firstMarket[0]?.payload as {
        settlement_ts?: string | null;
        close_time: string;
      })),
    );
  });

  it("preserves live-shaped market payload fields required by bronze validation", () => {
    const provider = createProvider(
      createImporter({
        getMarketByTicker: vi.fn(() => LIVE_MARKET),
      }),
    );
    const records = provider.importKalshiMarketRecords(
      providerInput({ marketTicker: LIVE_MARKET_TICKER }),
    );

    expect(records).toHaveLength(1);
    expect(records[0]?.contentType).toBe(KALSHI_BRONZE_CONTENT_TYPE.market);
    expect(records[0]?.ticker).toBe(LIVE_MARKET_TICKER);
    expect(records[0]?.eventTime).toBe("2026-04-28T23:45:09.271Z");
    expect(rawHistoricalRecordSchema.safeParse(records[0]).success).toBe(true);

    const payload = records[0]?.payload as Record<string, unknown>;
    expect(payload.open_time).toBe("2026-04-28T23:30:00Z");
    expect(payload.close_time).toBe("2026-04-28T23:45:00Z");
    expect(payload.floor_strike).toBe(76_266.61);
  });

  it("passes validateHistoricalBronzeDataset for a complete live-shaped import set", () => {
    const provider = createProvider(
      createImporter({
        getMarketByTicker: vi.fn(() => LIVE_MARKET),
      }),
    );
    const input = providerInput({ marketTicker: LIVE_MARKET_TICKER });
    const marketRecords = provider.importKalshiMarketRecords(input);
    const candleRecords = provider.importKalshiCandleRecords(input);
    const settlementRecords = provider.importKalshiSettlementRecords(input);

    const btcBar = {
      recordId: "live-btc",
      ticker: LIVE_MARKET_TICKER,
      contentType: DATASET_BRONZE_CONTENT_TYPE.BTC_KLINE,
      eventTime: START_TIME,
      collectionTime: COLLECTION_TIME,
      observedAt: OBSERVED_AT,
      payload: {
        open_time: START_TIME,
        close_time: END_TIME,
        open_usd: 76_250.5,
        high_usd: 76_290.25,
        low_usd: 76_240.0,
        close_usd: 76_282.84,
        volume_btc: 8.5,
      },
      provenance: {
        source: DataSource.COINBASE_SPOT,
        collectionTime: COLLECTION_TIME,
        observedAt: OBSERVED_AT,
        fetchId: "coinbase-candles",
      },
    };

    const validationResult = validateHistoricalBronzeDataset([
      ...marketRecords,
      ...candleRecords,
      ...settlementRecords,
      btcBar,
    ]);

    expect(
      validationResult.errors.some(
        (issue) =>
          issue.message ===
          "market payload requires open_time, close_time, and floor_strike",
      ),
    ).toBe(false);
    expect(validationResult.valid).toBe(true);
  });
});
