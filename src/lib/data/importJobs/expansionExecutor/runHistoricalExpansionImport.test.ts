import { describe, expect, it, vi } from "vitest";

import {
  HistoricalBronzeImportBtcInterval,
  HistoricalBronzeImportBtcProvider,
  HistoricalBronzeImportKalshiSource,
  HistoricalBronzeImportOutputFormat,
} from "@/lib/data/importJobs/config";
import type { HistoricalBronzeImportJobResult } from "@/lib/data/importJobs/historicalBronzeImportJobTypes";
import {
  parseExpansionImportCheckpointJson,
  serializeExpansionImportCheckpoint,
} from "@/lib/data/importJobs/expansionImportSafety";

import { KALSHI_DISCOVERY_LIST_MARKET_METADATA_KEY } from "@/lib/data/importers/kalshi/kalshiMarketSchemaReconciliation";

import { buildExpansionMarketImportArtifacts } from "./buildExpansionMarketImportConfig";
import { EXPANSION_IMPORT_CIRCUIT_BREAKER_WINDOW } from "./expansionImportCircuitBreaker";
import { EXPANSION_RATE_LIMIT_CASCADE_ABORT_THRESHOLD } from "./expansionImportRateLimit";
import type { ExpansionDiscoveredMarket, ExpansionExecutorIo } from "./expansionExecutorTypes";

import {
  runHistoricalExpansionImport,
  serializeHistoricalExpansionImportSummary,
} from "./runHistoricalExpansionImport";
import { scanExistingExpansionMarketTickers } from "./scanExistingExpansionMarketTickers";
import { serializeHistoricalExpansionImportSummaryHtml } from "./serializeHistoricalExpansionImportSummaryHtml";
import { KalshiHistoricalImporterError } from "@/lib/data/importers/kalshi/KalshiHistoricalImporter";

const GENERATED_AT = "2026-07-04T04:00:00.000Z";
const CONFIG_PATH = "data/import-configs/historical-expansion-config.json";
const SUMMARY_PATH = "data/research-results/historical-expansion-import-summary.json";
const CHECKPOINT_PATH = "data/research-results/historical-expansion-import-checkpoint.json";
const JOB_ID = "expansion-KXBTC15M-20260101-20260331";

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
        jobId: JOB_ID,
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
      const prefix = path.replace(/\\/g, "/");
      const entries = new Set<string>();
      for (const filePath of Object.keys(mock.files)) {
        if (filePath.startsWith(`${prefix}/`)) {
          entries.add(filePath.slice(prefix.length + 1).split("/")[0]!);
        }
      }
      for (const directory of mock.directories) {
        if (directory.startsWith(`${prefix}/`)) {
          entries.add(directory.slice(prefix.length + 1).split("/")[0]!);
        }
      }
      return [...entries].sort();
    },
    readFile: (path) => mock.files[path] ?? "",
    fileExists: (path) =>
      mock.files[path] !== undefined || mock.directories.has(path),
    isDirectory: (path) => mock.directories.has(path),
    writeFile: (path, data) => {
      writes.set(path, data);
      mock.files[path] = data;
    },
    mkdirSync: () => {},
  };
}

function createBaseConfig(overrides?: Partial<{
  execute: boolean;
  resume: boolean;
  maxRetries: number;
  skipFailed: boolean;
  forceMarket: string | null;
  maxMarkets: number | null;
  rateLimitBackoffMs: number;
  maxRateLimitRetries: number;
}>) {
  return {
    inputPath: CONFIG_PATH,
    outputPath: SUMMARY_PATH,
    htmlOutputPath: "data/reports/historical-expansion-import-summary.html",
    importConfigsDir: "data/import-configs",
    importsDir: "data/imports",
    fixturesDir: "data/fixtures",
    researchResultsDir: "data/research-results",
    checkpointPath: CHECKPOINT_PATH,
    summaryInputPath: null,
    execute: true,
    maxMarkets: null,
    jobId: null,
    resume: false,
    skipFailed: false,
    forceMarket: null,
    maxRetries: 2,
    traceMarket: null,
    marketTicker: null,
    singleMarketOutputPath:
      "data/research-results/single-market-expansion-import-debug.json",
    singleMarketHtmlOutputPath: "data/reports/single-market-expansion-import-debug.html",
    rateLimitBackoffMs: 1000,
    maxRateLimitRetries: 2,
    sampleStrategy: "supported-first",
    ...overrides,
  };
}

function createExpansionDiscoveredMarket(
  overrides: Partial<ExpansionDiscoveredMarket> & Pick<ExpansionDiscoveredMarket, "marketTicker">,
): ExpansionDiscoveredMarket {
  const eventTicker = overrides.eventTicker
    ?? overrides.marketTicker.split("-").slice(0, 2).join("-");
  const openTime = overrides.openTime ?? "2026-01-15T12:00:00.000Z";
  const closeTime = overrides.closeTime ?? "2026-01-15T12:15:00.000Z";
  const expirationValue = overrides.expirationValue ?? "60010.25";

  return {
    seriesTicker: "KXBTC15M",
    eventTicker,
    status: "finalized",
    openTime,
    closeTime,
    settlementTime: "2026-01-15T12:20:00.000Z",
    expirationValue,
    title: null,
    subtitle: null,
    listMarketWire: {
      ticker: overrides.marketTicker,
      event_ticker: eventTicker,
      series_ticker: "KXBTC15M",
      status: "finalized",
      open_time: openTime,
      close_time: closeTime,
      expiration_value: expirationValue,
    },
    provenance: {
      source: "kalshi-historical-api",
      fetchedAt: GENERATED_AT,
      requestPath: "/historical/markets?series_ticker=KXBTC15M",
    },
    ...overrides,
  };
}

const DISCOVERED_MARKETS = [
  createExpansionDiscoveredMarket({
    marketTicker: "KXBTC15M-26JAN151215-00",
    openTime: "2026-01-15T12:00:00.000Z",
    closeTime: "2026-01-15T12:15:00.000Z",
  }),
  createExpansionDiscoveredMarket({
    marketTicker: "KXBTC15M-26JAN151230-00",
    openTime: "2026-01-15T12:15:00.000Z",
    closeTime: "2026-01-15T12:30:00.000Z",
  }),
  createExpansionDiscoveredMarket({
    marketTicker: "KXBTC15M-26JAN151245-00",
    openTime: "2026-01-15T12:30:00.000Z",
    closeTime: "2026-01-15T12:45:00.000Z",
  }),
];

describe("buildExpansionMarketImportArtifacts", () => {
  it("preserves Coinbase and Kalshi REST routing from expansion job defaults", () => {
    const manifest = JSON.parse(createManifestJson());
    const artifacts = buildExpansionMarketImportArtifacts(
      manifest.jobs[0],
      createExpansionDiscoveredMarket({
        marketTicker: "KXBTC15M-26JAN151215-00",
        openTime: "2026-01-15T12:00:00.000Z",
        closeTime: "2026-01-15T12:15:00.000Z",
      }),
      {
        importConfigsDir: "data/import-configs",
        importsDir: "data/imports",
      },
    );

    expect(artifacts.config.btc.provider).toBe("coinbase-spot");
    expect(artifacts.config.btc.interval).toBe("1m");
    expect(artifacts.config.kalshi.marketSource).toBe("kalshi-rest");
    expect(artifacts.config.metadata[KALSHI_DISCOVERY_LIST_MARKET_METADATA_KEY]).toMatchObject({
      ticker: "KXBTC15M-26JAN151215-00",
      expiration_value: "60010.25",
    });
  });
});

describe("scanExistingExpansionMarketTickers", () => {
  it("collects tickers from import configs, fixtures, and research outputs", () => {
    const mock: MockFs = { files: {}, directories: new Set(["data"]) };
    mock.directories.add("data/import-configs");
    mock.directories.add("data/import-configs/KXBTC15M");
    mock.directories.add("data/import-configs/KXBTC15M/MKT-A");
    mock.files["data/import-configs/KXBTC15M/MKT-A/config.json"] = JSON.stringify({
      marketTicker: "MKT-A",
    });
    mock.directories.add("data/fixtures");
    mock.directories.add("data/fixtures/KXBTC15M");
    mock.files["data/fixtures/KXBTC15M/MKT-B.json"] = JSON.stringify({
      marketTicker: "MKT-B",
    });
    mock.directories.add("data/research-results");
    mock.directories.add("data/research-results/noop");
    mock.directories.add("data/research-results/noop/KXBTC15M");
    mock.directories.add("data/research-results/noop/KXBTC15M/MKT-C");
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

describe("runHistoricalExpansionImport safety", () => {
  it("skips markets already recorded in checkpoint on resume", async () => {
    const mock: MockFs = { files: {}, directories: new Set(["data"]) };
    mock.files[CHECKPOINT_PATH] = serializeExpansionImportCheckpoint({
      generatedAt: GENERATED_AT,
      updatedAt: GENERATED_AT,
      inputPath: CONFIG_PATH,
      checkpointPath: CHECKPOINT_PATH,
      resume: true,
      runStatus: "partial",
      maxRetries: 2,
      jobs: [
        {
          jobId: JOB_ID,
          lastCompletedMarketTicker: "KXBTC15M-26JAN151215-00",
          completedMarkets: ["KXBTC15M-26JAN151215-00"],
          failedMarkets: [],
        },
      ],
    });
    const io = createIo(mock);
    const runImport = vi.fn(async () => createImportResult("KXBTC15M-26JAN151230-00"));

    const summary = await runHistoricalExpansionImport({
      generatedAt: GENERATED_AT,
      config: createBaseConfig({ resume: true }),
      expansionConfigJson: createManifestJson(),
      io,
      deps: {
        discoverMarkets: vi.fn(async () => DISCOVERED_MARKETS.slice(0, 2)),
        runImport,
      },
    });

    expect(runImport).toHaveBeenCalledTimes(1);
    expect(summary.summary.skippedCount).toBe(1);
    expect(summary.jobs[0]?.markets[0]?.skipReason).toContain("checkpoint");
  });

  it("resumes after an interrupted import and completes remaining markets", async () => {
    const mock: MockFs = { files: {}, directories: new Set(["data"]) };
    mock.files[CHECKPOINT_PATH] = serializeExpansionImportCheckpoint({
      generatedAt: GENERATED_AT,
      updatedAt: GENERATED_AT,
      inputPath: CONFIG_PATH,
      checkpointPath: CHECKPOINT_PATH,
      resume: true,
      runStatus: "interrupted",
      maxRetries: 2,
      jobs: [
        {
          jobId: JOB_ID,
          lastCompletedMarketTicker: "KXBTC15M-26JAN151215-00",
          completedMarkets: ["KXBTC15M-26JAN151215-00"],
          failedMarkets: [],
        },
      ],
    });
    const io = createIo(mock);
    const runImport = vi.fn(async (config) =>
      createImportResult(config.marketTicker),
    );

    const summary = await runHistoricalExpansionImport({
      generatedAt: GENERATED_AT,
      config: createBaseConfig({ resume: true }),
      expansionConfigJson: createManifestJson(),
      io,
      deps: {
        discoverMarkets: vi.fn(async () => DISCOVERED_MARKETS.slice(0, 2)),
        runImport,
      },
    });

    expect(summary.runStatus).toBe("completed");
    expect(summary.summary.importedCount).toBe(1);
    expect(runImport).toHaveBeenCalledTimes(1);
  });

  it("retries a failed market and succeeds on the next attempt", async () => {
    const mock: MockFs = { files: {}, directories: new Set(["data"]) };
    mock.files[CHECKPOINT_PATH] = serializeExpansionImportCheckpoint({
      generatedAt: GENERATED_AT,
      updatedAt: GENERATED_AT,
      inputPath: CONFIG_PATH,
      checkpointPath: CHECKPOINT_PATH,
      resume: true,
      runStatus: "partial",
      maxRetries: 2,
      jobs: [
        {
          jobId: JOB_ID,
          lastCompletedMarketTicker: null,
          completedMarkets: [],
          failedMarkets: [
            {
              marketTicker: "KXBTC15M-26JAN151215-00",
              retryCount: 1,
              lastErrorMessage: "boom",
              lastAttemptAt: GENERATED_AT,
            },
          ],
        },
      ],
    });
    const io = createIo(mock);
    const runImport = vi.fn(async () => createImportResult("KXBTC15M-26JAN151215-00"));

    const summary = await runHistoricalExpansionImport({
      generatedAt: GENERATED_AT,
      config: createBaseConfig({ resume: true, maxRetries: 2 }),
      expansionConfigJson: createManifestJson(),
      io,
      deps: {
        discoverMarkets: vi.fn(async () => [DISCOVERED_MARKETS[0]!]),
        runImport,
      },
    });

    expect(runImport).toHaveBeenCalledTimes(1);
    expect(summary.summary.importedCount).toBe(1);
    expect(summary.runStatus).toBe("completed");
  });

  it("stops retrying after max retries are exhausted", async () => {
    const mock: MockFs = { files: {}, directories: new Set(["data"]) };
    mock.files[CHECKPOINT_PATH] = serializeExpansionImportCheckpoint({
      generatedAt: GENERATED_AT,
      updatedAt: GENERATED_AT,
      inputPath: CONFIG_PATH,
      checkpointPath: CHECKPOINT_PATH,
      resume: true,
      runStatus: "partial",
      maxRetries: 1,
      jobs: [
        {
          jobId: JOB_ID,
          lastCompletedMarketTicker: null,
          completedMarkets: [],
          failedMarkets: [
            {
              marketTicker: "KXBTC15M-26JAN151215-00",
              retryCount: 1,
              lastErrorMessage: "boom",
              lastAttemptAt: GENERATED_AT,
            },
          ],
        },
      ],
    });
    const io = createIo(mock);
    const runImport = vi.fn(async () => {
      throw new Error("still failing");
    });

    const summary = await runHistoricalExpansionImport({
      generatedAt: GENERATED_AT,
      config: createBaseConfig({ resume: true, maxRetries: 1 }),
      expansionConfigJson: createManifestJson(),
      io,
      deps: {
        discoverMarkets: vi.fn(async () => [DISCOVERED_MARKETS[0]!]),
        runImport,
      },
    });

    expect(runImport).not.toHaveBeenCalled();
    expect(summary.summary.skippedCount).toBe(1);
    expect(summary.jobs[0]?.markets[0]?.skipReason).toContain("Retry exhausted");
    expect(summary.runStatus).toBe("partial");
  });

  it("writes partial summary and checkpoint after each executed market", async () => {
    const mock: MockFs = { files: {}, directories: new Set(["data"]) };
    const io = createIo(mock);
    const partialSummaries: string[] = [];
    const runImport = vi.fn(async (config) => createImportResult(config.marketTicker));

    await runHistoricalExpansionImport({
      generatedAt: GENERATED_AT,
      config: createBaseConfig(),
      expansionConfigJson: createManifestJson(),
      io,
      deps: {
        discoverMarkets: vi.fn(async () => DISCOVERED_MARKETS.slice(0, 2)),
        runImport,
      },
      onPersist: ({ summaryJson }) => {
        partialSummaries.push(summaryJson);
      },
    });

    expect(partialSummaries.length).toBeGreaterThanOrEqual(2);
    const lastPartial = JSON.parse(partialSummaries.at(-1)!);
    expect(lastPartial.runStatus).toBe("completed");
    expect(io.writes.has(CHECKPOINT_PATH)).toBe(true);
    expect(io.writes.has(SUMMARY_PATH)).toBe(true);

    const checkpoint = parseExpansionImportCheckpointJson(
      CHECKPOINT_PATH,
      io.writes.get(CHECKPOINT_PATH)!,
    );
    expect(checkpoint.jobs[0]?.completedMarkets).toHaveLength(2);
  });

  it("records interrupted status when the abort signal fires", async () => {
    const mock: MockFs = { files: {}, directories: new Set(["data"]) };
    const io = createIo(mock);
    const controller = new AbortController();
    const runImport = vi.fn(async (config) => {
      if (config.marketTicker === "KXBTC15M-26JAN151215-00") {
        controller.abort();
      }
      return createImportResult(config.marketTicker);
    });

    const summary = await runHistoricalExpansionImport({
      generatedAt: GENERATED_AT,
      config: createBaseConfig(),
      expansionConfigJson: createManifestJson(),
      io,
      signal: controller.signal,
      deps: {
        discoverMarkets: vi.fn(async () => DISCOVERED_MARKETS.slice(0, 2)),
        runImport,
      },
    });

    expect(summary.runStatus).toBe("interrupted");
    expect(summary.summary.importedCount).toBe(1);
  });

  it("dry-runs scheduled jobs without writing checkpoint artifacts", async () => {
    const mock: MockFs = { files: {}, directories: new Set(["data"]) };
    const io = createIo(mock);

    const summary = await runHistoricalExpansionImport({
      generatedAt: GENERATED_AT,
      config: createBaseConfig({ execute: false }),
      expansionConfigJson: createManifestJson(),
      io,
      deps: {
        discoverMarkets: vi.fn(async () => [DISCOVERED_MARKETS[0]!]),
        runImport: vi.fn(),
      },
    });

    expect(summary.execute).toBe(false);
    expect(summary.summary.plannedCount).toBe(1);
    expect(io.writes.size).toBe(0);
    expect(serializeHistoricalExpansionImportSummaryHtml(summary)).toContain(
      "Historical Expansion Import Summary",
    );
    expect(serializeHistoricalExpansionImportSummaryHtml(summary)).toContain(
      "Selection strategy",
    );
    expect(serializeHistoricalExpansionImportSummary(summary)).toContain(
      "historical-expansion-import-summary",
    );
  });

  it("respects max-markets when planning and executing imports", async () => {
    const mock: MockFs = { files: {}, directories: new Set(["data"]) };
    const io = createIo(mock);
    const runImport = vi.fn(async (config) => createImportResult(config.marketTicker));

    const summary = await runHistoricalExpansionImport({
      generatedAt: GENERATED_AT,
      config: createBaseConfig({ maxMarkets: 1 }),
      expansionConfigJson: createManifestJson(),
      io,
      deps: {
        discoverMarkets: vi.fn(async () => DISCOVERED_MARKETS),
        runImport,
      },
    });

    expect(runImport).toHaveBeenCalledTimes(1);
    expect(summary.summary.importedCount).toBe(1);
    expect(summary.summary.plannedCount).toBe(1);
    expect(summary.jobs[0]?.warnings).toContainEqual(
      expect.stringContaining("--max-markets"),
    );
  });

  it("aborts execute imports when the compatibility failure-rate circuit breaker trips", async () => {
    const mock: MockFs = { files: {}, directories: new Set(["data"]) };
    const io = createIo(mock);
    const compatibilityError =
      "Kalshi historical market response missing required fields: expiration_value. Raw response saved to data/debug/kalshi-market-KXBTC15M-25DEC311900-00.json.";
    const discovered = Array.from({ length: EXPANSION_IMPORT_CIRCUIT_BREAKER_WINDOW + 5 }, (_, index) =>
      createExpansionDiscoveredMarket({
        marketTicker: `KXBTC15M-TICKER-${index}`,
      }),
    );
    const runImport = vi.fn(async () => {
      throw new Error(compatibilityError);
    });

    const summary = await runHistoricalExpansionImport({
      generatedAt: GENERATED_AT,
      config: createBaseConfig(),
      expansionConfigJson: createManifestJson(),
      io,
      deps: {
        discoverMarkets: vi.fn(async () => discovered),
        runImport,
      },
    });

    expect(runImport).toHaveBeenCalledTimes(EXPANSION_IMPORT_CIRCUIT_BREAKER_WINDOW);
    expect(summary.runStatus).toBe("interrupted");
    expect(summary.warnings.join(" ")).toContain("circuit breaker");
    expect(summary.warnings.join(" ")).toContain("import-compatibility");
  });

  it("does not trip the compatibility circuit breaker when expansion imports succeed", async () => {
    const mock: MockFs = { files: {}, directories: new Set(["data"]) };
    const io = createIo(mock);
    const runImport = vi.fn(async () => createImportResult("KXBTC15M-26JAN151215-00"));

    const summary = await runHistoricalExpansionImport({
      generatedAt: GENERATED_AT,
      config: createBaseConfig(),
      expansionConfigJson: createManifestJson(),
      io,
      deps: {
        discoverMarkets: vi.fn(async () => [DISCOVERED_MARKETS[0]!]),
        runImport,
      },
    });

    expect(runImport).toHaveBeenCalledTimes(1);
    expect(summary.summary.importedCount).toBe(1);
    expect(summary.warnings.join(" ")).not.toContain("circuit breaker");
    expect(summary.runStatus).toBe("completed");
  });

  it("backs off and retries a single 429 before importing successfully", async () => {
    const mock: MockFs = { files: {}, directories: new Set(["data"]) };
    const io = createIo(mock);
    const sleep = vi.fn(async () => {});
    const attemptsByTicker = new Map<string, number>();
    const runImport = vi.fn(async (config) => {
      const attempts = attemptsByTicker.get(config.marketTicker) ?? 0;
      attemptsByTicker.set(config.marketTicker, attempts + 1);
      if (attempts === 0) {
        throw new KalshiHistoricalImporterError("Kalshi historical API error (429)", 429);
      }

      return createImportResult(config.marketTicker);
    });

    const summary = await runHistoricalExpansionImport({
      generatedAt: GENERATED_AT,
      config: createBaseConfig({ maxRateLimitRetries: 1, rateLimitBackoffMs: 500 }),
      expansionConfigJson: createManifestJson(),
      io,
      sleep,
      deps: {
        discoverMarkets: vi.fn(async () => [DISCOVERED_MARKETS[0]!]),
        runImport,
      },
    });

    expect(runImport).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(500);
    expect(summary.summary.importedCount).toBe(1);
    expect(summary.rateLimitDiagnostics.rateLimitedCount).toBe(1);
    expect(summary.rateLimitDiagnostics.backoffDurationMs).toBe(500);
    expect(summary.rateLimitDiagnostics.firstRateLimitedTicker).toBe(
      DISCOVERED_MARKETS[0]!.marketTicker,
    );
  });

  it("aborts repeated 429 cascades without tripping the compatibility circuit breaker", async () => {
    const mock: MockFs = { files: {}, directories: new Set(["data"]) };
    const io = createIo(mock);
    const discovered = Array.from(
      { length: EXPANSION_RATE_LIMIT_CASCADE_ABORT_THRESHOLD + 2 },
      (_, index) =>
        createExpansionDiscoveredMarket({
          marketTicker: `KXBTC15M-RATE-${index}`,
        }),
    );
    const runImport = vi.fn(async () => {
      throw new KalshiHistoricalImporterError("Kalshi historical API error (429)", 429);
    });

    const summary = await runHistoricalExpansionImport({
      generatedAt: GENERATED_AT,
      config: createBaseConfig({ maxRateLimitRetries: 0, rateLimitBackoffMs: 10 }),
      expansionConfigJson: createManifestJson(),
      io,
      sleep: vi.fn(async () => {}),
      deps: {
        discoverMarkets: vi.fn(async () => discovered),
        runImport,
      },
    });

    expect(runImport).toHaveBeenCalledTimes(EXPANSION_RATE_LIMIT_CASCADE_ABORT_THRESHOLD);
    expect(summary.runStatus).toBe("interrupted");
    expect(summary.warnings.join(" ")).toContain("consecutive rate-limited market failures");
    expect(summary.warnings.join(" ")).not.toContain("import-compatibility");
    expect(summary.rateLimitDiagnostics.rateLimitedCount).toBe(0);
    expect(summary.rateLimitDiagnostics.firstRateLimitedTicker).toBe("KXBTC15M-RATE-0");
  });
});

describe("runHistoricalExpansionImport cap enforcement", () => {
  it("attempts at most max-markets imports even when every attempt fails", async () => {
    const mock: MockFs = { files: {}, directories: new Set(["data"]) };
    const io = createIo(mock);
    const discovered = Array.from({ length: 25 }, (_, index) =>
      createExpansionDiscoveredMarket({
        marketTicker: `KXBTC15M-TICKER-${index}`,
      }),
    );
    const runImport = vi.fn(async () => {
      throw new Error("import failed");
    });
    const recordMarket = vi.fn();

    const summary = await runHistoricalExpansionImport({
      generatedAt: GENERATED_AT,
      config: createBaseConfig({ maxMarkets: 10 }),
      expansionConfigJson: createManifestJson(),
      io,
      deps: {
        discoverMarkets: vi.fn(async () => discovered),
        runImport,
      },
      progress: {
        reportJobHeader: vi.fn(),
        recordMarket,
        recordDedupedMarket: vi.fn(),
        reportAbortGuard: vi.fn(),
        completeJob: vi.fn(),
        complete: vi.fn(),
      },
    });

    expect(runImport).toHaveBeenCalledTimes(10);
    expect(summary.summary.plannedCount).toBe(10);
    expect(summary.summary.failedCount).toBe(10);
    expect(summary.summary.importedCount).toBe(0);
    expect(recordMarket).toHaveBeenCalledTimes(10);
    expect(summary.warnings.join("\n")).toContain("ABORT");
  });

  it("counts failures toward the max-markets cap without exceeding the planned queue", async () => {
    const mock: MockFs = { files: {}, directories: new Set(["data"]) };
    const io = createIo(mock);
    const runImport = vi.fn(async (config) => {
      if (
        config.marketTicker === "KXBTC15M-26JAN151215-00"
        || config.marketTicker === "KXBTC15M-26JAN151230-00"
      ) {
        throw new Error(`failure-${config.marketTicker}`);
      }
      return createImportResult(config.marketTicker);
    });

    const summary = await runHistoricalExpansionImport({
      generatedAt: GENERATED_AT,
      config: createBaseConfig({ maxMarkets: 3 }),
      expansionConfigJson: createManifestJson(),
      io,
      deps: {
        discoverMarkets: vi.fn(async () => DISCOVERED_MARKETS),
        runImport,
      },
    });

    expect(runImport).toHaveBeenCalledTimes(3);
    expect(summary.summary.plannedCount).toBe(3);
    expect(summary.summary.failedCount).toBe(2);
    expect(summary.summary.importedCount).toBe(1);
  });

  it("does not count deduped markets against max-markets", async () => {
    const mock: MockFs = { files: {}, directories: new Set(["data"]) };
    mock.directories.add("data/import-configs");
    mock.directories.add("data/import-configs/KXBTC15M");
    mock.directories.add("data/import-configs/KXBTC15M/KXBTC15M-26JAN151215-00");
    mock.files["data/import-configs/KXBTC15M/KXBTC15M-26JAN151215-00/config.json"] =
      JSON.stringify({ marketTicker: "KXBTC15M-26JAN151215-00" });
    const io = createIo(mock);
    const runImport = vi.fn(async (config) => createImportResult(config.marketTicker));
    const recordDedupedMarket = vi.fn();

    const summary = await runHistoricalExpansionImport({
      generatedAt: GENERATED_AT,
      config: createBaseConfig({ maxMarkets: 1 }),
      expansionConfigJson: createManifestJson(),
      io,
      deps: {
        discoverMarkets: vi.fn(async () => DISCOVERED_MARKETS),
        runImport,
      },
      progress: {
        reportJobHeader: vi.fn(),
        recordMarket: vi.fn(),
        recordDedupedMarket,
        reportAbortGuard: vi.fn(),
        completeJob: vi.fn(),
        complete: vi.fn(),
      },
    });

    expect(runImport).toHaveBeenCalledTimes(1);
    expect(recordDedupedMarket).toHaveBeenCalledWith("KXBTC15M-26JAN151215-00");
    expect(summary.summary.plannedCount).toBe(1);
    expect(summary.summary.skippedCount).toBe(1);
    expect(summary.summary.importedCount).toBe(1);
  });

  it("applies max-markets across multiple scheduled jobs", async () => {
    const manifest = JSON.parse(createManifestJson());
    manifest.jobs.push({
      ...manifest.jobs[0],
      jobId: "expansion-KXBTC15M-20260401-20260630",
      priority: 72,
      discovery: {
        ...manifest.jobs[0].discovery,
        sampling: {
          afterDate: "2026-04-01T00:00:00.000Z",
          beforeDate: "2026-06-30T23:59:59.999Z",
        },
      },
    });
    const mock: MockFs = { files: {}, directories: new Set(["data"]) };
    const io = createIo(mock);
    const runImport = vi.fn(async (config) => createImportResult(config.marketTicker));
    let jobDiscoveryCount = 0;

    const summary = await runHistoricalExpansionImport({
      generatedAt: GENERATED_AT,
      config: createBaseConfig({ maxMarkets: 2 }),
      expansionConfigJson: JSON.stringify(manifest),
      io,
      deps: {
        discoverMarkets: vi.fn(async () => {
          jobDiscoveryCount += 1;
          return jobDiscoveryCount === 1
            ? DISCOVERED_MARKETS.slice(0, 2)
            : DISCOVERED_MARKETS.slice(1, 3);
        }),
        runImport,
      },
    });

    expect(runImport).toHaveBeenCalledTimes(2);
    expect(summary.summary.plannedCount).toBe(2);
    expect(summary.summary.importedCount).toBe(2);
  });

  it("reports abort guard failure reasons when all planned markets fail", async () => {
    const mock: MockFs = { files: {}, directories: new Set(["data"]) };
    const io = createIo(mock);
    const reportAbortGuard = vi.fn();
    const runImport = vi.fn(async (config) => {
      throw new Error(`failed-${config.marketTicker}`);
    });

    const summary = await runHistoricalExpansionImport({
      generatedAt: GENERATED_AT,
      config: createBaseConfig({ maxMarkets: 2 }),
      expansionConfigJson: createManifestJson(),
      io,
      deps: {
        discoverMarkets: vi.fn(async () => DISCOVERED_MARKETS.slice(0, 2)),
        runImport,
      },
      progress: {
        reportJobHeader: vi.fn(),
        recordMarket: vi.fn(),
        recordDedupedMarket: vi.fn(),
        reportAbortGuard,
        completeJob: vi.fn(),
        complete: vi.fn(),
      },
    });

    expect(reportAbortGuard).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.stringContaining("ABORT"),
        expect.stringContaining("KXBTC15M-26JAN151215-00: failed-"),
      ]),
    );
    expect(summary.runStatus).toBe("interrupted");
    expect(summary.summary.plannedCount).toBe(2);
    expect(summary.summary.failedCount).toBe(2);
  });

  it("keeps progress denominator aligned with the planned queue length", async () => {
    const mock: MockFs = { files: {}, directories: new Set(["data"]) };
    const io = createIo(mock);
    const reportJobHeader = vi.fn();
    const recordMarket = vi.fn();
    const runImport = vi.fn(async () => {
      throw new Error("failed");
    });

    await runHistoricalExpansionImport({
      generatedAt: GENERATED_AT,
      config: createBaseConfig({ maxMarkets: 2, execute: false }),
      expansionConfigJson: createManifestJson(),
      io,
      deps: {
        discoverMarkets: vi.fn(async () => DISCOVERED_MARKETS),
        runImport,
      },
      progress: {
        reportJobHeader,
        recordMarket,
        recordDedupedMarket: vi.fn(),
        reportAbortGuard: vi.fn(),
        completeJob: vi.fn(),
        complete: vi.fn(),
      },
    });

    expect(reportJobHeader).toHaveBeenCalledWith(
      expect.objectContaining({ toImportCount: 2 }),
    );
    expect(recordMarket).toHaveBeenCalledTimes(2);
    expect(runImport).not.toHaveBeenCalled();
  });

  it("skips unsupported historical markets before import and reports unsupported counts", async () => {
    const unsupportedMarket = createExpansionDiscoveredMarket({
      marketTicker: "KXBTC15M-26UNSUPPORTED-00",
      expirationValue: "",
      listMarketWire: {
        ticker: "KXBTC15M-26UNSUPPORTED-00",
        event_ticker: "KXBTC15M-26UNSUPPORTED",
        series_ticker: "KXBTC15M",
        status: "finalized",
        open_time: "2026-01-15T12:00:00.000Z",
        close_time: "2026-01-15T12:15:00.000Z",
        expiration_value: "",
      },
    });
    const mock: MockFs = { files: {}, directories: new Set(["data"]) };
    const io = createIo(mock);
    const runImport = vi.fn(async (config) => createImportResult(config.marketTicker));

    const summary = await runHistoricalExpansionImport({
      generatedAt: GENERATED_AT,
      config: createBaseConfig({ execute: true, maxMarkets: 1 }),
      expansionConfigJson: createManifestJson(),
      io,
      deps: {
        discoverMarkets: vi.fn(async () => [unsupportedMarket]),
        runImport,
      },
    });

    expect(runImport).not.toHaveBeenCalled();
    expect(summary.summary.unsupportedCount).toBe(1);
    expect(summary.summary.skippedUnsupportedCount).toBe(1);
    expect(summary.summary.failedCount).toBe(0);
    expect(summary.jobs[0]?.markets[0]?.status).toBe("skipped");
    expect(summary.jobs[0]?.markets[0]?.skipReason).toBe(
      "Unsupported historical market: Missing expiration_value from Kalshi historical API.",
    );
  });

  it("prefers supported markets for planning and reports selection summary fields", async () => {
    const unsupportedFirst = createExpansionDiscoveredMarket({
      marketTicker: "KXBTC15M-26UNSUPPORTED-00",
      expirationValue: "",
      listMarketWire: {
        ticker: "KXBTC15M-26UNSUPPORTED-00",
        event_ticker: "KXBTC15M-26UNSUPPORTED",
        series_ticker: "KXBTC15M",
        status: "finalized",
        open_time: "2026-01-15T12:00:00.000Z",
        close_time: "2026-01-15T12:15:00.000Z",
        expiration_value: "",
      },
    });
    const importable = createExpansionDiscoveredMarket({
      marketTicker: "KXBTC15M-26IMPORTABLE-00",
    });
    const mock: MockFs = {
      files: {
        [SUMMARY_PATH]: JSON.stringify({
          jobs: [
            {
              markets: [
                {
                  marketTicker: "KXBTC15M-26IMPORTABLE-00",
                  status: "imported",
                },
                {
                  marketTicker: "KXBTC15M-26HISTORY-UNSUPPORTED-00",
                  status: "skipped",
                  skipReason:
                    "Unsupported historical market: Missing expiration_value from Kalshi historical API.",
                },
              ],
            },
          ],
        }),
      },
      directories: new Set(["data"]),
    };
    const io = createIo(mock);
    const runImport = vi.fn(async (config) => createImportResult(config.marketTicker));

    const summary = await runHistoricalExpansionImport({
      generatedAt: GENERATED_AT,
      config: createBaseConfig({ execute: true, maxMarkets: 1 }),
      expansionConfigJson: createManifestJson(),
      io,
      deps: {
        discoverMarkets: vi.fn(async () => [unsupportedFirst, importable]),
        runImport,
      },
    });

    expect(runImport).toHaveBeenCalledTimes(1);
    expect(runImport.mock.calls[0]?.[0].marketTicker).toBe("KXBTC15M-26IMPORTABLE-00");
    expect(summary.sampleStrategy).toBe("supported-first");
    expect(summary.selection.selectedSupportedMarkets).toBe(1);
    expect(summary.selection.selectedUnknownMarkets).toBe(0);
    expect(summary.selection.selectedUnsupportedMarkets).toBe(0);
    expect(summary.summary.selectedSupportedMarkets).toBe(1);
  });
});
