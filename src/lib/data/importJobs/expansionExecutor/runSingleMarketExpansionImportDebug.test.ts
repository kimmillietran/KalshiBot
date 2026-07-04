import { describe, expect, it, vi } from "vitest";

import fixture from "@/lib/data/importers/kalshi/fixtures/KXBTC15M-25DEC311900-00-market-responses.json";
import type { HistoricalBronzeImportJobResult } from "@/lib/data/importJobs/historicalBronzeImportJobTypes";

import {
  runSingleMarketExpansionImportDebug,
  serializeSingleMarketExpansionImportDebugReport,
} from "./runSingleMarketExpansionImportDebug";
import { serializeSingleMarketExpansionImportDebugHtml } from "./serializeSingleMarketExpansionImportDebugHtml";
import type {
  FetchedSingleMarketDetailWire,
  FetchedSingleMarketListWire,
  SingleMarketExpansionImportDebugDeps,
} from "./singleMarketExpansionImportDebugTypes";

const GENERATED_AT = "2026-07-04T04:00:00.000Z";
const CONFIG_PATH = "data/import-configs/historical-expansion-config.json";
const OUTPUT_PATH = "data/research-results/single-market-expansion-import-debug.json";
const HTML_PATH = "data/reports/single-market-expansion-import-debug.html";
const MARKET_TICKER = fixture.ticker;

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
        discovery: {
          seriesTicker: "KXBTC15M",
          sampling: {
            afterDate: "2026-01-01T00:00:00.000Z",
            beforeDate: "2026-03-31T23:59:59.999Z",
          },
        },
        importDefaults: {
          kalshi: {
            marketSource: "kalshi-rest",
            candleSource: "kalshi-candles",
            settlementSource: "kalshi-rest",
          },
          btc: {
            provider: "coinbase-spot",
            symbol: "BTC-USD",
            interval: "1m",
          },
          output: {
            format: "json",
            includeValidationReport: true,
            includeFixture: false,
          },
        },
      },
    ],
  });
}

function createImportResult(): HistoricalBronzeImportJobResult {
  return {
    jobId: `expansion-import-${MARKET_TICKER}`,
    bronzeRecords: [],
    validationResult: {
      valid: true,
      errors: [],
      warnings: [],
      statistics: {
        totalRecords: 1,
        marketCount: 1,
        btcBarCount: 1,
        settlementCount: 0,
        duplicateCount: 0,
      },
    },
    metadata: {
      jobId: `expansion-import-${MARKET_TICKER}`,
      marketTicker: MARKET_TICKER,
      startTime: fixture.listMarket.open_time,
      endTime: fixture.listMarket.close_time,
      collectionTime: "2026-01-15T12:15:10.000Z",
      observedAt: "2026-01-15T12:15:10.000Z",
      bronzeRecordCount: 1,
      valid: true,
    },
    serialized: "{}",
  };
}

function createDeps(
  overrides?: Partial<SingleMarketExpansionImportDebugDeps>,
): SingleMarketExpansionImportDebugDeps {
  return {
    fetchListMarketWire: vi.fn(async (): Promise<FetchedSingleMarketListWire> => ({
      wire: fixture.listMarket,
      requestPath: fixture.listEndpoint,
      provenance: {
        source: "kalshi-historical-api",
        fetchedAt: GENERATED_AT,
        requestPath: fixture.listEndpoint,
      },
      unavailableReason: null,
    })),
    fetchDetailMarketWire: vi.fn(async (): Promise<FetchedSingleMarketDetailWire> => ({
      wire: fixture.detailMarket,
      requestPath: fixture.detailEndpoint,
      httpStatus: 200,
      unavailableReason: null,
    })),
    runImport: vi.fn(async () => createImportResult()),
    ...overrides,
  };
}

describe("runSingleMarketExpansionImportDebug", () => {
  it("dry-runs a single ticker without writing import artifacts", async () => {
    const writes = new Map<string, string>();
    const runImport = vi.fn(async () => createImportResult());

    const report = await runSingleMarketExpansionImportDebug({
      generatedAt: GENERATED_AT,
      config: {
        marketTicker: MARKET_TICKER,
        inputPath: CONFIG_PATH,
        outputPath: OUTPUT_PATH,
        htmlOutputPath: HTML_PATH,
        importConfigsDir: "data/import-configs",
        importsDir: "data/imports",
        execute: false,
        jobId: null,
      },
      expansionConfigJson: createManifestJson(),
      io: {
        readFile: () => createManifestJson(),
        fileExists: () => true,
        writeFile: (path, data) => {
          writes.set(path, data);
        },
        mkdirSync: () => {},
      },
      deps: createDeps({ runImport }),
    });

    expect(report.importStatus).toBe("planned");
    expect(report.execute).toBe(false);
    expect(report.reconciliation.success).toBe(true);
    expect(report.expirationValueSource).toBe("reconciled-from-list");
    expect(runImport).not.toHaveBeenCalled();
    expect(writes.size).toBe(0);
    expect(JSON.parse(serializeSingleMarketExpansionImportDebugReport(report)).marketTicker).toBe(
      MARKET_TICKER,
    );
    expect(serializeSingleMarketExpansionImportDebugHtml(report)).toContain(MARKET_TICKER);
  });

  it("executes the standard import path and writes artifacts for one ticker", async () => {
    const writes = new Map<string, string>();
    const runImport = vi.fn(async () => createImportResult());

    const report = await runSingleMarketExpansionImportDebug({
      generatedAt: GENERATED_AT,
      config: {
        marketTicker: MARKET_TICKER,
        inputPath: CONFIG_PATH,
        outputPath: OUTPUT_PATH,
        htmlOutputPath: HTML_PATH,
        importConfigsDir: "data/import-configs",
        importsDir: "data/imports",
        execute: true,
        jobId: null,
      },
      expansionConfigJson: createManifestJson(),
      io: {
        readFile: () => createManifestJson(),
        fileExists: () => true,
        writeFile: (path, data) => {
          writes.set(path, data);
        },
        mkdirSync: () => {},
      },
      deps: createDeps({ runImport }),
    });

    expect(report.importStatus).toBe("imported");
    expect(runImport).toHaveBeenCalledTimes(1);
    expect(
      writes.has(`data/imports/KXBTC15M/${MARKET_TICKER}/import-result.json`),
    ).toBe(true);
    expect(writes.has(`data/import-configs/KXBTC15M/${MARKET_TICKER}/config.json`)).toBe(
      true,
    );
  });

  it("reports missing list payload availability without failing detail reconciliation", async () => {
    const report = await runSingleMarketExpansionImportDebug({
      generatedAt: GENERATED_AT,
      config: {
        marketTicker: MARKET_TICKER,
        inputPath: CONFIG_PATH,
        outputPath: OUTPUT_PATH,
        htmlOutputPath: HTML_PATH,
        importConfigsDir: "data/import-configs",
        importsDir: "data/imports",
        execute: false,
        jobId: null,
      },
      expansionConfigJson: createManifestJson(),
      io: {
        readFile: () => createManifestJson(),
        fileExists: () => true,
        writeFile: () => {},
        mkdirSync: () => {},
      },
      deps: createDeps({
        fetchListMarketWire: vi.fn(async () => ({
          wire: null,
          requestPath: fixture.listEndpoint,
          provenance: null,
          unavailableReason: "Market not found in first list page",
        })),
      }),
    });

    expect(report.listPayload.available).toBe(false);
    expect(report.detailPayload.available).toBe(true);
    expect(report.reconciliation.success).toBe(false);
    expect(report.importStatus).toBe("skipped");
    expect(report.failureReason).toContain("expiration_value");
  });

  it("reports missing detail payload availability", async () => {
    const report = await runSingleMarketExpansionImportDebug({
      generatedAt: GENERATED_AT,
      config: {
        marketTicker: MARKET_TICKER,
        inputPath: CONFIG_PATH,
        outputPath: OUTPUT_PATH,
        htmlOutputPath: HTML_PATH,
        importConfigsDir: "data/import-configs",
        importsDir: "data/imports",
        execute: false,
        jobId: null,
      },
      expansionConfigJson: createManifestJson(),
      io: {
        readFile: () => createManifestJson(),
        fileExists: () => true,
        writeFile: () => {},
        mkdirSync: () => {},
      },
      deps: createDeps({
        fetchDetailMarketWire: vi.fn(async () => ({
          wire: null,
          requestPath: fixture.detailEndpoint,
          httpStatus: 404,
          unavailableReason: "Detail endpoint returned 404",
        })),
      }),
    });

    expect(report.detailPayload.available).toBe(false);
    expect(report.listPayload.available).toBe(true);
    expect(report.reconciliation.success).toBe(true);
    expect(report.importStatus).toBe("planned");
  });

  it("reports reconciliation success when list fills detail gaps", async () => {
    const report = await runSingleMarketExpansionImportDebug({
      generatedAt: GENERATED_AT,
      config: {
        marketTicker: MARKET_TICKER,
        inputPath: CONFIG_PATH,
        outputPath: OUTPUT_PATH,
        htmlOutputPath: HTML_PATH,
        importConfigsDir: "data/import-configs",
        importsDir: "data/imports",
        execute: false,
        jobId: null,
      },
      expansionConfigJson: createManifestJson(),
      io: {
        readFile: () => createManifestJson(),
        fileExists: () => true,
        writeFile: () => {},
        mkdirSync: () => {},
      },
      deps: createDeps(),
    });

    expect(report.reconciliation.success).toBe(true);
    expect(report.reconciliation.mergedFields).toEqual(["expiration_value"]);
    expect(report.expirationValueSource).toBe("reconciled-from-list");
  });

  it("reports reconciliation failure when both payloads omit required fields", async () => {
    const incompleteDetail = {
      ticker: MARKET_TICKER,
      open_time: fixture.detailMarket.open_time,
      close_time: fixture.detailMarket.close_time,
    };
    const incompleteList = {
      ticker: MARKET_TICKER,
      open_time: fixture.listMarket.open_time,
      close_time: fixture.listMarket.close_time,
    };

    const report = await runSingleMarketExpansionImportDebug({
      generatedAt: GENERATED_AT,
      config: {
        marketTicker: MARKET_TICKER,
        inputPath: CONFIG_PATH,
        outputPath: OUTPUT_PATH,
        htmlOutputPath: HTML_PATH,
        importConfigsDir: "data/import-configs",
        importsDir: "data/imports",
        execute: false,
        jobId: null,
      },
      expansionConfigJson: createManifestJson(),
      io: {
        readFile: () => createManifestJson(),
        fileExists: () => true,
        writeFile: () => {},
        mkdirSync: () => {},
      },
      deps: createDeps({
        fetchListMarketWire: vi.fn(async () => ({
          wire: incompleteList,
          requestPath: fixture.listEndpoint,
          provenance: {
            source: "kalshi-historical-api",
            fetchedAt: GENERATED_AT,
            requestPath: fixture.listEndpoint,
          },
          unavailableReason: null,
        })),
        fetchDetailMarketWire: vi.fn(async () => ({
          wire: incompleteDetail,
          requestPath: fixture.detailEndpoint,
          httpStatus: 200,
          unavailableReason: null,
        })),
      }),
    });

    expect(report.reconciliation.success).toBe(false);
    expect(report.importStatus).toBe("skipped");
    expect(report.failureReason).toContain("expiration_value");
  });
});
