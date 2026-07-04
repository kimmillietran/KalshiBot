import { describe, expect, it, vi } from "vitest";

import {
  HistoricalBronzeImportBtcInterval,
  HistoricalBronzeImportBtcProvider,
  HistoricalBronzeImportKalshiSource,
  HistoricalBronzeImportOutputFormat,
} from "@/lib/data/importJobs/config";
import type { HistoricalBronzeImportJobResult } from "@/lib/data/importJobs/historicalBronzeImportJobTypes";

import { buildExpansionMarketImportArtifacts } from "./buildExpansionMarketImportConfig";
import {
  runHistoricalExpansionImport,
  serializeHistoricalExpansionImportSummary,
} from "./runHistoricalExpansionImport";
import { scanExistingExpansionMarketTickers } from "./scanExistingExpansionMarketTickers";
import { serializeHistoricalExpansionImportSummaryHtml } from "./serializeHistoricalExpansionImportSummaryHtml";
import type { ExpansionExecutorIo } from "./expansionExecutorTypes";

const GENERATED_AT = "2026-07-04T04:00:00.000Z";
const CONFIG_PATH = "data/import-configs/historical-expansion-config.json";

function createManifestJson(): string {
  return JSON.stringify({
    generatedAt: GENERATED_AT,
    outputPath: CONFIG_PATH,
    inputPath: "data/research-results/historical-coverage-plan.json",
    dryRun: false,
    importConfigsDir: "data/import-configs",
    summary: {
      recommendationCount: 1,
      scheduledJobCount: 1,
      skippedJobCount: 0,
    },
    jobs: [
      {
        jobId: "expansion-KXBTC15M-20260101-20260331",
        priority: 71,
        status: "scheduled",
        seriesTicker: "KXBTC15M",
        windowStart: "2026-01-01T00:00:00.000Z",
        windowEnd: "2026-03-31T23:59:59.999Z",
        estimatedMarketCount: null,
        reason: "Fill Q1 gap",
        expectedResearchBenefit: "Adds missing months",
        skipReason: null,
        discovery: {
          seriesTicker: "KXBTC15M",
          sampling: {
            afterDate: "2026-01-01T00:00:00.000Z",
            beforeDate: "2026-03-31T23:59:59.999Z",
          },
        },
        importDefaults: {
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
        },
      },
    ],
  });
}

function createImportResult(marketTicker: string): HistoricalBronzeImportJobResult {
  return {
    jobId: `expansion-import-${marketTicker}`,
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
      jobId: `expansion-import-${marketTicker}`,
      marketTicker,
      startTime: "2026-01-15T12:00:00.000Z",
      endTime: "2026-01-15T12:15:00.000Z",
      collectionTime: "2026-01-15T12:15:10.000Z",
      observedAt: "2026-01-15T12:15:10.000Z",
      bronzeRecordCount: 4,
      valid: true,
    },
    serialized: "{\"jobId\":\"test\"}",
  };
}

type MockFs = {
  files: Record<string, string>;
  directories: Set<string>;
};

function createIo(mock: MockFs): ExpansionExecutorIo & { writes: Map<string, string> } {
  const writes = new Map<string, string>();

  return {
    writes,
    readdir: (path) => {
      const prefix = path.replace(/\\/g, "/").replace(/\/$/, "");
      const entries = new Set<string>();
      for (const filePath of Object.keys(mock.files)) {
        if (filePath.startsWith(`${prefix}/`)) {
          const remainder = filePath.slice(prefix.length + 1);
          const segment = remainder.split("/")[0];
          if (segment) {
            entries.add(segment);
          }
        }
      }
      for (const directory of mock.directories) {
        if (directory.startsWith(`${prefix}/`)) {
          const remainder = directory.slice(prefix.length + 1);
          const segment = remainder.split("/")[0];
          if (segment) {
            entries.add(segment);
          }
        }
      }
      return [...entries].sort();
    },
    readFile: (path) => mock.files[path] ?? "",
    fileExists: (path) => {
      const normalized = path.replace(/\\/g, "/");
      return (
        mock.files[path] !== undefined
        || mock.directories.has(path)
        || Object.keys(mock.files).some((filePath) => filePath.startsWith(`${normalized}/`))
      );
    },
    isDirectory: (path) => {
      const normalized = path.replace(/\\/g, "/");
      return (
        mock.directories.has(path)
        || Object.keys(mock.files).some((filePath) => filePath.startsWith(`${normalized}/`))
      );
    },
    writeFile: (path, data) => {
      writes.set(path, data);
      mock.files[path] = data;
    },
    mkdirSync: () => {},
  };
}

describe("buildExpansionMarketImportArtifacts", () => {
  it("preserves Coinbase and Kalshi REST routing from expansion job defaults", () => {
    const manifest = JSON.parse(createManifestJson());
    const artifacts = buildExpansionMarketImportArtifacts(
      manifest.jobs[0],
      {
        marketTicker: "KXBTC15M-26JAN151215-00",
        seriesTicker: "KXBTC15M",
        openTime: "2026-01-15T12:00:00.000Z",
        closeTime: "2026-01-15T12:15:00.000Z",
      },
      {
        importConfigsDir: "data/import-configs",
        importsDir: "data/imports",
      },
    );

    expect(artifacts.config.btc.provider).toBe("coinbase-spot");
    expect(artifacts.config.btc.interval).toBe("1m");
    expect(artifacts.config.kalshi.marketSource).toBe("kalshi-rest");
    expect(artifacts.configPath).toBe(
      "data/import-configs/KXBTC15M/KXBTC15M-26JAN151215-00/config.json",
    );
    expect(artifacts.importResultPath).toBe(
      "data/imports/KXBTC15M/KXBTC15M-26JAN151215-00/import-result.json",
    );
  });
});

describe("scanExistingExpansionMarketTickers", () => {
  it("collects tickers from import configs, fixtures, and research outputs", () => {
    const mock: MockFs = { files: {}, directories: new Set(["data"]) };
    mock.files["data/import-configs/KXBTC15M/MKT-A/config.json"] = JSON.stringify({
      marketTicker: "MKT-A",
    });
    mock.files["data/fixtures/KXBTC15M/MKT-B.json"] = JSON.stringify({
      marketTicker: "MKT-B",
    });
    mock.files["data/research-results/noop/KXBTC15M/MKT-C/research-output.json"] =
      JSON.stringify({ marketTicker: "MKT-C" });

    const tickers = scanExistingExpansionMarketTickers(
      {
        importConfigsDir: "data/import-configs",
        fixturesDir: "data/fixtures",
        researchResultsDir: "data/research-results",
      },
      createIo(mock),
    );

    expect([...tickers].sort()).toEqual(["MKT-A", "MKT-B", "MKT-C"]);
  });
});

describe("runHistoricalExpansionImport", () => {
  it("dry-runs scheduled jobs and records planned imports without writing artifacts", async () => {
    const mock: MockFs = { files: {}, directories: new Set(["data"]) };
    const io = createIo(mock);

    const summary = await runHistoricalExpansionImport({
      generatedAt: GENERATED_AT,
      config: {
        inputPath: CONFIG_PATH,
        outputPath: "data/research-results/historical-expansion-import-summary.json",
        htmlOutputPath: "data/reports/historical-expansion-import-summary.html",
        importConfigsDir: "data/import-configs",
        importsDir: "data/imports",
        fixturesDir: "data/fixtures",
        researchResultsDir: "data/research-results",
        execute: false,
        maxMarkets: null,
        jobId: null,
        resume: false,
      },
      expansionConfigJson: createManifestJson(),
      io,
      deps: {
        discoverMarkets: vi.fn(async () => [
          {
            marketTicker: "KXBTC15M-26JAN151215-00",
            seriesTicker: "KXBTC15M",
            openTime: "2026-01-15T12:00:00.000Z",
            closeTime: "2026-01-15T12:15:00.000Z",
          },
        ]),
        runImport: vi.fn(),
      },
    });

    expect(summary.execute).toBe(false);
    expect(summary.summary.plannedCount).toBe(1);
    expect(summary.summary.importedCount).toBe(0);
    expect(summary.jobs[0]?.markets[0]?.status).toBe("planned");
    expect(io.writes.size).toBe(0);
    expect(serializeHistoricalExpansionImportSummaryHtml(summary)).toContain(
      "Historical Expansion Import Summary",
    );
  });

  it("executes imports and writes config/import-result artifacts for new markets", async () => {
    const mock: MockFs = { files: {}, directories: new Set(["data"]) };
    const io = createIo(mock);
    const runImport = vi.fn(async () => createImportResult("KXBTC15M-26JAN151215-00"));

    const summary = await runHistoricalExpansionImport({
      generatedAt: GENERATED_AT,
      config: {
        inputPath: CONFIG_PATH,
        outputPath: "data/research-results/historical-expansion-import-summary.json",
        htmlOutputPath: "data/reports/historical-expansion-import-summary.html",
        importConfigsDir: "data/import-configs",
        importsDir: "data/imports",
        fixturesDir: "data/fixtures",
        researchResultsDir: "data/research-results",
        execute: true,
        maxMarkets: 1,
        jobId: "expansion-KXBTC15M-20260101-20260331",
        resume: false,
      },
      expansionConfigJson: createManifestJson(),
      io,
      deps: {
        discoverMarkets: vi.fn(async () => [
          {
            marketTicker: "KXBTC15M-26JAN151215-00",
            seriesTicker: "KXBTC15M",
            openTime: "2026-01-15T12:00:00.000Z",
            closeTime: "2026-01-15T12:15:00.000Z",
          },
          {
            marketTicker: "KXBTC15M-26JAN151230-00",
            seriesTicker: "KXBTC15M",
            openTime: "2026-01-15T12:15:00.000Z",
            closeTime: "2026-01-15T12:30:00.000Z",
          },
        ]),
        runImport,
      },
    });

    expect(summary.summary.importedCount).toBe(1);
    expect(summary.summary.plannedCount).toBe(0);
    expect(runImport).toHaveBeenCalledTimes(1);
    expect(
      io.writes.has(
        "data/import-configs/KXBTC15M/KXBTC15M-26JAN151215-00/config.json",
      ),
    ).toBe(true);
    expect(
      io.writes.has(
        "data/imports/KXBTC15M/KXBTC15M-26JAN151215-00/import-result.json",
      ),
    ).toBe(true);
    expect(serializeHistoricalExpansionImportSummary(summary)).toContain(
      "historical-expansion-import-summary",
    );
  });

  it("skips markets already present in existing datasets", async () => {
    const mock: MockFs = { files: {}, directories: new Set(["data"]) };
    mock.files["data/import-configs/KXBTC15M/KXBTC15M-26JAN151215-00/config.json"] =
      JSON.stringify({ marketTicker: "KXBTC15M-26JAN151215-00" });

    const summary = await runHistoricalExpansionImport({
      generatedAt: GENERATED_AT,
      config: {
        inputPath: CONFIG_PATH,
        outputPath: "data/research-results/historical-expansion-import-summary.json",
        htmlOutputPath: "data/reports/historical-expansion-import-summary.html",
        importConfigsDir: "data/import-configs",
        importsDir: "data/imports",
        fixturesDir: "data/fixtures",
        researchResultsDir: "data/research-results",
        execute: true,
        maxMarkets: null,
        jobId: null,
        resume: false,
      },
      expansionConfigJson: createManifestJson(),
      io: createIo(mock),
      deps: {
        discoverMarkets: vi.fn(async () => [
          {
            marketTicker: "KXBTC15M-26JAN151215-00",
            seriesTicker: "KXBTC15M",
            openTime: "2026-01-15T12:00:00.000Z",
            closeTime: "2026-01-15T12:15:00.000Z",
          },
        ]),
        runImport: vi.fn(),
      },
    });

    expect(summary.summary.skippedCount).toBe(1);
    expect(summary.jobs[0]?.markets[0]?.skipReason).toContain("already present");
  });

  it("reports dry-run progress with planned counts and max-markets cap", async () => {
    const mock: MockFs = { files: {}, directories: new Set(["data"]) };
    const io = createIo(mock);
    const reportJobHeader = vi.fn();
    const recordMarket = vi.fn();
    const completeJob = vi.fn();
    const complete = vi.fn();

    await runHistoricalExpansionImport({
      generatedAt: GENERATED_AT,
      config: {
        inputPath: CONFIG_PATH,
        outputPath: "data/research-results/historical-expansion-import-summary.json",
        htmlOutputPath: "data/reports/historical-expansion-import-summary.html",
        importConfigsDir: "data/import-configs",
        importsDir: "data/imports",
        fixturesDir: "data/fixtures",
        researchResultsDir: "data/research-results",
        execute: false,
        maxMarkets: 1,
        jobId: null,
        resume: false,
      },
      expansionConfigJson: createManifestJson(),
      io,
      deps: {
        discoverMarkets: vi.fn(async () => [
          {
            marketTicker: "KXBTC15M-26JAN151215-00",
            seriesTicker: "KXBTC15M",
            openTime: "2026-01-15T12:00:00.000Z",
            closeTime: "2026-01-15T12:15:00.000Z",
          },
          {
            marketTicker: "KXBTC15M-26JAN151230-00",
            seriesTicker: "KXBTC15M",
            openTime: "2026-01-15T12:15:00.000Z",
            closeTime: "2026-01-15T12:30:00.000Z",
          },
        ]),
        runImport: vi.fn(),
      },
      progress: {
        reportJobHeader,
        recordMarket,
        completeJob,
        complete,
      },
    });

    expect(reportJobHeader).toHaveBeenCalledWith(
      expect.objectContaining({
        dryRun: true,
        maxMarkets: 1,
        discoveredCount: 2,
        alreadyCoveredCount: 0,
        toImportCount: 1,
      }),
    );
    expect(recordMarket).toHaveBeenCalledTimes(1);
    expect(recordMarket).toHaveBeenCalledWith("planned", "KXBTC15M-26JAN151215-00");
    expect(completeJob).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("reports execute progress with imported and failed counts", async () => {
    const mock: MockFs = { files: {}, directories: new Set(["data"]) };
    const io = createIo(mock);
    const recordMarket = vi.fn();

    await runHistoricalExpansionImport({
      generatedAt: GENERATED_AT,
      config: {
        inputPath: CONFIG_PATH,
        outputPath: "data/research-results/historical-expansion-import-summary.json",
        htmlOutputPath: "data/reports/historical-expansion-import-summary.html",
        importConfigsDir: "data/import-configs",
        importsDir: "data/imports",
        fixturesDir: "data/fixtures",
        researchResultsDir: "data/research-results",
        execute: true,
        maxMarkets: null,
        jobId: null,
        resume: true,
      },
      expansionConfigJson: createManifestJson(),
      io,
      deps: {
        discoverMarkets: vi.fn(async () => [
          {
            marketTicker: "KXBTC15M-26JAN151215-00",
            seriesTicker: "KXBTC15M",
            openTime: "2026-01-15T12:00:00.000Z",
            closeTime: "2026-01-15T12:15:00.000Z",
          },
          {
            marketTicker: "KXBTC15M-26JAN151230-00",
            seriesTicker: "KXBTC15M",
            openTime: null,
            closeTime: null,
          },
        ]),
        runImport: vi.fn(async () => createImportResult("KXBTC15M-26JAN151215-00")),
      },
      progress: {
        reportJobHeader: vi.fn(),
        recordMarket,
        completeJob: vi.fn(),
        complete: vi.fn(),
      },
    });

    expect(recordMarket).toHaveBeenCalledWith("imported", "KXBTC15M-26JAN151215-00");
    expect(recordMarket).toHaveBeenCalledWith("skipped", "KXBTC15M-26JAN151230-00");
  });
});
