import { describe, expect, it, vi } from "vitest";

import { DataSource } from "@/lib/data/provenance";
import { SILVER_BRONZE_CONTENT_TYPE } from "@/lib/data/silver";
import type { RawHistoricalRecord } from "@/lib/data/types";
import {
  runHistoricalBronzeImportJob,
  serializeHistoricalBronzeImportResult,
} from "@/lib/data/importJobs/HistoricalBronzeImportJob";
import type {
  BtcHistoricalBronzeProvider,
  KalshiHistoricalBronzeProvider,
  RunHistoricalBronzeImportJobInput,
} from "@/lib/data/importJobs/historicalBronzeImportJobTypes";
import { serializeHistoricalResearchFixtureFromImportResult } from "@/lib/data/importJobs/fixtureBridge";
import { parseResearchFixtureJson } from "@/lib/data/research/registry/parseResearchFixtureJson";
import { DEFAULT_ENGINE_CONFIG } from "@/lib/trading/config/defaults";
import { DEFAULT_BACKTEST_FILL_SIMULATION_CONFIG } from "@/lib/data/backtesting";

import { DATASET_BRONZE_CONTENT_TYPE } from "../../datasets/datasetTypes";
import { buildDefaultBatchFixtureBridgeOptions } from "./buildDefaultBatchFixtureBridgeOptions";
import { runBatchFixtureBridge } from "./runBatchFixtureBridge";
import type {
  BatchFixtureBridgeFilesystem,
  BatchFixtureBridgeRunnerDeps,
  RunSingleBatchFixtureBridgeFn,
} from "./batchFixtureBridgeTypes";

const COLLECTION_TIME = "2026-06-27T01:00:00.000Z";
const OBSERVED_AT = "2026-06-27T01:00:05.000Z";
const START_TIME = "2026-06-26T23:15:00.000Z";
const END_TIME = "2026-06-26T23:30:00.000Z";
const WINDOW_CLOSE = "2026-06-26T23:30:00.000Z";
const FIXED_NOW = new Date("2026-06-27T12:00:00.000Z");

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

function buildImportInput(marketTicker: string): RunHistoricalBronzeImportJobInput {
  const records = completeMarketRecords(marketTicker, START_TIME, WINDOW_CLOSE, "batch");

  return {
    jobId: `import-${marketTicker}`,
    marketTicker,
    startTime: START_TIME,
    endTime: END_TIME,
    collectionTime: COLLECTION_TIME,
    observedAt: OBSERVED_AT,
    kalshiProvider: {
      importKalshiMarketRecords: vi.fn(() => [records.market]),
      importKalshiCandleRecords: vi.fn(() => [records.candle]),
      importKalshiSettlementRecords: vi.fn(() => [records.settlement]),
    } as KalshiHistoricalBronzeProvider,
    btcProvider: {
      importBtcKlineRecords: vi.fn(() => [records.btc]),
    } as BtcHistoricalBronzeProvider,
  };
}

function validImportJson(marketTicker: string): string {
  return serializeHistoricalBronzeImportResult(
    runHistoricalBronzeImportJob(buildImportInput(marketTicker)),
  );
}

function invalidImportJson(marketTicker: string): string {
  const result = runHistoricalBronzeImportJob({
    ...buildImportInput(marketTicker),
    kalshiProvider: {
      importKalshiMarketRecords: () => [
        completeMarketRecords(marketTicker, START_TIME, WINDOW_CLOSE, "invalid").market,
      ],
      importKalshiCandleRecords: () => [],
      importKalshiSettlementRecords: () => [],
    },
    btcProvider: {
      importBtcKlineRecords: () => [],
    },
  });

  return serializeHistoricalBronzeImportResult(result);
}

function createFilesystem(
  imports: Record<string, string>,
  existingOutputs: Set<string> = new Set(),
): BatchFixtureBridgeFilesystem & { writes: Map<string, string> } {
  const files = new Map(Object.entries(imports));
  const writes = new Map<string, string>();

  return {
    writes,
    exists: (path) => existingOutputs.has(path),
    readFile: (path) => {
      const written = writes.get(path);
      if (written !== undefined) {
        return written;
      }

      const value = files.get(path);
      if (value === undefined) {
        throw new Error(`missing file: ${path}`);
      }
      return value;
    },
    writeFile: (path, data) => {
      writes.set(path, data);
    },
    mkdir: () => undefined,
    listImportPaths: () =>
      [...files.keys()].sort((left, right) => left.localeCompare(right)),
  };
}

function productionBridgeFn(): RunSingleBatchFixtureBridgeFn {
  return ({ importResult, marketTicker }) =>
    serializeHistoricalResearchFixtureFromImportResult({
      importResult,
      ...buildDefaultBatchFixtureBridgeOptions(marketTicker),
      engineConfig: DEFAULT_ENGINE_CONFIG,
      fillConfig: DEFAULT_BACKTEST_FILL_SIMULATION_CONFIG,
    });
}

function createDeps(
  filesystem: BatchFixtureBridgeFilesystem,
  runFixtureBridge?: RunSingleBatchFixtureBridgeFn,
): BatchFixtureBridgeRunnerDeps {
  return {
    filesystem,
    runFixtureBridge: runFixtureBridge ?? productionBridgeFn(),
    now: () => FIXED_NOW,
  };
}

describe("runBatchFixtureBridge", () => {
  it("runs fixture bridges in deterministic import path order", async () => {
    const marketB = "KXBTC15M-MARKET-B";
    const marketA = "KXBTC15M-MARKET-A";
    const filesystem = createFilesystem({
      [`data/imports/KXBTC15M/${marketB}/import-result.json`]: validImportJson(marketB),
      [`data/imports/KXBTC15M/${marketA}/import-result.json`]: validImportJson(marketA),
    });
    const runOrder: string[] = [];
    const runFixtureBridge = vi.fn(({ marketTicker }) => {
      runOrder.push(marketTicker);
      return `{"runId":"fixture-${marketTicker}"}`;
    });

    const summary = await runBatchFixtureBridge(
      {
        inputDir: "data/imports",
        outputDir: "data/fixtures",
      },
      createDeps(filesystem, runFixtureBridge),
    );

    expect(summary.markets.map((market) => market.importPath)).toEqual([
      `data/imports/KXBTC15M/${marketA}/import-result.json`,
      `data/imports/KXBTC15M/${marketB}/import-result.json`,
    ]);
    expect(runOrder).toEqual([marketA, marketB]);
  });

  it("writes replay-ready fixtures using the existing fixture bridge", async () => {
    const marketTicker = "KXBTC15M-MARKET-A";
    const importPath = `data/imports/KXBTC15M/${marketTicker}/import-result.json`;
    const fixturePath = `data/fixtures/KXBTC15M/${marketTicker}/fixture.json`;
    const filesystem = createFilesystem({
      [importPath]: validImportJson(marketTicker),
    });

    const summary = await runBatchFixtureBridge(
      {
        inputDir: "data/imports",
        outputDir: "data/fixtures",
      },
      createDeps(filesystem),
    );

    expect(summary.successfulFixtures).toBe(1);
    expect(summary.markets[0]).toMatchObject({
      marketTicker,
      importPath,
      fixturePath,
      status: "success",
      importValid: true,
    });
    const fixtureJson = filesystem.readFile(fixturePath);
    expect(fixtureJson).toContain(`"runId":"fixture-${marketTicker}"`);
    expect(fixtureJson).toContain('"strategyId":"noop"');
    expect(() => JSON.parse(fixtureJson)).not.toThrow();
    expect(() => parseResearchFixtureJson(fixtureJson, marketTicker)).not.toThrow();
  });

  it("does not write fixture.json when bridge output is undefined", async () => {
    const marketTicker = "KXBTC15M-MARKET-A";
    const importPath = `data/imports/KXBTC15M/${marketTicker}/import-result.json`;
    const fixturePath = `data/fixtures/KXBTC15M/${marketTicker}/fixture.json`;
    const filesystem = createFilesystem({
      [importPath]: validImportJson(marketTicker),
    });
    const runFixtureBridge = vi.fn(() => undefined as unknown as string);

    const summary = await runBatchFixtureBridge(
      {
        inputDir: "data/imports",
        outputDir: "data/fixtures",
      },
      createDeps(filesystem, runFixtureBridge),
    );

    expect(summary.successfulFixtures).toBe(0);
    expect(summary.failedFixtures).toBe(1);
    expect(summary.markets[0]).toMatchObject({
      marketTicker,
      status: "failed",
      errorMessage: "Fixture bridge returned empty or non-string output",
    });
    expect(filesystem.writes.has(fixturePath)).toBe(false);
  });

  it("marks invalid JSON fixture output as failed without writing fixture.json", async () => {
    const marketTicker = "KXBTC15M-MARKET-A";
    const importPath = `data/imports/KXBTC15M/${marketTicker}/import-result.json`;
    const fixturePath = `data/fixtures/KXBTC15M/${marketTicker}/fixture.json`;
    const filesystem = createFilesystem({
      [importPath]: validImportJson(marketTicker),
    });
    const runFixtureBridge = vi.fn(() => '{"runId":undefined}');

    const summary = await runBatchFixtureBridge(
      {
        inputDir: "data/imports",
        outputDir: "data/fixtures",
      },
      createDeps(filesystem, runFixtureBridge),
    );

    expect(summary.successfulFixtures).toBe(0);
    expect(summary.failedFixtures).toBe(1);
    expect(summary.markets[0]).toMatchObject({
      status: "failed",
      errorMessage: "Fixture bridge output is not valid JSON",
    });
    expect(filesystem.writes.has(fixturePath)).toBe(false);
  });

  it("continues after invalid import results and fixture bridge failures", async () => {
    const marketA = "KXBTC15M-MARKET-A";
    const marketB = "KXBTC15M-MARKET-B";
    const marketC = "KXBTC15M-MARKET-C";
    const filesystem = createFilesystem({
      [`data/imports/KXBTC15M/${marketA}/import-result.json`]: validImportJson(marketA),
      [`data/imports/KXBTC15M/${marketB}/import-result.json`]: "{not-json",
      [`data/imports/KXBTC15M/${marketC}/import-result.json`]: invalidImportJson(marketC),
    });

    const summary = await runBatchFixtureBridge(
      {
        inputDir: "data/imports",
        outputDir: "data/fixtures",
      },
      createDeps(filesystem),
    );

    expect(summary.successfulFixtures).toBe(1);
    expect(summary.failedFixtures).toBe(2);
    expect(summary.markets.find((market) => market.marketTicker === marketA)?.status).toBe(
      "success",
    );
    expect(summary.markets.find((market) => market.marketTicker === marketB)?.status).toBe(
      "failed",
    );
    expect(summary.markets.find((market) => market.marketTicker === marketC)?.status).toBe(
      "failed",
    );
  });

  it("skips markets when fixture outputs already exist", async () => {
    const marketTicker = "KXBTC15M-MARKET-A";
    const fixturePath = `data/fixtures/KXBTC15M/${marketTicker}/fixture.json`;
    const filesystem = createFilesystem(
      {
        [`data/imports/KXBTC15M/${marketTicker}/import-result.json`]:
          validImportJson(marketTicker),
      },
      new Set([fixturePath]),
    );
    const runFixtureBridge = vi.fn();

    const summary = await runBatchFixtureBridge(
      {
        inputDir: "data/imports",
        outputDir: "data/fixtures",
      },
      createDeps(filesystem, runFixtureBridge),
    );

    expect(summary.skippedFixtures).toBe(1);
    expect(runFixtureBridge).not.toHaveBeenCalled();
  });

  it("rejects duplicate output locations before converting fixtures", async () => {
    const importPath = "data/imports/KXBTC15M/MARKET-A/import-result.json";
    const filesystem = createFilesystem({
      [importPath]: validImportJson("KXBTC15M-MARKET-A"),
    });
    filesystem.listImportPaths = () => [importPath, importPath];

    await expect(
      runBatchFixtureBridge(
        {
          inputDir: "data/imports",
          outputDir: "data/fixtures",
        },
        createDeps(filesystem),
      ),
    ).rejects.toMatchObject({
      code: "duplicate-output-path",
    });
  });

  it("writes a deterministic batch summary", async () => {
    const marketTicker = "KXBTC15M-MARKET-A";
    const filesystem = createFilesystem({
      [`data/imports/KXBTC15M/${marketTicker}/import-result.json`]:
        validImportJson(marketTicker),
    });

    const summary = await runBatchFixtureBridge(
      {
        inputDir: "data/imports",
        outputDir: "data/fixtures",
        summaryPath: "batch-fixtures-summary.json",
      },
      createDeps(filesystem),
    );

    const serialized = filesystem.readFile(summary.summaryPath);
    expect(summary.summaryPath).toBe("data/fixtures/batch-fixtures-summary.json");
    expect(serialized).toContain('"successfulFixtures":1');
    expect(serialized).toContain(`"marketTicker":"${marketTicker}"`);
  });
});
