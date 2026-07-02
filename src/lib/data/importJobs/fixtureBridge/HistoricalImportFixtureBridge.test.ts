import { afterEach, describe, expect, it, vi } from "vitest";

import * as fixtures from "@/lib/data/fixtures";
import { DEFAULT_BACKTEST_FILL_SIMULATION_CONFIG } from "@/lib/data/backtesting/strategyTypes";
import { DataSource } from "@/lib/data/provenance";
import { SILVER_BRONZE_CONTENT_TYPE } from "@/lib/data/silver";
import type { RawHistoricalRecord } from "@/lib/data/types";
import { DEFAULT_ENGINE_CONFIG } from "@/lib/trading/config/defaults";

import { DATASET_BRONZE_CONTENT_TYPE } from "../../datasets/datasetTypes";
import { runHistoricalBronzeImportJob } from "../HistoricalBronzeImportJob";
import type {
  BtcHistoricalBronzeProvider,
  KalshiHistoricalBronzeProvider,
  RunHistoricalBronzeImportJobInput,
} from "../historicalBronzeImportJobTypes";

import {
  ImportFixtureBridgeError,
  ImportFixtureBridgeErrorCode,
} from "./importFixtureBridgeTypes";
import {
  buildHistoricalResearchFixtureFromImportResult,
  serializeHistoricalResearchFixtureFromImportResult,
} from "./HistoricalImportFixtureBridge";

const COLLECTION_TIME = "2026-06-27T01:00:00.000Z";
const OBSERVED_AT = "2026-06-27T01:00:05.000Z";
const JOB_ID = "import-job-6.19b";
const MARKET_TICKER = "KXBTC15M-FIXTURE-BRIDGE";
const START_TIME = "2026-06-26T23:15:00.000Z";
const END_TIME = "2026-06-26T23:30:00.000Z";
const WINDOW_CLOSE = "2026-06-26T23:30:00.000Z";
const RUN_ID = "fixture-bridge-run-6.19b";
const DURATION_MS = 4_000;

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
) {
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

function createProviders(records: ReturnType<typeof completeMarketRecords>) {
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

function buildImportInput(
  overrides: Partial<RunHistoricalBronzeImportJobInput> = {},
): RunHistoricalBronzeImportJobInput {
  const records = completeMarketRecords(
    MARKET_TICKER,
    START_TIME,
    WINDOW_CLOSE,
    "bridge",
  );
  const providers = createProviders(records);

  return {
    jobId: JOB_ID,
    marketTicker: MARKET_TICKER,
    startTime: START_TIME,
    endTime: END_TIME,
    collectionTime: COLLECTION_TIME,
    observedAt: OBSERVED_AT,
    kalshiProvider: providers.kalshiProvider as KalshiHistoricalBronzeProvider,
    btcProvider: providers.btcProvider as BtcHistoricalBronzeProvider,
    ...overrides,
  };
}

function validImportResult() {
  return runHistoricalBronzeImportJob(buildImportInput());
}

function invalidImportResult() {
  const records = completeMarketRecords(
    MARKET_TICKER,
    START_TIME,
    WINDOW_CLOSE,
    "invalid",
  );

  return runHistoricalBronzeImportJob({
    ...buildImportInput(),
    kalshiProvider: {
      importKalshiMarketRecords: () => [records.market],
      importKalshiCandleRecords: () => [],
      importKalshiSettlementRecords: () => [],
    },
    btcProvider: {
      importBtcKlineRecords: () => [],
    },
  });
}

function bridgeInput(
  overrides: Partial<{
    importResult: ReturnType<typeof validImportResult>;
    strategyId: "noop" | "buy-first-ask";
    runId: string;
    durationMs: number;
    initialCashCents: number;
    exportConfig: {
      exportId: string;
      generated: { generatedAt: string; label: string };
    };
  }> = {},
) {
  return {
    importResult: validImportResult(),
    strategyId: "noop" as const,
    runId: RUN_ID,
    durationMs: DURATION_MS,
    initialCashCents: 10_000,
    engineConfig: DEFAULT_ENGINE_CONFIG,
    fillConfig: {
      ...DEFAULT_BACKTEST_FILL_SIMULATION_CONFIG,
      feeCentsPerContract: 1,
    },
    ...overrides,
  };
}

describe("buildHistoricalResearchFixtureFromImportResult", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds a research fixture from a valid import result", () => {
    const fixture = buildHistoricalResearchFixtureFromImportResult(bridgeInput());

    expect(fixture.runId).toBe(RUN_ID);
    expect(fixture.durationMs).toBe(DURATION_MS);
    expect(fixture.initialCashCents).toBe(10_000);
    expect(fixture.strategyId).toBe("noop");
    expect(fixture.bronzeRecords).toHaveLength(4);
    expect(fixture.engineConfig).toEqual(DEFAULT_ENGINE_CONFIG);
  });

  it("rejects an invalid import result", () => {
    expect(() =>
      buildHistoricalResearchFixtureFromImportResult(
        bridgeInput({ importResult: invalidImportResult() }),
      ),
    ).toThrowError(
      expect.objectContaining({
        code: ImportFixtureBridgeErrorCode.INVALID_IMPORT_RESULT,
      }),
    );
    expect(() =>
      buildHistoricalResearchFixtureFromImportResult(
        bridgeInput({ importResult: invalidImportResult() }),
      ),
    ).toThrowError(ImportFixtureBridgeError);
  });

  it("passes strategyId through to the fixture", () => {
    const fixture = buildHistoricalResearchFixtureFromImportResult(
      bridgeInput({ strategyId: "buy-first-ask" }),
    );

    expect(fixture.strategyId).toBe("buy-first-ask");
  });

  it("passes runId, durationMs, initialCashCents, and engineConfig through", () => {
    const fixture = buildHistoricalResearchFixtureFromImportResult(
      bridgeInput({
        runId: "custom-run-id",
        durationMs: 8_000,
        initialCashCents: 25_000,
      }),
    );

    expect(fixture.runId).toBe("custom-run-id");
    expect(fixture.durationMs).toBe(8_000);
    expect(fixture.initialCashCents).toBe(25_000);
    expect(fixture.engineConfig).toEqual(DEFAULT_ENGINE_CONFIG);
  });

  it("passes exportConfig through unchanged", () => {
    const exportConfig = {
      exportId: "export-bridge-1",
      generated: {
        generatedAt: "2026-06-28T00:00:00.000Z",
        label: "bridge-fixture",
      },
    };

    const fixture = buildHistoricalResearchFixtureFromImportResult(
      bridgeInput({ exportConfig }),
    );

    expect(fixture.exportConfig).toEqual(exportConfig);
  });

  it("serializes deterministically", () => {
    const input = bridgeInput();
    const first = serializeHistoricalResearchFixtureFromImportResult(input);
    const second = serializeHistoricalResearchFixtureFromImportResult(input);

    expect(first).toBe(second);
    expect(first).toContain(`"runId":"${RUN_ID}"`);
    expect(first).toContain(`"strategyId":"noop"`);
    expect(() => JSON.parse(first)).not.toThrow();
    expect(first).not.toContain("undefined");
  });

  it("returns deeply frozen immutable output", () => {
    const fixture = buildHistoricalResearchFixtureFromImportResult(bridgeInput());

    expect(Object.isFrozen(fixture)).toBe(true);
    expect(Object.isFrozen(fixture.bronzeRecords)).toBe(true);
    expect(Object.isFrozen(fixture.bronzeRecords[0]!)).toBe(true);
    expect(Object.isFrozen(fixture.bronzeRecords[0]!.payload)).toBe(true);

    expect(() => {
      (fixture.bronzeRecords as unknown[]).push({} as RawHistoricalRecord);
    }).toThrow();
  });

  it("does not mutate the import result input", () => {
    const importResult = validImportResult();
    const before = JSON.stringify(importResult);

    buildHistoricalResearchFixtureFromImportResult(
      bridgeInput({ importResult }),
    );

    expect(JSON.stringify(importResult)).toBe(before);
  });

  it("delegates to buildHistoricalResearchFixture with import bronze records", () => {
    const buildFixtureSpy = vi.spyOn(fixtures, "buildHistoricalResearchFixture");
    const input = bridgeInput();

    buildHistoricalResearchFixtureFromImportResult(input);

    expect(buildFixtureSpy).toHaveBeenCalledOnce();
    expect(buildFixtureSpy).toHaveBeenCalledWith({
      bronzeRecords: input.importResult.bronzeRecords,
      strategyId: input.strategyId,
      runId: input.runId,
      durationMs: input.durationMs,
      initialCashCents: input.initialCashCents,
      engineConfig: input.engineConfig,
      fillConfig: input.fillConfig,
      metricsConfig: undefined,
      exportConfig: undefined,
    });
  });

  it("does not use filesystem or network", () => {
    const readFileSpy = vi.spyOn(
      { readFile: () => "" },
      "readFile",
    );
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    buildHistoricalResearchFixtureFromImportResult(bridgeInput());
    serializeHistoricalResearchFixtureFromImportResult(bridgeInput());

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(readFileSpy).not.toHaveBeenCalled();
  });
});
