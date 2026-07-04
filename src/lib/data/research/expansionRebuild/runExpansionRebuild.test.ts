import { describe, expect, it } from "vitest";

import { DEFAULT_BACKTEST_FILL_SIMULATION_CONFIG } from "@/lib/data/backtesting/strategyTypes";
import { DATASET_BRONZE_CONTENT_TYPE } from "@/lib/data/datasets/datasetTypes";
import { DataSource } from "@/lib/data/provenance";
import { SILVER_BRONZE_CONTENT_TYPE } from "@/lib/data/silver";
import type { RawHistoricalRecord } from "@/lib/data/types";
import { DEFAULT_ENGINE_CONFIG } from "@/lib/trading/config/defaults";

import { BATCH_FIXTURE_OUTPUT_FILENAME } from "@/lib/data/importJobs/batchFixtureBridge/batchFixtureBridgeTypes";
import { BATCH_RESEARCH_OUTPUT_FILENAME } from "@/lib/data/research/batchResearch/batchResearchTypes";
import { parseHistoricalBronzeImportResultJson } from "@/lib/data/importJobs/batchFixtureBridge/parseHistoricalBronzeImportResultJson";
import { parseResearchFixtureJson } from "@/lib/data/research/registry/parseResearchFixtureJson";
import { runHistoricalResearchFromBronze } from "@/lib/data/research/runner";

import type { ExpansionRebuildIo } from "./expansionRebuildTypes";
import { runExpansionRebuild } from "./runExpansionRebuild";

const GENERATED_AT = "2026-07-04T12:00:00.000Z";
const SERIES = "KXBTC15M";
const MARKET_A = "KXBTC15M-MARKET-A";
const MARKET_B = "KXBTC15M-MARKET-B";
const SUMMARY_PATH = "data/research-results/historical-expansion-import-summary.json";

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

class MemoryExpansionRebuildIo implements ExpansionRebuildIo {
  private readonly files = new Map<string, string>();
  private readonly directories = new Set<string>();

  seedDirectory(path: string): void {
    this.directories.add(normalizePath(path));
  }

  seedFile(path: string, content: string): void {
    const normalized = normalizePath(path);
    this.files.set(normalized, content);
    const segments = normalized.split("/");
    for (let index = 1; index < segments.length; index += 1) {
      this.directories.add(segments.slice(0, index).join("/"));
    }
  }

  readdir(path: string): readonly string[] {
    const normalized = normalizePath(path);
    const prefix = `${normalized}/`;
    const entries = new Set<string>();

    for (const filePath of this.files.keys()) {
      if (!filePath.startsWith(prefix)) {
        continue;
      }

      const rest = filePath.slice(prefix.length);
      const entry = rest.split("/")[0];
      if (entry) {
        entries.add(entry);
      }
    }

    for (const directoryPath of this.directories) {
      if (!directoryPath.startsWith(prefix)) {
        continue;
      }

      const rest = directoryPath.slice(prefix.length);
      const entry = rest.split("/")[0];
      if (entry) {
        entries.add(entry);
      }
    }

    return [...entries].sort((left, right) => left.localeCompare(right));
  }

  readFile(path: string): string {
    const normalized = normalizePath(path);
    const value = this.files.get(normalized);
    if (value === undefined) {
      throw new Error(`missing file: ${normalized}`);
    }

    return value;
  }

  fileExists(path: string): boolean {
    const normalized = normalizePath(path);
    return this.files.has(normalized) || this.directories.has(normalized);
  }

  isDirectory(path: string): boolean {
    const normalized = normalizePath(path);
    if (this.directories.has(normalized)) {
      return true;
    }

    const prefix = `${normalized}/`;
    return [...this.files.keys(), ...this.directories].some((entry) => entry.startsWith(prefix));
  }

  writeFile(path: string, data: string): void {
    this.seedFile(path, data);
  }

  mkdirSync(path: string, options: { recursive: boolean }): void {
    void options;
    this.seedDirectory(path);
  }
}

function baseBronze(
  contentType: string,
  payload: Record<string, unknown>,
  options: {
    recordId: string;
    ticker: string;
    eventTime: string;
  },
): RawHistoricalRecord {
  return {
    recordId: options.recordId,
    ticker: options.ticker,
    contentType,
    eventTime: options.eventTime,
    collectionTime: "2026-06-27T01:00:00.000Z",
    observedAt: "2026-06-27T01:00:05.000Z",
    payload,
    provenance: {
      source: DataSource.KALSHI_REST,
      collectionTime: "2026-06-27T01:00:00.000Z",
      observedAt: "2026-06-27T01:00:05.000Z",
      fetchId: `fetch-${options.recordId}`,
    },
  };
}

function createFixtureJson(ticker: string): string {
  const eventTime = "2026-06-26T23:15:00.000Z";
  const closeTime = "2026-06-26T23:30:00.000Z";

  return JSON.stringify({
    runId: `fixture-${ticker}`,
    durationMs: 3_000,
    initialCashCents: 10_000,
    strategyId: "noop",
    engineConfig: DEFAULT_ENGINE_CONFIG,
    fillConfig: {
      ...DEFAULT_BACKTEST_FILL_SIMULATION_CONFIG,
      feeCentsPerContract: 1,
    },
    bronzeRecords: [
      baseBronze(
        SILVER_BRONZE_CONTENT_TYPE.MARKET,
        {
          open_time: eventTime,
          close_time: closeTime,
          floor_strike: 59_990.31,
          event_ticker: "KXBTC15M-EVENT",
          status: "closed",
        },
        { recordId: "market", ticker, eventTime },
      ),
      baseBronze(
        SILVER_BRONZE_CONTENT_TYPE.CANDLESTICK,
        {
          open_time: eventTime,
          close_time: closeTime,
          yes_bid_cents: 48,
          yes_ask_cents: 52,
          no_bid_cents: 47,
          no_ask_cents: 51,
          volume_contracts: 120,
        },
        { recordId: "candle", ticker, eventTime: closeTime },
      ),
      baseBronze(
        DATASET_BRONZE_CONTENT_TYPE.BTC_KLINE,
        {
          open_time: eventTime,
          close_time: closeTime,
          open_usd: 59_980.5,
          high_usd: 60_010.25,
          low_usd: 59_960.0,
          close_usd: 59_995.75,
          volume_btc: 12.5,
        },
        { recordId: "btc", ticker, eventTime: closeTime },
      ),
      baseBronze(
        SILVER_BRONZE_CONTENT_TYPE.SETTLEMENT,
        {
          floor_strike: 59_990.31,
          expiration_value: "60010.25",
          result: "yes",
          settlement_ts: closeTime,
        },
        { recordId: "settlement", ticker, eventTime },
      ),
    ],
  });
}

function createImportResultJson(ticker: string): string {
  const fixture = JSON.parse(createFixtureJson(ticker)) as { bronzeRecords: RawHistoricalRecord[] };

  return JSON.stringify({
    jobId: `import-${ticker}`,
    bronzeRecords: fixture.bronzeRecords,
    validationResult: {
      valid: true,
      errors: [],
      warnings: [],
      statistics: {},
    },
    metadata: {
      marketTicker: ticker,
    },
  });
}

function createSummaryJson(): string {
  return JSON.stringify({
    generatedAt: GENERATED_AT,
    execute: true,
    inputPath: "data/import-configs/historical-expansion-config.json",
    outputPath: SUMMARY_PATH,
    jobs: [
      {
        jobId: "expansion-job",
        seriesTicker: SERIES,
        markets: [
          {
            marketTicker: MARKET_B,
            seriesTicker: SERIES,
            status: "imported",
            importResultPath: `data/imports/${SERIES}/${MARKET_B}/import-result.json`,
          },
        ],
      },
    ],
  });
}

function createBaseIo(): MemoryExpansionRebuildIo {
  const io = new MemoryExpansionRebuildIo();

  io.seedFile(SUMMARY_PATH, createSummaryJson());
  io.seedFile(`data/imports/${SERIES}/${MARKET_B}/import-result.json`, createImportResultJson(MARKET_B));
  io.seedFile(
    `data/fixtures/${SERIES}/${MARKET_A}/${BATCH_FIXTURE_OUTPUT_FILENAME}`,
    createFixtureJson(MARKET_A),
  );
  io.seedFile(
    `data/research-results/noop/${SERIES}/${MARKET_A}/${BATCH_RESEARCH_OUTPUT_FILENAME}`,
    runHistoricalResearchFromBronze({
      bronzeRecords: JSON.parse(createFixtureJson(MARKET_A)).bronzeRecords,
      strategy: { strategyId: "noop", decide: () => [] },
      engineConfig: DEFAULT_ENGINE_CONFIG,
      initialCashCents: 10_000,
      runId: `fixture-${MARKET_A}`,
      durationMs: 3_000,
      fillConfig: {
        ...DEFAULT_BACKTEST_FILL_SIMULATION_CONFIG,
        feeCentsPerContract: 1,
      },
    }).serialized,
  );
  io.seedFile(
    "data/research-results/mispricing-atlas.json",
    JSON.stringify({ sampleCounts: { marketCount: 1 } }),
  );

  return io;
}

describe("runExpansionRebuild", () => {
  it("rebuilds fixtures and research outputs for newly imported markets only", async () => {
    const io = createBaseIo();
    const beforeFixtureCount = 1;

    const summary = await runExpansionRebuild(
      {
        expansionImportSummaryPath: SUMMARY_PATH,
        fixturesDir: "data/fixtures",
        importsDir: "data/imports",
        importConfigsDir: "data/import-configs",
        metadataDir: null,
        registryDir: "data/research-datasets",
        researchResultsDir: "data/research-results/noop",
        mispricingAtlasPath: "data/research-results/mispricing-atlas.json",
        outputPath: "data/research-results/expansion-rebuild-summary.json",
        htmlOutputPath: "data/reports/expansion-rebuild-summary.html",
        fullRebuild: false,
        concurrency: 1,
        generatedAt: GENERATED_AT,
      },
      io,
      {
        parseImportResultJson: parseHistoricalBronzeImportResultJson,
        runFixtureBridge: ({ marketTicker }) => createFixtureJson(marketTicker),
        parseFixtureJson: (json, marketTicker) => parseResearchFixtureJson(json, marketTicker),
        runResearch: ({ fixture }) =>
          runHistoricalResearchFromBronze({
            bronzeRecords: fixture.bronzeRecords,
            strategy: { strategyId: "noop", decide: () => [] },
            engineConfig: fixture.engineConfig,
            initialCashCents: fixture.initialCashCents,
            runId: fixture.runId,
            durationMs: fixture.durationMs,
            fillConfig: fixture.fillConfig,
          }).serialized,
      },
    );

    expect(summary.targetMarketCount).toBe(1);
    expect(summary.before.fixtureCount).toBe(beforeFixtureCount);
    expect(summary.targetMarketCount).toBe(1);
    expect(summary.after.fixtureCount).toBe(beforeFixtureCount + 1);
    expect(summary.summary.fixturesBuilt).toBe(1);
    expect(summary.researchResults).toHaveLength(1);
    expect(summary.researchResults[0]?.status).toBe("success");
    expect(summary.summary.researchRunsSucceeded).toBe(1);
    expect(summary.fixtureResults[0]?.status).toBe("success");
    expect(
      io.fileExists(`data/fixtures/${SERIES}/${MARKET_B}/${BATCH_FIXTURE_OUTPUT_FILENAME}`),
    ).toBe(true);
    expect(
      io.fileExists(
        `data/research-results/noop/${SERIES}/${MARKET_B}/${BATCH_RESEARCH_OUTPUT_FILENAME}`,
      ),
    ).toBe(true);
  });

  it("records per-market fixture failures without aborting the run", async () => {
    const io = createBaseIo();

    const summary = await runExpansionRebuild(
      {
        expansionImportSummaryPath: SUMMARY_PATH,
        fixturesDir: "data/fixtures",
        importsDir: "data/imports",
        importConfigsDir: "data/import-configs",
        metadataDir: null,
        registryDir: "data/research-datasets",
        researchResultsDir: "data/research-results/noop",
        mispricingAtlasPath: "data/research-results/mispricing-atlas.json",
        outputPath: "data/research-results/expansion-rebuild-summary.json",
        htmlOutputPath: "data/reports/expansion-rebuild-summary.html",
        fullRebuild: false,
        concurrency: 1,
        generatedAt: GENERATED_AT,
      },
      io,
      {
        parseImportResultJson: parseHistoricalBronzeImportResultJson,
        runFixtureBridge: () => {
          throw new Error("fixture bridge failed");
        },
        parseFixtureJson: (json, marketTicker) => parseResearchFixtureJson(json, marketTicker),
        runResearch: ({ fixture }) =>
          runHistoricalResearchFromBronze({
            bronzeRecords: fixture.bronzeRecords,
            strategy: { strategyId: "noop", decide: () => [] },
            engineConfig: fixture.engineConfig,
            initialCashCents: fixture.initialCashCents,
            runId: fixture.runId,
            durationMs: fixture.durationMs,
            fillConfig: fixture.fillConfig,
          }).serialized,
      },
    );

    expect(summary.summary.fixturesFailed).toBe(1);
    expect(summary.summary.researchRunsSucceeded).toBe(0);
    expect(summary.fixtureResults[0]?.errorMessage).toContain("fixture bridge failed");
  });

  it("skips existing fixtures unless full rebuild is requested", async () => {
    const io = createBaseIo();
    io.seedFile(
      `data/fixtures/${SERIES}/${MARKET_B}/${BATCH_FIXTURE_OUTPUT_FILENAME}`,
      createFixtureJson(MARKET_B),
    );

    const summary = await runExpansionRebuild(
      {
        expansionImportSummaryPath: SUMMARY_PATH,
        fixturesDir: "data/fixtures",
        importsDir: "data/imports",
        importConfigsDir: "data/import-configs",
        metadataDir: null,
        registryDir: "data/research-datasets",
        researchResultsDir: "data/research-results/noop",
        mispricingAtlasPath: "data/research-results/mispricing-atlas.json",
        outputPath: "data/research-results/expansion-rebuild-summary.json",
        htmlOutputPath: "data/reports/expansion-rebuild-summary.html",
        fullRebuild: false,
        concurrency: 1,
        generatedAt: GENERATED_AT,
      },
      io,
      {
        parseImportResultJson: parseHistoricalBronzeImportResultJson,
        runFixtureBridge: () => {
          throw new Error("should not rebuild existing fixture");
        },
        parseFixtureJson: (json, marketTicker) => parseResearchFixtureJson(json, marketTicker),
        runResearch: ({ fixture }) =>
          runHistoricalResearchFromBronze({
            bronzeRecords: fixture.bronzeRecords,
            strategy: { strategyId: "noop", decide: () => [] },
            engineConfig: fixture.engineConfig,
            initialCashCents: fixture.initialCashCents,
            runId: fixture.runId,
            durationMs: fixture.durationMs,
            fillConfig: fixture.fillConfig,
          }).serialized,
      },
    );

    expect(summary.summary.fixturesSkipped).toBe(1);
    expect(summary.summary.fixturesBuilt).toBe(0);
  });
});
