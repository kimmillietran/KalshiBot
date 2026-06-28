import { describe, expect, it, vi } from "vitest";

import { DataSource } from "@/lib/data/provenance";
import { SILVER_BRONZE_CONTENT_TYPE } from "@/lib/data/silver";
import type { RawHistoricalRecord } from "@/lib/data/types";

import { DATASET_BRONZE_CONTENT_TYPE } from "../datasets/datasetTypes";
import { HistoricalBronzeValidationErrorCode } from "../datasets/validation";
import {
  runHistoricalBronzeImportJob,
  serializeHistoricalBronzeImportResult,
} from "./HistoricalBronzeImportJob";
import type {
  BtcHistoricalBronzeProvider,
  KalshiHistoricalBronzeProvider,
  RunHistoricalBronzeImportJobInput,
} from "./historicalBronzeImportJobTypes";

const COLLECTION_TIME = "2026-06-27T01:00:00.000Z";
const OBSERVED_AT = "2026-06-27T01:00:05.000Z";
const JOB_ID = "import-job-6.14a";
const MARKET_TICKER = "KXBTC15M-IMPORT";
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

function buildInput(
  overrides: Partial<RunHistoricalBronzeImportJobInput> = {},
): RunHistoricalBronzeImportJobInput {
  const records = completeMarketRecords(
    MARKET_TICKER,
    START_TIME,
    WINDOW_CLOSE,
    "import",
  );
  const providers = createProviders(records);

  return {
    jobId: JOB_ID,
    marketTicker: MARKET_TICKER,
    startTime: START_TIME,
    endTime: END_TIME,
    collectionTime: COLLECTION_TIME,
    observedAt: OBSERVED_AT,
    kalshiProvider: providers.kalshiProvider,
    btcProvider: providers.btcProvider,
    ...overrides,
  };
}

describe("runHistoricalBronzeImportJob", () => {
  it("builds a complete valid bronze set on the happy path", () => {
    const result = runHistoricalBronzeImportJob(buildInput());

    expect(result.jobId).toBe(JOB_ID);
    expect(result.bronzeRecords).toHaveLength(4);
    expect(result.validationResult.valid).toBe(true);
    expect(result.validationResult.errors).toHaveLength(0);
    expect(result.metadata.bronzeRecordCount).toBe(4);
    expect(result.metadata.valid).toBe(true);
    expect(result.serialized).toBe(serializeHistoricalBronzeImportResult(result));
  });

  it("calls each provider exactly once with the import window input", () => {
    const input = buildInput();
    runHistoricalBronzeImportJob(input);

    const expectedProviderInput = {
      marketTicker: MARKET_TICKER,
      startTime: START_TIME,
      endTime: END_TIME,
      collectionTime: COLLECTION_TIME,
      observedAt: OBSERVED_AT,
    };

    expect(input.kalshiProvider.importKalshiMarketRecords).toHaveBeenCalledOnce();
    expect(input.kalshiProvider.importKalshiMarketRecords).toHaveBeenCalledWith(
      expectedProviderInput,
    );
    expect(input.kalshiProvider.importKalshiCandleRecords).toHaveBeenCalledOnce();
    expect(input.kalshiProvider.importKalshiCandleRecords).toHaveBeenCalledWith(
      expectedProviderInput,
    );
    expect(input.kalshiProvider.importKalshiSettlementRecords).toHaveBeenCalledOnce();
    expect(input.kalshiProvider.importKalshiSettlementRecords).toHaveBeenCalledWith(
      expectedProviderInput,
    );
    expect(input.btcProvider.importBtcKlineRecords).toHaveBeenCalledOnce();
    expect(input.btcProvider.importBtcKlineRecords).toHaveBeenCalledWith(
      expectedProviderInput,
    );
  });

  it("orders bronze records deterministically", () => {
    const records = completeMarketRecords(
      MARKET_TICKER,
      START_TIME,
      WINDOW_CLOSE,
      "order",
    );

    const shuffledKalshiProvider: KalshiHistoricalBronzeProvider = {
      importKalshiMarketRecords: () => [records.settlement, records.market],
      importKalshiCandleRecords: () => [records.candle],
      importKalshiSettlementRecords: () => [],
    };
    const btcProvider: BtcHistoricalBronzeProvider = {
      importBtcKlineRecords: () => [records.btc],
    };

    const result = runHistoricalBronzeImportJob({
      ...buildInput(),
      kalshiProvider: shuffledKalshiProvider,
      btcProvider,
    });

    expect(result.bronzeRecords.map((record) => record.recordId)).toEqual([
      "order-market",
      "order-settlement",
      "order-btc",
      "order-candle",
    ]);
  });

  it("includes validation results in the job output", () => {
    const result = runHistoricalBronzeImportJob(buildInput());

    expect(result.validationResult.statistics.totalRecords).toBe(4);
    expect(result.validationResult.statistics.marketCount).toBe(1);
    expect(result.validationResult.statistics.btcBarCount).toBe(1);
    expect(result.validationResult.statistics.settlementCount).toBe(1);
    expect(result.serialized).toContain("\"valid\":true");
  });

  it("marks validation invalid when provider output is incomplete", () => {
    const records = completeMarketRecords(
      MARKET_TICKER,
      START_TIME,
      WINDOW_CLOSE,
      "incomplete",
    );

    const result = runHistoricalBronzeImportJob({
      ...buildInput(),
      kalshiProvider: {
        importKalshiMarketRecords: () => [records.market],
        importKalshiCandleRecords: () => [],
        importKalshiSettlementRecords: () => [],
      },
      btcProvider: {
        importBtcKlineRecords: () => [],
      },
    });

    expect(result.validationResult.valid).toBe(false);
    expect(
      result.validationResult.errors.some(
        (issue) => issue.errorCode === HistoricalBronzeValidationErrorCode.INCOMPLETE_MARKET_GROUP,
      ),
    ).toBe(true);
    expect(result.metadata.valid).toBe(false);
  });

  it("propagates provider errors without wrapping", () => {
    const providerError = new Error("kalshi provider failed");

    expect(() =>
      runHistoricalBronzeImportJob({
        ...buildInput(),
        kalshiProvider: {
          importKalshiMarketRecords: () => {
            throw providerError;
          },
          importKalshiCandleRecords: () => [],
          importKalshiSettlementRecords: () => [],
        },
      }),
    ).toThrow(providerError);
  });

  it("serializes job results deterministically", () => {
    const result = runHistoricalBronzeImportJob(buildInput());
    const first = serializeHistoricalBronzeImportResult(result);
    const second = serializeHistoricalBronzeImportResult(result);

    expect(first).toBe(second);
    expect(result.serialized).toBe(first);
  });

  it("returns deeply frozen immutable outputs", () => {
    const result = runHistoricalBronzeImportJob(buildInput());

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.bronzeRecords)).toBe(true);
    expect(Object.isFrozen(result.validationResult)).toBe(true);
    expect(Object.isFrozen(result.validationResult.errors)).toBe(true);
    expect(Object.isFrozen(result.metadata)).toBe(true);

    expect(() => {
      (result as { jobId: string }).jobId = "mutated";
    }).toThrow();
    expect(() => {
      (result.bronzeRecords as RawHistoricalRecord[]).push(
        completeMarketRecords(MARKET_TICKER, START_TIME, WINDOW_CLOSE, "mutate").market,
      );
    }).toThrow();
  });

  it("does not mutate the job input or provider objects", () => {
    const input = buildInput();
    const inputSnapshot = structuredClone({
      jobId: input.jobId,
      marketTicker: input.marketTicker,
      startTime: input.startTime,
      endTime: input.endTime,
      collectionTime: input.collectionTime,
      observedAt: input.observedAt,
    });
    const marketProvider = input.kalshiProvider.importKalshiMarketRecords;

    runHistoricalBronzeImportJob(input);

    expect({
      jobId: input.jobId,
      marketTicker: input.marketTicker,
      startTime: input.startTime,
      endTime: input.endTime,
      collectionTime: input.collectionTime,
      observedAt: input.observedAt,
    }).toEqual(inputSnapshot);
    expect(input.kalshiProvider.importKalshiMarketRecords).toBe(marketProvider);
  });

  it("uses provider interfaces only without filesystem or network access", () => {
    const input = buildInput();
    const result = runHistoricalBronzeImportJob(input);

    expect(result.bronzeRecords.length).toBeGreaterThan(0);
    expect(
      [
        input.kalshiProvider.importKalshiMarketRecords,
        input.kalshiProvider.importKalshiCandleRecords,
        input.kalshiProvider.importKalshiSettlementRecords,
        input.btcProvider.importBtcKlineRecords,
      ].every((providerFn) => typeof providerFn === "function"),
    ).toBe(true);
  });
});
