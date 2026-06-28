import { describe, expect, it, vi } from "vitest";

import type { HistoricalImporter } from "@/lib/data/importers/kalshi";
import type {
  HistoricalCandlesticksResult,
  HistoricalMarketRecord,
  HistoricalMarketsPage,
  HistoricalSettlementResult,
} from "@/lib/data/importers/kalshi/kalshiHistoricalTypes";
import { rawHistoricalRecordSchema } from "@/lib/data/schemas";

import {
  createPrefetchedKalshiHistoricalBronzeProvider,
  prefetchKalshiHistoricalBronzeImporter,
} from "./KalshiHistoricalPrefetchAdapter";
import type { PrefetchKalshiHistoricalBronzeImporterInput } from "./kalshiPrefetchAdapterTypes";

const MARKET_TICKER = "KXBTC15M-26JUN270115-15";
const START_TIME = "2026-06-26T23:15:00.000Z";
const END_TIME = "2026-06-26T23:30:00.000Z";
const COLLECTION_TIME = "2026-06-27T01:00:00.000Z";
const OBSERVED_AT = "2026-06-27T01:00:05.000Z";

const EXPECTED_DATE_RANGE = {
  startTs: Math.floor(Date.parse(START_TIME) / 1000),
  endTs: Math.floor(Date.parse(END_TIME) / 1000),
};

const SAMPLE_MARKET: HistoricalMarketRecord = {
  ticker: MARKET_TICKER,
  eventTicker: "KXBTC15M-26JUN270115",
  status: "finalized",
  result: "yes",
  closeTime: "2026-06-27T01:15:00.000Z",
  settlementTs: "2026-06-27T01:20:00.000Z",
  settlementValueDollars: "1.0000",
  expirationValue: "60010.25",
  floorStrike: 59_990.31,
};

const SAMPLE_MARKETS_PAGE: HistoricalMarketsPage = {
  markets: [SAMPLE_MARKET],
  cursor: "",
  provenance: {
    source: "kalshi-historical-api",
    fetchedAt: COLLECTION_TIME,
    requestPath: "/historical/markets?series_ticker=KXBTC15M",
  },
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
  ],
  provenance: {
    source: "kalshi-historical-api",
    fetchedAt: COLLECTION_TIME,
    requestPath: `/historical/markets/${MARKET_TICKER}/candlesticks`,
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

function prefetchInput(
  overrides: Partial<PrefetchKalshiHistoricalBronzeImporterInput> = {},
): PrefetchKalshiHistoricalBronzeImporterInput {
  return {
    importer: createImporter(),
    marketTicker: MARKET_TICKER,
    startTime: START_TIME,
    endTime: END_TIME,
    ...overrides,
  };
}

function createImporter(
  overrides: Partial<HistoricalImporter> = {},
): HistoricalImporter {
  return {
    listHistoricalMarkets: vi.fn(async () => SAMPLE_MARKETS_PAGE),
    getMarketCandlesticks: vi.fn(async () => SAMPLE_CANDLESTICKS),
    getHistoricalTrades: vi.fn(async () => ({
      trades: [],
      cursor: "",
      provenance: SAMPLE_MARKETS_PAGE.provenance,
    })),
    getHistoricalCutoff: vi.fn(async () => ({
      marketSettledTs: COLLECTION_TIME,
      tradesCreatedTs: COLLECTION_TIME,
      ordersUpdatedTs: COLLECTION_TIME,
      provenance: SAMPLE_MARKETS_PAGE.provenance,
    })),
    getSettlementResult: vi.fn(async () => SAMPLE_SETTLEMENT),
    ...overrides,
  };
}

describe("prefetchKalshiHistoricalBronzeImporter", () => {
  it("prefetches market, candles, and settlement once each", async () => {
    const importer = createImporter();
    await prefetchKalshiHistoricalBronzeImporter(prefetchInput({ importer }));

    expect(importer.listHistoricalMarkets).toHaveBeenCalledTimes(1);
    expect(importer.listHistoricalMarkets).toHaveBeenCalledWith(
      "KXBTC15M",
      EXPECTED_DATE_RANGE,
    );
    expect(importer.getMarketCandlesticks).toHaveBeenCalledTimes(1);
    expect(importer.getMarketCandlesticks).toHaveBeenCalledWith(
      MARKET_TICKER,
      1,
      EXPECTED_DATE_RANGE,
    );
    expect(importer.getSettlementResult).toHaveBeenCalledTimes(1);
    expect(importer.getSettlementResult).toHaveBeenCalledWith(MARKET_TICKER);
  });

  it("returned sync port serves prefetched market", async () => {
    const syncImporter = await prefetchKalshiHistoricalBronzeImporter(prefetchInput());

    expect(syncImporter.getMarketByTicker(MARKET_TICKER, EXPECTED_DATE_RANGE)).toEqual(
      SAMPLE_MARKET,
    );
  });

  it("returned sync port serves prefetched candles", async () => {
    const syncImporter = await prefetchKalshiHistoricalBronzeImporter(prefetchInput());

    expect(syncImporter.getMarketCandlesticks(MARKET_TICKER, EXPECTED_DATE_RANGE)).toEqual(
      SAMPLE_CANDLESTICKS,
    );
  });

  it("returned sync port serves prefetched settlement", async () => {
    const syncImporter = await prefetchKalshiHistoricalBronzeImporter(prefetchInput());

    expect(syncImporter.getSettlementResult(MARKET_TICKER)).toEqual(SAMPLE_SETTLEMENT);
  });

  it("creates KalshiHistoricalBronzeProvider from prefetched importer", async () => {
    const provider = await createPrefetchedKalshiHistoricalBronzeProvider({
      importer: createImporter(),
      marketTicker: MARKET_TICKER,
      startTime: START_TIME,
      endTime: END_TIME,
      collectionTime: COLLECTION_TIME,
      observedAt: OBSERVED_AT,
    });

    const records = provider.importKalshiMarketRecords({
      marketTicker: MARKET_TICKER,
      startTime: START_TIME,
      endTime: END_TIME,
      collectionTime: COLLECTION_TIME,
      observedAt: OBSERVED_AT,
    });

    expect(records).toHaveLength(1);
    expect(rawHistoricalRecordSchema.safeParse(records[0]).success).toBe(true);
  });

  it("propagates importer errors", async () => {
    const importerError = new Error("kalshi importer failed");

    await expect(
      prefetchKalshiHistoricalBronzeImporter(
        prefetchInput({
          importer: createImporter({
            getMarketCandlesticks: vi.fn(async () => {
              throw importerError;
            }),
          }),
        }),
      ),
    ).rejects.toThrow(importerError);
  });

  it("returns null when the markets page has no matching ticker", async () => {
    const syncImporter = await prefetchKalshiHistoricalBronzeImporter(
      prefetchInput({
        importer: createImporter({
          listHistoricalMarkets: vi.fn(async () => ({
            ...SAMPLE_MARKETS_PAGE,
            markets: [],
          })),
        }),
      }),
    );

    expect(syncImporter.getMarketByTicker(MARKET_TICKER, EXPECTED_DATE_RANGE)).toBeNull();
  });

  it("returns null when settlement data is empty", async () => {
    const syncImporter = await prefetchKalshiHistoricalBronzeImporter(
      prefetchInput({
        importer: createImporter({
          getSettlementResult: vi.fn(async () => ({
            ...SAMPLE_SETTLEMENT,
            settlementTs: "",
            expirationValue: "",
          })),
        }),
      }),
    );

    expect(syncImporter.getSettlementResult(MARKET_TICKER)).toBeNull();
  });

  it("returns deterministic results on repeated sync reads", async () => {
    const syncImporter = await prefetchKalshiHistoricalBronzeImporter(prefetchInput());

    const firstMarket = syncImporter.getMarketByTicker(MARKET_TICKER, EXPECTED_DATE_RANGE);
    const secondMarket = syncImporter.getMarketByTicker(MARKET_TICKER, EXPECTED_DATE_RANGE);
    const firstCandles = syncImporter.getMarketCandlesticks(MARKET_TICKER, EXPECTED_DATE_RANGE);
    const secondCandles = syncImporter.getMarketCandlesticks(MARKET_TICKER, EXPECTED_DATE_RANGE);
    const firstSettlement = syncImporter.getSettlementResult(MARKET_TICKER);
    const secondSettlement = syncImporter.getSettlementResult(MARKET_TICKER);

    expect(secondMarket).toEqual(firstMarket);
    expect(secondCandles).toEqual(firstCandles);
    expect(secondSettlement).toEqual(firstSettlement);
  });

  it("keeps prefetched state immutable", async () => {
    const syncImporter = await prefetchKalshiHistoricalBronzeImporter(prefetchInput());

    const market = syncImporter.getMarketByTicker(MARKET_TICKER, EXPECTED_DATE_RANGE);
    const candles = syncImporter.getMarketCandlesticks(MARKET_TICKER, EXPECTED_DATE_RANGE);
    const settlement = syncImporter.getSettlementResult(MARKET_TICKER);

    expect(Object.isFrozen(market)).toBe(true);
    expect(Object.isFrozen(candles)).toBe(true);
    expect(Object.isFrozen(candles.candlesticks)).toBe(true);
    expect(Object.isFrozen(settlement)).toBe(true);

    const marketSnapshot = structuredClone(market);
    const candlesSnapshot = structuredClone(candles);
    const settlementSnapshot = structuredClone(settlement);

    expect(() => {
      (market as HistoricalMarketRecord).status = "mutated";
    }).toThrow();

    expect(() => {
      (candles.candlesticks as HistoricalCandlesticksResult["candlesticks"]).push({
        endPeriodTs: 1,
        volume: "1",
        openInterest: "1",
        priceClose: "1",
      });
    }).toThrow();

    expect(() => {
      (settlement as HistoricalSettlementResult).result = "mutated";
    }).toThrow();

    expect(syncImporter.getMarketByTicker(MARKET_TICKER, EXPECTED_DATE_RANGE)).toEqual(
      marketSnapshot,
    );
    expect(syncImporter.getMarketCandlesticks(MARKET_TICKER, EXPECTED_DATE_RANGE)).toEqual(
      candlesSnapshot,
    );
    expect(syncImporter.getSettlementResult(MARKET_TICKER)).toEqual(settlementSnapshot);
  });

  it("does not mutate prefetch input", async () => {
    const importer = createImporter();
    const input = prefetchInput({ importer });
    const snapshot = {
      marketTicker: input.marketTicker,
      startTime: input.startTime,
      endTime: input.endTime,
    };

    await prefetchKalshiHistoricalBronzeImporter(input);

    expect({
      marketTicker: input.marketTicker,
      startTime: input.startTime,
      endTime: input.endTime,
    }).toEqual(snapshot);
  });

  it("does not call global fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await prefetchKalshiHistoricalBronzeImporter(prefetchInput());

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
