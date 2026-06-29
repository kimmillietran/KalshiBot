import { describe, expect, it, vi } from "vitest";

import { DATASET_BRONZE_CONTENT_TYPE } from "@/lib/data/datasets/datasetTypes";
import { DataSource } from "@/lib/data/provenance";
import type {
  HistoricalCandlesticksResult,
  HistoricalMarketRecord,
  HistoricalSettlementResult,
} from "@/lib/data/importers/kalshi/kalshiHistoricalTypes";

import { runHistoricalBronzeImportJob } from "../../HistoricalBronzeImportJob";
import type {
  BtcHistoricalBronzeProvider,
  KalshiHistoricalBronzeProvider,
} from "../../historicalBronzeImportJobTypes";

import { createKalshiHistoricalBronzeProvider } from "./KalshiHistoricalBronzeProvider";

const COLLECTION_TIME = "2026-06-27T01:00:00.000Z";
const OBSERVED_AT = "2026-06-27T01:00:05.000Z";
const JOB_ID = "import-job-live-kalshi-market";
const MARKET_TICKER = "KXBTC15M-26APR281945-45";
const START_TIME = "2026-04-28T23:30:00.000Z";
const END_TIME = "2026-04-28T23:45:00.000Z";

const LIVE_MARKET: HistoricalMarketRecord = {
  ticker: MARKET_TICKER,
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

const LIVE_CANDLESTICKS: HistoricalCandlesticksResult = {
  ticker: MARKET_TICKER,
  interval: 1,
  candlesticks: [
    {
      endPeriodTs: Math.floor(Date.parse(END_TIME) / 1000),
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

const LIVE_SETTLEMENT: HistoricalSettlementResult = {
  ticker: MARKET_TICKER,
  result: "yes",
  status: "finalized",
  settlementTs: "2026-04-28T23:45:09.271822Z",
  settlementValueDollars: "1.0000",
  expirationValue: "76282.84",
  provenance: {
    source: "kalshi-historical-api",
    fetchedAt: COLLECTION_TIME,
    requestPath: `/historical/markets/${MARKET_TICKER}`,
  },
};

function createLiveKalshiProvider(): KalshiHistoricalBronzeProvider {
  return createKalshiHistoricalBronzeProvider({
    importer: {
      getMarketByTicker: vi.fn(() => LIVE_MARKET),
      getMarketCandlesticks: vi.fn(() => LIVE_CANDLESTICKS),
      getSettlementResult: vi.fn(() => LIVE_SETTLEMENT),
    },
    collectionTime: COLLECTION_TIME,
    observedAt: OBSERVED_AT,
  });
}

function createCoinbaseStyleBtcProvider(): BtcHistoricalBronzeProvider {
  return {
    importBtcKlineRecords: vi.fn(() => [
      {
        recordId: "live-coinbase-btc",
        ticker: MARKET_TICKER,
        contentType: DATASET_BRONZE_CONTENT_TYPE.BTC_KLINE,
        eventTime: END_TIME,
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
      },
    ]),
  };
}

describe("kalshi live-shaped market bronze import", () => {
  it("produces a valid bronze import job result with Coinbase-style BTC bars", () => {
    const result = runHistoricalBronzeImportJob({
      jobId: JOB_ID,
      marketTicker: MARKET_TICKER,
      startTime: START_TIME,
      endTime: END_TIME,
      collectionTime: COLLECTION_TIME,
      observedAt: OBSERVED_AT,
      kalshiProvider: createLiveKalshiProvider(),
      btcProvider: createCoinbaseStyleBtcProvider(),
    });

    const marketRecord = result.bronzeRecords.find(
      (record) => record.contentType === "kalshi.historical.market",
    );
    const payload = marketRecord?.payload as Record<string, unknown>;

    expect(marketRecord?.eventTime).toBe("2026-04-28T23:45:09.271Z");
    expect(payload.open_time).toBe("2026-04-28T23:30:00Z");
    expect(payload.close_time).toBe("2026-04-28T23:45:00Z");
    expect(payload.floor_strike).toBe(76_266.61);
    expect(result.validationResult.valid).toBe(true);
    expect(result.validationResult.errors).toHaveLength(0);
  });
});
