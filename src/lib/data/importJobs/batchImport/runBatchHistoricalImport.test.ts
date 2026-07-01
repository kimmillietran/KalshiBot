import { describe, expect, it, vi } from "vitest";

import {
  HistoricalBronzeImportBtcInterval,
  HistoricalBronzeImportBtcProvider,
  HistoricalBronzeImportKalshiSource,
  HistoricalBronzeImportOutputFormat,
} from "@/lib/data/importJobs/config";
import type { BuildHistoricalBronzeImportConfigInput } from "@/lib/data/importJobs/config";
import type { HistoricalBronzeImportJobResult } from "@/lib/data/importJobs/historicalBronzeImportJobTypes";

import { runBatchHistoricalImport } from "./runBatchHistoricalImport";
import type {
  BatchImportFilesystem,
  BatchHistoricalImportRunnerDeps,
  RunSingleBatchImportFn,
} from "./batchImportTypes";

const START_TIME = "2026-06-26T23:15:00.000Z";
const END_TIME = "2026-06-26T23:30:00.000Z";
const COLLECTION_TIME = "2026-06-27T01:00:00.000Z";
const OBSERVED_AT = "2026-06-27T01:00:05.000Z";
const FIXED_NOW = new Date("2026-06-27T12:00:00.000Z");

function validConfigInput(
  marketTicker: string,
  overrides: Partial<BuildHistoricalBronzeImportConfigInput> = {},
): BuildHistoricalBronzeImportConfigInput {
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
    ...overrides,
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
  const mkdirs = new Set<string>();

  return {
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
    mkdir: (path) => {
      mkdirs.add(path);
    },
    listConfigPaths: () =>
      [...files.keys()].sort((left, right) => left.localeCompare(right)),
  };
}

function createDeps(
  filesystem: BatchImportFilesystem,
  runImport?: RunSingleBatchImportFn,
): BatchHistoricalImportRunnerDeps {
  return {
    filesystem,
    runImport:
      runImport
      ?? vi.fn(async ({ config }) => createImportResult(config.marketTicker)),
    now: () => FIXED_NOW,
  };
}

describe("runBatchHistoricalImport", () => {
  it("runs imports in deterministic config path order", async () => {
    const marketB = "KXBTC15M-MARKET-B";
    const marketA = "KXBTC15M-MARKET-A";
    const filesystem = createFilesystem({
      [`data/import-configs/KXBTC15M/${marketB}/config.json`]: JSON.stringify(
        validConfigInput(marketB),
      ),
      [`data/import-configs/KXBTC15M/${marketA}/config.json`]: JSON.stringify(
        validConfigInput(marketA),
      ),
    });
    const runImport = vi.fn(async ({ config }) => createImportResult(config.marketTicker));
    const deps = createDeps(filesystem, runImport);

    const summary = await runBatchHistoricalImport(
      {
        inputDir: "data/import-configs",
        outputDir: "data/imports",
      },
      deps,
    );

    expect(summary.markets.map((market) => market.configPath)).toEqual([
      `data/import-configs/KXBTC15M/${marketA}/config.json`,
      `data/import-configs/KXBTC15M/${marketB}/config.json`,
    ]);
    expect(runImport.mock.calls.map(([call]) => call.config.marketTicker)).toEqual([
      marketA,
      marketB,
    ]);
  });

  it("records successful imports and writes per-market output files", async () => {
    const marketTicker = "KXBTC15M-MARKET-A";
    const configPath = `data/import-configs/KXBTC15M/${marketTicker}/config.json`;
    const outputPath = `data/imports/KXBTC15M/${marketTicker}/import-result.json`;
    const filesystem = createFilesystem({
      [configPath]: JSON.stringify(validConfigInput(marketTicker)),
    });
    const deps = createDeps(filesystem);

    const summary = await runBatchHistoricalImport(
      {
        inputDir: "data/import-configs",
        outputDir: "data/imports",
      },
      deps,
    );

    expect(summary.successfulImports).toBe(1);
    expect(summary.failedImports).toBe(0);
    expect(summary.skippedImports).toBe(0);
    expect(summary.markets[0]).toMatchObject({
      marketTicker,
      configPath,
      outputPath,
      status: "success",
      jobId: `import-${marketTicker}`,
      bronzeRecordCount: 4,
      valid: true,
    });
    expect(filesystem.readFile(outputPath)).toContain(marketTicker);
    expect(filesystem.readFile(summary.summaryPath)).toContain('"successfulImports":1');
  });

  it("continues after individual import failures", async () => {
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
    const runImport = vi.fn(async ({ config }) => {
      if (config.marketTicker === marketB) {
        throw new Error("provider import failed");
      }

      return createImportResult(config.marketTicker);
    });

    const summary = await runBatchHistoricalImport(
      {
        inputDir: "data/import-configs",
        outputDir: "data/imports",
      },
      createDeps(filesystem, runImport),
    );

    expect(summary.successfulImports).toBe(1);
    expect(summary.failedImports).toBe(1);
    expect(summary.markets.find((market) => market.marketTicker === marketB)?.status).toBe(
      "failed",
    );
    expect(summary.markets.find((market) => market.marketTicker === marketA)?.status).toBe(
      "success",
    );
  });

  it("marks invalid configs as failed without running the importer", async () => {
    const marketTicker = "KXBTC15M-MARKET-A";
    const filesystem = createFilesystem({
      [`data/import-configs/KXBTC15M/${marketTicker}/config.json`]: JSON.stringify(
        validConfigInput(marketTicker, { jobId: "   " }),
      ),
    });
    const runImport = vi.fn();

    const summary = await runBatchHistoricalImport(
      {
        inputDir: "data/import-configs",
        outputDir: "data/imports",
      },
      createDeps(filesystem, runImport),
    );

    expect(summary.failedImports).toBe(1);
    expect(runImport).not.toHaveBeenCalled();
    expect(summary.markets[0]?.errorMessage).toContain("jobId is required");
  });

  it("skips markets when output files already exist", async () => {
    const marketTicker = "KXBTC15M-MARKET-A";
    const outputPath = `data/imports/KXBTC15M/${marketTicker}/import-result.json`;
    const filesystem = createFilesystem(
      {
        [`data/import-configs/KXBTC15M/${marketTicker}/config.json`]: JSON.stringify(
          validConfigInput(marketTicker),
        ),
      },
      new Set([outputPath]),
    );
    const runImport = vi.fn();

    const summary = await runBatchHistoricalImport(
      {
        inputDir: "data/import-configs",
        outputDir: "data/imports",
      },
      createDeps(filesystem, runImport),
    );

    expect(summary.skippedImports).toBe(1);
    expect(summary.successfulImports).toBe(0);
    expect(runImport).not.toHaveBeenCalled();
    expect(summary.markets[0]?.status).toBe("skipped");
  });

  it("rejects duplicate output locations before importing", async () => {
    const configPath = "data/import-configs/KXBTC15M/MARKET-A/config.json";
    const filesystem = createFilesystem({
      [configPath]: JSON.stringify(validConfigInput("KXBTC15M-MARKET-A")),
    });
    filesystem.listConfigPaths = () => [configPath, configPath];

    await expect(
      runBatchHistoricalImport(
        {
          inputDir: "data/import-configs",
          outputDir: "data/imports",
        },
        createDeps(filesystem),
      ),
    ).rejects.toMatchObject({
      code: "duplicate-output-path",
    });
  });

  it("supports concurrent execution", async () => {
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
    const runImport = vi.fn(async ({ config }) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return createImportResult(config.marketTicker);
    });

    const summary = await runBatchHistoricalImport(
      {
        inputDir: "data/import-configs",
        outputDir: "data/imports",
        concurrency: 2,
      },
      createDeps(filesystem, runImport),
    );

    expect(summary.successfulImports).toBe(3);
    expect(maxActive).toBe(2);
    expect(runImport).toHaveBeenCalledTimes(3);
  });

  it("serializes deterministic summary output", async () => {
    const marketTicker = "KXBTC15M-MARKET-A";
    const filesystem = createFilesystem({
      [`data/import-configs/KXBTC15M/${marketTicker}/config.json`]: JSON.stringify(
        validConfigInput(marketTicker),
      ),
    });

    const summary = await runBatchHistoricalImport(
      {
        inputDir: "data/import-configs",
        outputDir: "data/imports",
      },
      createDeps(filesystem),
    );

    const serialized = filesystem.readFile(summary.summaryPath);
    expect(serialized).toContain('"successfulImports":1');
    expect(serialized.indexOf('"markets"')).toBeLessThan(
      serialized.lastIndexOf(`"marketTicker":"${marketTicker}"`),
    );
  });
});
