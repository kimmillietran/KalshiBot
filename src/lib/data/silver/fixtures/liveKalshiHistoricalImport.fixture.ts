import { DataSource } from "@/lib/data/provenance";
import type { HistoricalBronzeImportJobResult } from "@/lib/data/importJobs/historicalBronzeImportJobTypes";
import type { RawHistoricalRecord } from "@/lib/data/types";

/** Live-shaped bronze records captured from a real historical import run. */
export const LIVE_KALSHI_HISTORICAL_IMPORT_BRONZE_RECORDS = [
  {
    collectionTime: "2026-04-28T23:45:10.000Z",
    contentType: "binance.historical.kline",
    eventTime: "2026-04-28T23:30:59.999Z",
    observedAt: "2026-04-28T23:45:10.000Z",
    payload: {
      close_time: "2026-04-28T23:30:59.999Z",
      close_usd: 76_275,
      high_usd: 76_280,
      low_usd: 76_265.99,
      open_time: "2026-04-28T23:30:00.000Z",
      open_usd: 76_266,
      volume_btc: 1.11211768,
    },
    provenance: {
      collectionTime: "2026-04-28T23:45:10.000Z",
      fetchId:
        "btc-import-KXBTC15M-26APR281945-45-2026-04-28T23:30:59.999Z",
      observedAt: "2026-04-28T23:45:10.000Z",
      source: DataSource.COINBASE_SPOT,
    },
    recordId: "btc-bronze-21ffff77",
    ticker: "KXBTC15M-26APR281945-45",
  },
  {
    collectionTime: "2026-04-28T23:45:10.000Z",
    contentType: "kalshi.historical.candlestick",
    eventTime: "2026-04-28T23:31:00.000Z",
    observedAt: "2026-04-28T23:45:10.000Z",
    payload: {
      end_period_ts: 1_777_419_060,
      open_interest: "8544.43",
      price: { close: "0.5600" },
      volume: "10443.96",
    },
    provenance: {
      apiVersion: "kalshi-trade-api-v2",
      collectionTime: "2026-04-28T23:45:10.000Z",
      fetchId:
        "/historical/markets/KXBTC15M-26APR281945-45/candlesticks?period_interval=1&start_ts=1777419000&end_ts=1777419900",
      observedAt: "2026-04-28T23:45:10.000Z",
      source: DataSource.KALSHI_CANDLES,
    },
    recordId: "kalshi-bronze-98f5cb68",
    ticker: "KXBTC15M-26APR281945-45",
  },
  {
    collectionTime: "2026-04-28T23:45:10.000Z",
    contentType: "binance.historical.kline",
    eventTime: "2026-04-28T23:31:59.999Z",
    observedAt: "2026-04-28T23:45:10.000Z",
    payload: {
      close_time: "2026-04-28T23:31:59.999Z",
      close_usd: 76_284,
      high_usd: 76_284,
      low_usd: 76_274.99,
      open_time: "2026-04-28T23:31:00.000Z",
      open_usd: 76_274.99,
      volume_btc: 2.25411158,
    },
    provenance: {
      collectionTime: "2026-04-28T23:45:10.000Z",
      fetchId:
        "btc-import-KXBTC15M-26APR281945-45-2026-04-28T23:31:59.999Z",
      observedAt: "2026-04-28T23:45:10.000Z",
      source: DataSource.COINBASE_SPOT,
    },
    recordId: "btc-bronze-83929064",
    ticker: "KXBTC15M-26APR281945-45",
  },
  {
    collectionTime: "2026-04-28T23:45:10.000Z",
    contentType: "kalshi.historical.candlestick",
    eventTime: "2026-04-28T23:32:00.000Z",
    observedAt: "2026-04-28T23:45:10.000Z",
    payload: {
      end_period_ts: 1_777_419_120,
      open_interest: "16301.18",
      price: { close: "0.6300" },
      volume: "11032.51",
    },
    provenance: {
      apiVersion: "kalshi-trade-api-v2",
      collectionTime: "2026-04-28T23:45:10.000Z",
      fetchId:
        "/historical/markets/KXBTC15M-26APR281945-45/candlesticks?period_interval=1&start_ts=1777419000&end_ts=1777419900",
      observedAt: "2026-04-28T23:45:10.000Z",
      source: DataSource.KALSHI_CANDLES,
    },
    recordId: "kalshi-bronze-776e3f88",
    ticker: "KXBTC15M-26APR281945-45",
  },
  {
    collectionTime: "2026-04-28T23:45:10.000Z",
    contentType: "kalshi.historical.market",
    eventTime: "2026-04-28T23:45:09.271Z",
    observedAt: "2026-04-28T23:45:10.000Z",
    payload: {
      close_time: "2026-04-28T23:45:00Z",
      event_ticker: "KXBTC15M-26APR281945",
      expiration_value: "76282.84",
      floor_strike: 76_266.61,
      open_time: "2026-04-28T23:30:00Z",
      result: "yes",
      settlement_ts: "2026-04-28T23:45:09.271822Z",
      settlement_value_dollars: "1.0000",
      status: "finalized",
      ticker: "KXBTC15M-26APR281945-45",
    },
    provenance: {
      apiVersion: "kalshi-trade-api-v2",
      collectionTime: "2026-04-28T23:45:10.000Z",
      fetchId: "/historical/markets/KXBTC15M-26APR281945-45",
      observedAt: "2026-04-28T23:45:10.000Z",
      source: DataSource.KALSHI_REST,
    },
    recordId: "kalshi-bronze-9b290e42",
    ticker: "KXBTC15M-26APR281945-45",
  },
] as RawHistoricalRecord[];

export const LIVE_KALSHI_HISTORICAL_IMPORT_JOB_RESULT: HistoricalBronzeImportJobResult = {
  bronzeRecords: LIVE_KALSHI_HISTORICAL_IMPORT_BRONZE_RECORDS,
  jobId: "import-job-001",
  metadata: {
    bronzeRecordCount: LIVE_KALSHI_HISTORICAL_IMPORT_BRONZE_RECORDS.length,
    collectionTime: "2026-04-28T23:45:10.000Z",
    endTime: "2026-04-28T23:45:00.000Z",
    jobId: "import-job-001",
    marketTicker: "KXBTC15M-26APR281945-45",
    observedAt: "2026-04-28T23:45:10.000Z",
    startTime: "2026-04-28T23:30:00.000Z",
    valid: true,
  },
  validationResult: {
    errors: [],
    statistics: {
      btcBarCount: 2,
      duplicateCount: 0,
      marketCount: 1,
      settlementCount: 0,
      totalRecords: LIVE_KALSHI_HISTORICAL_IMPORT_BRONZE_RECORDS.length,
    },
    valid: true,
    warnings: [],
  },
  serialized: "{}",
};
