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
import type {
  BatchFixtureBridgeFilesystem,
  RunSingleBatchFixtureBridgeFn,
} from "@/lib/data/importJobs/batchFixtureBridge";

import { DATASET_BRONZE_CONTENT_TYPE } from "@/lib/data/datasets/datasetTypes";
import { runBatchFixtureBridgeCommand } from "./runBatchFixtureBridge";
import {
  BatchFixtureBridgeCommandError,
  parseInputDirFromArgv,
  parseOutputDirFromArgv,
  parseSummaryPathFromArgv,
} from "./batchTypes";

const COLLECTION_TIME = "2026-06-27T01:00:00.000Z";
const OBSERVED_AT = "2026-06-27T01:00:05.000Z";
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

function validImportJson(marketTicker: string): string {
  const records = {
    market: baseBronze(
      SILVER_BRONZE_CONTENT_TYPE.MARKET,
      {
        open_time: START_TIME,
        close_time: WINDOW_CLOSE,
        floor_strike: 59_990.31,
        event_ticker: "KXBTC15M-EVENT",
        status: "closed",
      },
      { recordId: "market", ticker: marketTicker, eventTime: START_TIME },
    ),
    candle: baseBronze(
      SILVER_BRONZE_CONTENT_TYPE.CANDLESTICK,
      {
        open_time: START_TIME,
        close_time: END_TIME,
        yes_bid_cents: 48,
        yes_ask_cents: 52,
        no_bid_cents: 47,
        no_ask_cents: 51,
        volume_contracts: 120,
      },
      {
        recordId: "candle",
        ticker: marketTicker,
        eventTime: END_TIME,
        source: DataSource.KALSHI_CANDLES,
      },
    ),
    btc: baseBronze(
      DATASET_BRONZE_CONTENT_TYPE.BTC_KLINE,
      {
        open_time: START_TIME,
        close_time: END_TIME,
        open_usd: 59_980.5,
        high_usd: 60_010.25,
        low_usd: 59_960.0,
        close_usd: 59_995.75,
        volume_btc: 12.5,
      },
      {
        recordId: "btc",
        ticker: marketTicker,
        eventTime: END_TIME,
        source: DataSource.BINANCE_SPOT,
      },
    ),
    settlement: baseBronze(
      SILVER_BRONZE_CONTENT_TYPE.SETTLEMENT,
      {
        floor_strike: 59_990.31,
        expiration_value: "60010.25",
        result: "yes",
        settlement_ts: WINDOW_CLOSE,
      },
      { recordId: "settlement", ticker: marketTicker, eventTime: START_TIME },
    ),
  };

  const input: RunHistoricalBronzeImportJobInput = {
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

  return serializeHistoricalBronzeImportResult(runHistoricalBronzeImportJob(input));
}

function createFilesystem(imports: Record<string, string>): BatchFixtureBridgeFilesystem {
  const files = new Map(Object.entries(imports));
  const writes = new Map<string, string>();

  return {
    exists: () => false,
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

function createIo() {
  const stdout: string[] = [];
  const stderr: string[] = [];

  return {
    io: {
      writeStdout: (text: string) => {
        stdout.push(text);
      },
      writeStderr: (text: string) => {
        stderr.push(text);
      },
    },
    stdout,
    stderr,
  };
}

describe("batch fixture argv parsing", () => {
  it("defaults input, output, and summary paths", () => {
    expect(parseInputDirFromArgv([])).toBe("data/imports");
    expect(parseOutputDirFromArgv([])).toBe("data/fixtures");
    expect(parseSummaryPathFromArgv([])).toBe("batch-fixtures-summary.json");
  });

  it("parses CLI flags", () => {
    expect(parseInputDirFromArgv(["--input-dir", "imports"])).toBe("imports");
    expect(parseOutputDirFromArgv(["--output-dir", "fixtures"])).toBe("fixtures");
    expect(parseSummaryPathFromArgv(["--summary", "summary.json"])).toBe("summary.json");
  });

  it("rejects missing flag values", () => {
    expect(() => parseSummaryPathFromArgv(["--summary"])).toThrow(
      BatchFixtureBridgeCommandError,
    );
  });
});

describe("runBatchFixtureBridgeCommand", () => {
  it("writes fixtures and summary via dependency injection", async () => {
    const marketTicker = "KXBTC15M-MARKET-A";
    const filesystem = createFilesystem({
      [`data/imports/KXBTC15M/${marketTicker}/import-result.json`]:
        validImportJson(marketTicker),
    });
    const runFixtureBridge: RunSingleBatchFixtureBridgeFn = vi.fn(
      () => `{"fixture":true}`,
    );
    const { io, stdout } = createIo();

    const exitCode = await runBatchFixtureBridgeCommand(
      [
        "--input-dir",
        "data/imports",
        "--output-dir",
        "data/fixtures",
        "--summary",
        "batch-fixtures-summary.json",
      ],
      io,
      { deps: { filesystem, runFixtureBridge } },
    );

    expect(exitCode).toBe(0);
    expect(runFixtureBridge).toHaveBeenCalledOnce();
    expect(JSON.parse(stdout.join(""))).toMatchObject({
      totalImports: 1,
      successfulFixtures: 1,
      summaryPath: "data/fixtures/batch-fixtures-summary.json",
    });
  });

  it("accepts npm-stripped positional input-dir, output-dir, and summary", async () => {
    const marketTicker = "KXBTC15M-MARKET-A";
    const filesystem = createFilesystem({
      [`data/imports/KXBTC15M/${marketTicker}/import-result.json`]:
        validImportJson(marketTicker),
    });
    const runFixtureBridge: RunSingleBatchFixtureBridgeFn = vi.fn(
      () => `{"fixture":true}`,
    );
    const { io, stdout } = createIo();

    const exitCode = await runBatchFixtureBridgeCommand(
      [
        "data/imports",
        "data/fixtures",
        "batch-fixtures-summary.json",
      ],
      io,
      { deps: { filesystem, runFixtureBridge } },
    );

    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout.join(""))).toMatchObject({
      summaryPath: "data/fixtures/batch-fixtures-summary.json",
    });
  });

  it("returns a fatal error when duplicate output paths are detected", async () => {
    const importPath = "data/imports/KXBTC15M/MARKET-A/import-result.json";
    const filesystem = createFilesystem({
      [importPath]: validImportJson("KXBTC15M-MARKET-A"),
    });
    filesystem.listImportPaths = () => [importPath, importPath];
    const { io, stderr } = createIo();

    const exitCode = await runBatchFixtureBridgeCommand(
      ["--input-dir", "data/imports", "--output-dir", "data/fixtures"],
      io,
      { deps: { filesystem, runFixtureBridge: vi.fn() } },
    );

    expect(exitCode).toBe(1);
    expect(stderr.join("")).toContain("Duplicate output path");
  });
});
