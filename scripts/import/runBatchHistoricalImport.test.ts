import { describe, expect, it, vi } from "vitest";

import {
  HistoricalBronzeImportBtcInterval,
  HistoricalBronzeImportBtcProvider,
  HistoricalBronzeImportKalshiSource,
  HistoricalBronzeImportOutputFormat,
} from "@/lib/data/importJobs/config";
import type { BuildHistoricalBronzeImportConfigInput } from "@/lib/data/importJobs/config";
import type { HistoricalBronzeImportJobResult } from "@/lib/data/importJobs/historicalBronzeImportJobTypes";
import type {
  BatchImportFilesystem,
  RunSingleBatchImportFn,
} from "@/lib/data/importJobs/batchImport";

import { runBatchHistoricalImportCommand } from "./runBatchHistoricalImport";
import {
  BatchImportCommandError,
  parseConcurrencyFromArgv,
  parseInputDirFromArgv,
  parseMaxRetriesFromArgv,
  parseOutputDirFromArgv,
  parseOverwriteFromArgv,
  parseRequestDelayMsFromArgv,
  parseRetryBaseDelayMsFromArgv,
  parseAdaptiveThrottleFromArgv,
  parseMinRequestDelayMsFromArgv,
  parseMaxRequestDelayMsFromArgv,
  parseThrottleIncreaseFactorFromArgv,
  parseThrottleDecreaseMsFromArgv,
} from "./batchTypes";

const START_TIME = "2026-06-26T23:15:00.000Z";
const END_TIME = "2026-06-26T23:30:00.000Z";
const COLLECTION_TIME = "2026-06-27T01:00:00.000Z";
const OBSERVED_AT = "2026-06-27T01:00:05.000Z";

function validConfigInput(marketTicker: string): BuildHistoricalBronzeImportConfigInput {
  return {
    jobId: `import-${marketTicker}`,
    marketTicker,
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
      provider: HistoricalBronzeImportBtcProvider.COINBASE_SPOT,
      symbol: "BTC-USD",
      interval: HistoricalBronzeImportBtcInterval.ONE_MINUTE,
    },
    output: {
      format: HistoricalBronzeImportOutputFormat.JSON,
      includeValidationReport: true,
      includeFixture: false,
    },
  };
}

function createImportResult(marketTicker: string): HistoricalBronzeImportJobResult {
  return {
    jobId: `import-${marketTicker}`,
    bronzeRecords: [],
    validationResult: {
      valid: true,
      errors: [],
      warnings: [],
      statistics: {
        totalRecords: 4,
        marketCount: 1,
        btcBarCount: 1,
        settlementCount: 1,
        duplicateCount: 0,
      },
    },
    metadata: {
      jobId: `import-${marketTicker}`,
      marketTicker,
      startTime: START_TIME,
      endTime: END_TIME,
      collectionTime: COLLECTION_TIME,
      observedAt: OBSERVED_AT,
      bronzeRecordCount: 4,
      valid: true,
    },
    serialized: `{"jobId":"import-${marketTicker}"}`,
  };
}

function createFilesystem(
  configs: Record<string, string>,
  existingOutputs: Set<string> = new Set(),
): BatchImportFilesystem {
  const files = new Map(Object.entries(configs));
  const writes = new Map<string, string>();

  return {
    exists: (path) => existingOutputs.has(path),
    readFile: (path) => {
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
    listConfigPaths: () =>
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

describe("batch import argv parsing", () => {
  it("defaults input and output directories", () => {
    expect(parseInputDirFromArgv([])).toBe("data/import-configs");
    expect(parseOutputDirFromArgv([])).toBe("data/imports");
    expect(parseConcurrencyFromArgv([])).toBeUndefined();
  });

  it("parses --input-dir, --output-dir, and --concurrency", () => {
    expect(
      parseInputDirFromArgv(["--input-dir", "configs"]),
    ).toBe("configs");
    expect(
      parseOutputDirFromArgv(["--output-dir", "imports"]),
    ).toBe("imports");
    expect(
      parseConcurrencyFromArgv(["--concurrency", "4"]),
    ).toBe(4);
  });

  it("rejects invalid concurrency values", () => {
    expect(() => parseConcurrencyFromArgv(["--concurrency", "0"])).toThrow(
      BatchImportCommandError,
    );
    expect(() => parseConcurrencyFromArgv(["--concurrency"])).toThrow(
      BatchImportCommandError,
    );
  });

  it("parses rate-limit and overwrite flags", () => {
    expect(parseRequestDelayMsFromArgv(["--request-delay-ms", "1000"])).toBe(1000);
    expect(parseMaxRetriesFromArgv(["--max-retries", "5"])).toBe(5);
    expect(parseRetryBaseDelayMsFromArgv(["--retry-base-delay-ms", "2000"])).toBe(2000);
    expect(parseOverwriteFromArgv(["--overwrite"])).toBe(true);
    expect(parseOverwriteFromArgv([])).toBe(false);
    expect(parseAdaptiveThrottleFromArgv(["--adaptive-throttle"])).toBe(true);
    expect(parseMinRequestDelayMsFromArgv(["--min-request-delay-ms", "100"])).toBe(100);
    expect(parseMaxRequestDelayMsFromArgv(["--max-request-delay-ms", "3000"])).toBe(3000);
    expect(parseThrottleIncreaseFactorFromArgv(["--throttle-increase-factor", "2"])).toBe(2);
    expect(parseThrottleDecreaseMsFromArgv(["--throttle-decrease-ms", "50"])).toBe(50);
  });

  it("rejects invalid rate-limit flag values", () => {
    expect(() => parseRequestDelayMsFromArgv(["--request-delay-ms", "-1"])).toThrow(
      BatchImportCommandError,
    );
    expect(() => parseMaxRetriesFromArgv(["--max-retries"])).toThrow(
      BatchImportCommandError,
    );
  });
});

describe("runBatchHistoricalImportCommand", () => {
  it("runs imports sequentially by default and writes a summary", async () => {
    const marketA = "KXBTC15M-MARKET-A";
    const marketB = "KXBTC15M-MARKET-B";
    const filesystem = createFilesystem({
      [`data/import-configs/KXBTC15M/${marketB}/config.json`]: JSON.stringify(
        validConfigInput(marketB),
      ),
      [`data/import-configs/KXBTC15M/${marketA}/config.json`]: JSON.stringify(
        validConfigInput(marketA),
      ),
    });
    const runOrder: string[] = [];
    const runImport: RunSingleBatchImportFn = vi.fn(async ({ config }) => {
      runOrder.push(config.marketTicker);
      return createImportResult(config.marketTicker);
    });
    const { io, stdout } = createIo();

    const exitCode = await runBatchHistoricalImportCommand(
      ["--input-dir", "data/import-configs", "--output-dir", "data/imports"],
      io,
      { deps: { filesystem, runImport } },
    );

    expect(exitCode).toBe(0);
    expect(runOrder).toEqual([marketA, marketB]);
    expect(JSON.parse(stdout.join(""))).toMatchObject({
      totalConfigs: 2,
      successfulImports: 2,
      failedImports: 0,
      skippedImports: 0,
      summaryPath: "data/imports/batch-import-summary.json",
    });
  });

  it("continues after importer failures and still returns success", async () => {
    const marketA = "KXBTC15M-MARKET-A";
    const marketB = "KXBTC15M-MARKET-B";
    const filesystem = createFilesystem({
      [`data/import-configs/KXBTC15M/${marketA}/config.json`]: JSON.stringify(
        validConfigInput(marketA),
      ),
      [`data/import-configs/KXBTC15M/${marketB}/config.json`]: JSON.stringify(
        validConfigInput(marketB),
      ),
    });
    const runImport: RunSingleBatchImportFn = vi.fn(async ({ config }) => {
      if (config.marketTicker === marketB) {
        throw new Error("provider import failed");
      }

      return createImportResult(config.marketTicker);
    });
    const { io, stdout } = createIo();

    const exitCode = await runBatchHistoricalImportCommand(
      ["--input-dir", "data/import-configs", "--output-dir", "data/imports"],
      io,
      { deps: { filesystem, runImport } },
    );

    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout.join(""))).toMatchObject({
      successfulImports: 1,
      failedImports: 1,
    });
  });

  it("supports concurrent execution via --concurrency", async () => {
    const markets = ["KXBTC15M-MARKET-A", "KXBTC15M-MARKET-B", "KXBTC15M-MARKET-C"];
    const filesystem = createFilesystem(
      Object.fromEntries(
        markets.map((marketTicker) => [
          `data/import-configs/KXBTC15M/${marketTicker}/config.json`,
          JSON.stringify(validConfigInput(marketTicker)),
        ]),
      ),
    );
    let active = 0;
    let maxActive = 0;
    const runImport: RunSingleBatchImportFn = vi.fn(async ({ config }) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return createImportResult(config.marketTicker);
    });
    const { io } = createIo();

    await runBatchHistoricalImportCommand(
      [
        "--input-dir",
        "data/import-configs",
        "--output-dir",
        "data/imports",
        "--concurrency",
        "2",
      ],
      io,
      { deps: { filesystem, runImport } },
    );

    expect(maxActive).toBe(2);
    expect(runImport).toHaveBeenCalledTimes(3);
  });

  it("returns a fatal error when duplicate output paths are detected", async () => {
    const configPath = "data/import-configs/KXBTC15M/MARKET-A/config.json";
    const filesystem = createFilesystem({
      [configPath]: JSON.stringify(validConfigInput("KXBTC15M-MARKET-A")),
    });
    filesystem.listConfigPaths = () => [configPath, configPath];

    const { io, stderr } = createIo();
    const exitCode = await runBatchHistoricalImportCommand(
      ["--input-dir", "data/import-configs", "--output-dir", "data/imports"],
      io,
      {
        deps: {
          filesystem,
          runImport: vi.fn(),
        },
      },
    );

    expect(exitCode).toBe(1);
    expect(stderr.join("")).toContain("Duplicate output path");
  });

  it("writes progress logs to stderr without polluting stdout JSON", async () => {
    const marketTicker = "KXBTC15M-MARKET-A";
    const filesystem = createFilesystem({
      [`data/import-configs/KXBTC15M/${marketTicker}/config.json`]: JSON.stringify(
        validConfigInput(marketTicker),
      ),
    });
    const { io, stdout, stderr } = createIo();

    const exitCode = await runBatchHistoricalImportCommand(
      [
        "--input-dir",
        "data/import-configs",
        "--output-dir",
        "data/imports",
        "--adaptive-throttle",
        "--min-request-delay-ms",
        "100",
      ],
      io,
      { deps: { filesystem, runImport: vi.fn(async ({ config }) => createImportResult(config.marketTicker)) } },
    );

    expect(exitCode).toBe(0);
    expect(stderr.join("")).toContain("[import] market=1/1");
    expect(stdout.join("")).not.toContain("[import]");
    expect(() => JSON.parse(stdout.join(""))).not.toThrow();
  });
});
