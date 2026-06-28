import { describe, expect, it, vi } from "vitest";

import { DataSource } from "@/lib/data/provenance";
import { SILVER_BRONZE_CONTENT_TYPE } from "@/lib/data/silver";
import type { RawHistoricalRecord } from "@/lib/data/types";

import { DATASET_BRONZE_CONTENT_TYPE } from "../../datasets/datasetTypes";
import { HistoricalBronzeValidationErrorCode } from "../../datasets/validation";
import {
  buildHistoricalBronzeImportConfig,
  HistoricalBronzeImportBtcInterval,
  HistoricalBronzeImportBtcProvider,
  HistoricalBronzeImportKalshiSource,
  HistoricalBronzeImportOutputFormat,
} from "../config";
import type {
  BtcHistoricalBronzeProvider,
  KalshiHistoricalBronzeProvider,
} from "../historicalBronzeImportJobTypes";
import { runConfiguredHistoricalBronzeImport } from "./HistoricalImportHarness";

const COLLECTION_TIME = "2026-06-27T01:00:00.000Z";
const OBSERVED_AT = "2026-06-27T01:00:05.000Z";
const JOB_ID = "import-job-harness";
const MARKET_TICKER = "KXBTC15M-HARNESS";
const START_TIME = "2026-06-26T23:15:00.000Z";
const END_TIME = "2026-06-26T23:30:00.000Z";
const WINDOW_CLOSE = "2026-06-26T23:30:00.000Z";

function baseBronze(
  contentType: string,
  payload: Record<string, unknown>,
  options: {
    recordId: string;
    ticker: string;
    eventTime: string;
    source?: (typeof DataSource)[keyof typeof DataSource];
  },
): RawHistoricalRecord {
  return {
    recordId: options.recordId,
    ticker: options.ticker,
    contentType,
    eventTime: options.eventTime,
    collectionTime: COLLECTION_TIME,
    observedAt: OBSERVED_AT,
    payload,
    provenance: {
      source: options.source ?? DataSource.KALSHI_REST,
      collectionTime: COLLECTION_TIME,
      observedAt: OBSERVED_AT,
      fetchId: `fetch-${options.recordId}`,
    },
  };
}

function completeMarketRecords(
  ticker: string,
  eventTime: string,
  windowClose: string,
  idPrefix: string,
): {
  market: RawHistoricalRecord;
  candle: RawHistoricalRecord;
  btc: RawHistoricalRecord;
  settlement: RawHistoricalRecord;
} {
  const openTime = eventTime;
  const closeTime = new Date(Date.parse(eventTime) + 60_000).toISOString();

  return {
    market: baseBronze(
      SILVER_BRONZE_CONTENT_TYPE.MARKET,
      {
        open_time: eventTime,
        close_time: windowClose,
        floor_strike: 59_990.31,
        event_ticker: `${ticker.split("-")[0]}-EVENT`,
        status: "closed",
      },
      { recordId: `${idPrefix}-market`, ticker, eventTime },
    ),
    candle: baseBronze(
      SILVER_BRONZE_CONTENT_TYPE.CANDLESTICK,
      {
        open_time: openTime,
        close_time: closeTime,
        yes_bid_cents: 48,
        yes_ask_cents: 52,
        no_bid_cents: 47,
        no_ask_cents: 51,
        volume_contracts: 120,
      },
      {
        recordId: `${idPrefix}-candle`,
        ticker,
        eventTime: closeTime,
        source: DataSource.KALSHI_CANDLES,
      },
    ),
    btc: baseBronze(
      DATASET_BRONZE_CONTENT_TYPE.BTC_KLINE,
      {
        open_time: openTime,
        close_time: closeTime,
        open_usd: 59_980.5,
        high_usd: 60_010.25,
        low_usd: 59_960.0,
        close_usd: 59_995.75,
        volume_btc: 12.5,
      },
      {
        recordId: `${idPrefix}-btc`,
        ticker,
        eventTime: closeTime,
        source: DataSource.BINANCE_SPOT,
      },
    ),
    settlement: baseBronze(
      SILVER_BRONZE_CONTENT_TYPE.SETTLEMENT,
      {
        floor_strike: 59_990.31,
        expiration_value: "60010.25",
        result: "yes",
        settlement_ts: windowClose,
      },
      { recordId: `${idPrefix}-settlement`, ticker, eventTime },
    ),
  };
}

function buildConfig() {
  return buildHistoricalBronzeImportConfig({
    jobId: JOB_ID,
    marketTicker: MARKET_TICKER,
    startTime: START_TIME,
    endTime: END_TIME,
    collectionTime: COLLECTION_TIME,
    observedAt: OBSERVED_AT,
    kalshi: {
      marketSource: HistoricalBronzeImportKalshiSource.KALSHI_REST,
      candleSource: HistoricalBronzeImportKalshiSource.KALSHI_CANDLES,
      settlementSource: HistoricalBronzeImportKalshiSource.KALSHI_REST,
    },
    btc: {
      provider: HistoricalBronzeImportBtcProvider.BINANCE_SPOT,
      symbol: "BTCUSDT",
      interval: HistoricalBronzeImportBtcInterval.ONE_MINUTE,
    },
    output: {
      format: HistoricalBronzeImportOutputFormat.JSON,
      includeValidationReport: true,
      includeFixture: false,
    },
  });
}

function createProviders(
  records: ReturnType<typeof completeMarketRecords>,
): {
  kalshiProvider: KalshiHistoricalBronzeProvider;
  btcProvider: BtcHistoricalBronzeProvider;
} {
  return {
    kalshiProvider: {
      importKalshiMarketRecords: vi.fn(() => [records.market]),
      importKalshiCandleRecords: vi.fn(() => [records.candle]),
      importKalshiSettlementRecords: vi.fn(() => [records.settlement]),
    },
    btcProvider: {
      importBtcKlineRecords: vi.fn(() => [records.btc]),
    },
  };
}

function snapshotConfig(config: ReturnType<typeof buildConfig>): string {
  return JSON.stringify({
    jobId: config.jobId,
    marketTicker: config.marketTicker,
    startTime: config.startTime,
    endTime: config.endTime,
    collectionTime: config.collectionTime,
    observedAt: config.observedAt,
    kalshi: config.kalshi,
    btc: config.btc,
    output: config.output,
    metadata: config.metadata,
  });
}

describe("runConfiguredHistoricalBronzeImport", () => {
  it("runs a happy-path import from config and providers", () => {
    const config = buildConfig();
    const records = completeMarketRecords(
      MARKET_TICKER,
      START_TIME,
      WINDOW_CLOSE,
      "happy",
    );
    const { kalshiProvider, btcProvider } = createProviders(records);

    const result = runConfiguredHistoricalBronzeImport({
      config,
      kalshiProvider,
      btcProvider,
    });

    expect(result.jobId).toBe(JOB_ID);
    expect(result.validationResult.valid).toBe(true);
    expect(result.bronzeRecords).toHaveLength(4);
    expect(result.metadata.valid).toBe(true);
  });

  it("passes config fields through to the import job", () => {
    const config = buildConfig();
    const records = completeMarketRecords(
      MARKET_TICKER,
      START_TIME,
      WINDOW_CLOSE,
      "fields",
    );
    const { kalshiProvider, btcProvider } = createProviders(records);

    const result = runConfiguredHistoricalBronzeImport({
      config,
      kalshiProvider,
      btcProvider,
    });

    expect(result.metadata).toEqual({
      jobId: JOB_ID,
      marketTicker: MARKET_TICKER,
      startTime: START_TIME,
      endTime: END_TIME,
      collectionTime: COLLECTION_TIME,
      observedAt: OBSERVED_AT,
      bronzeRecordCount: 4,
      valid: true,
    });

    const providerInput = {
      marketTicker: MARKET_TICKER,
      startTime: START_TIME,
      endTime: END_TIME,
      collectionTime: COLLECTION_TIME,
      observedAt: OBSERVED_AT,
    };

    expect(kalshiProvider.importKalshiMarketRecords).toHaveBeenCalledWith(
      providerInput,
    );
    expect(kalshiProvider.importKalshiCandleRecords).toHaveBeenCalledWith(
      providerInput,
    );
    expect(kalshiProvider.importKalshiSettlementRecords).toHaveBeenCalledWith(
      providerInput,
    );
    expect(btcProvider.importBtcKlineRecords).toHaveBeenCalledWith(providerInput);
  });

  it("preserves provider bronze outputs through the import job", () => {
    const config = buildConfig();
    const records = completeMarketRecords(
      MARKET_TICKER,
      START_TIME,
      WINDOW_CLOSE,
      "preserve",
    );
    const { kalshiProvider, btcProvider } = createProviders(records);

    const result = runConfiguredHistoricalBronzeImport({
      config,
      kalshiProvider,
      btcProvider,
    });

    expect(result.bronzeRecords.map((record) => record.recordId).sort()).toEqual(
      [
        records.btc.recordId,
        records.candle.recordId,
        records.market.recordId,
        records.settlement.recordId,
      ].sort(),
    );
  });

  it("preserves invalid validation results from incomplete provider output", () => {
    const config = buildConfig();
    const records = completeMarketRecords(
      MARKET_TICKER,
      START_TIME,
      WINDOW_CLOSE,
      "invalid",
    );
    const kalshiProvider: KalshiHistoricalBronzeProvider = {
      importKalshiMarketRecords: vi.fn(() => [records.market]),
      importKalshiCandleRecords: vi.fn(() => []),
      importKalshiSettlementRecords: vi.fn(() => []),
    };
    const btcProvider: BtcHistoricalBronzeProvider = {
      importBtcKlineRecords: vi.fn(() => []),
    };

    const result = runConfiguredHistoricalBronzeImport({
      config,
      kalshiProvider,
      btcProvider,
    });

    expect(result.validationResult.valid).toBe(false);
    expect(result.metadata.valid).toBe(false);
    expect(
      result.validationResult.errors.some(
        (issue) =>
          issue.errorCode ===
          HistoricalBronzeValidationErrorCode.INCOMPLETE_MARKET_GROUP,
      ),
    ).toBe(true);
  });

  it("propagates provider errors", () => {
    const config = buildConfig();
    const kalshiProvider: KalshiHistoricalBronzeProvider = {
      importKalshiMarketRecords: vi.fn(() => {
        throw new Error("kalshi provider failed");
      }),
      importKalshiCandleRecords: vi.fn(() => []),
      importKalshiSettlementRecords: vi.fn(() => []),
    };
    const btcProvider: BtcHistoricalBronzeProvider = {
      importBtcKlineRecords: vi.fn(() => []),
    };

    expect(() =>
      runConfiguredHistoricalBronzeImport({
        config,
        kalshiProvider,
        btcProvider,
      }),
    ).toThrow("kalshi provider failed");
  });

  it("returns deterministic serialization", () => {
    const config = buildConfig();
    const records = completeMarketRecords(
      MARKET_TICKER,
      START_TIME,
      WINDOW_CLOSE,
      "serialize",
    );
    const { kalshiProvider, btcProvider } = createProviders(records);

    const first = runConfiguredHistoricalBronzeImport({
      config,
      kalshiProvider,
      btcProvider,
    });
    const second = runConfiguredHistoricalBronzeImport({
      config,
      kalshiProvider: createProviders(records).kalshiProvider,
      btcProvider: createProviders(records).btcProvider,
    });

    expect(first.serialized).toBe(second.serialized);
  });

  it("returns deeply frozen output", () => {
    const config = buildConfig();
    const records = completeMarketRecords(
      MARKET_TICKER,
      START_TIME,
      WINDOW_CLOSE,
      "frozen",
    );
    const { kalshiProvider, btcProvider } = createProviders(records);

    const result = runConfiguredHistoricalBronzeImport({
      config,
      kalshiProvider,
      btcProvider,
    });

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.bronzeRecords)).toBe(true);
    expect(Object.isFrozen(result.validationResult)).toBe(true);
    expect(Object.isFrozen(result.metadata)).toBe(true);
  });

  it("does not mutate the input config", () => {
    const config = buildConfig();
    const before = snapshotConfig(config);
    const records = completeMarketRecords(
      MARKET_TICKER,
      START_TIME,
      WINDOW_CLOSE,
      "immutable-config",
    );
    const { kalshiProvider, btcProvider } = createProviders(records);

    runConfiguredHistoricalBronzeImport({
      config,
      kalshiProvider,
      btcProvider,
    });

    expect(snapshotConfig(config)).toBe(before);
  });
});
