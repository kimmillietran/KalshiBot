import { describe, expect, it } from "vitest";

import { DataSource } from "@/lib/data/provenance";
import { SILVER_BRONZE_CONTENT_TYPE } from "@/lib/data/silver";
import type { RawHistoricalRecord } from "@/lib/data/types";
import {
  buildHistoricalBronzeImportConfig,
  HistoricalBronzeImportBtcInterval,
  HistoricalBronzeImportBtcProvider,
  HistoricalBronzeImportKalshiSource,
  HistoricalBronzeImportOutputFormat,
} from "@/lib/data/importJobs/config";
import { serializeHistoricalBronzeImportResult } from "@/lib/data/importJobs/HistoricalBronzeImportJob";
import { DATASET_BRONZE_CONTENT_TYPE } from "@/lib/data/datasets/datasetTypes";

import {
  buildImportedMarketMetadata,
  serializeImportedMarketMetadata,
} from "./buildImportedMarketMetadata";
import {
  buildDatasetManifest,
  buildDatasetManifestFromDirectory,
  scanImportedMarketDatasets,
  serializeDatasetManifest,
} from "./buildDatasetRegistry";
import { buildImportedMarketDirectoryPath } from "./importedMarketDatasetPaths";
import {
  DatasetRegistryError,
  DatasetRegistryErrorCode,
  ImportedMarketDatasetStatus,
  type DatasetRegistryIo,
  type ScannedImportedMarketDataset,
} from "./importedMarketDatasetTypes";

const SERIES_TICKER = "KXBTC15M";
const MARKET_TICKER = "KXBTC15M-26APR281945-45";
const EVENT_TICKER = "KXBTC15M-26APR281945";
const START_TIME = "2026-04-28T23:30:00.000Z";
const END_TIME = "2026-04-28T23:45:00.000Z";
const COLLECTION_TIME = "2026-04-28T23:45:10.000Z";
const OBSERVED_AT_EARLY = "2026-04-28T23:45:10.000Z";
const OBSERVED_AT_LATE = "2026-04-28T23:45:12.000Z";
const GENERATED_AT = "2026-06-27T12:00:00.000Z";
const IMPORTS_ROOT = "data/imports";

function createConfig() {
  return buildHistoricalBronzeImportConfig({
    jobId: "import-job-001",
    marketTicker: MARKET_TICKER,
    startTime: START_TIME,
    endTime: END_TIME,
    collectionTime: COLLECTION_TIME,
    observedAt: COLLECTION_TIME,
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
  });
}

function createBronzeRecords(): RawHistoricalRecord[] {
  return [
    {
      recordId: "market-1",
      ticker: MARKET_TICKER,
      contentType: SILVER_BRONZE_CONTENT_TYPE.MARKET,
      eventTime: START_TIME,
      collectionTime: COLLECTION_TIME,
      observedAt: OBSERVED_AT_EARLY,
      payload: {
        market: {
          event_ticker: EVENT_TICKER,
          open_time: START_TIME,
          close_time: END_TIME,
        },
      },
      provenance: {
        source: DataSource.KALSHI_REST,
        collectionTime: COLLECTION_TIME,
        observedAt: OBSERVED_AT_EARLY,
        fetchId: "market-fetch",
      },
    },
    {
      recordId: "candle-1",
      ticker: MARKET_TICKER,
      contentType: SILVER_BRONZE_CONTENT_TYPE.CANDLESTICK,
      eventTime: END_TIME,
      collectionTime: COLLECTION_TIME,
      observedAt: OBSERVED_AT_EARLY,
      payload: { close_time: END_TIME },
      provenance: {
        source: DataSource.KALSHI_CANDLES,
        collectionTime: COLLECTION_TIME,
        observedAt: OBSERVED_AT_EARLY,
        fetchId: "candle-fetch",
      },
    },
    {
      recordId: "candle-2",
      ticker: MARKET_TICKER,
      contentType: SILVER_BRONZE_CONTENT_TYPE.CANDLESTICK,
      eventTime: END_TIME,
      collectionTime: COLLECTION_TIME,
      observedAt: OBSERVED_AT_LATE,
      payload: { close_time: END_TIME },
      provenance: {
        source: DataSource.KALSHI_CANDLES,
        collectionTime: COLLECTION_TIME,
        observedAt: OBSERVED_AT_LATE,
        fetchId: "candle-fetch-2",
      },
    },
    {
      recordId: "btc-1",
      ticker: MARKET_TICKER,
      contentType: DATASET_BRONZE_CONTENT_TYPE.BTC_KLINE,
      eventTime: END_TIME,
      collectionTime: COLLECTION_TIME,
      observedAt: OBSERVED_AT_LATE,
      payload: { close_time: END_TIME },
      provenance: {
        source: DataSource.COINBASE_SPOT,
        collectionTime: COLLECTION_TIME,
        observedAt: OBSERVED_AT_LATE,
        fetchId: "btc-fetch",
      },
    },
    {
      recordId: "settlement-1",
      ticker: MARKET_TICKER,
      contentType: SILVER_BRONZE_CONTENT_TYPE.SETTLEMENT,
      eventTime: END_TIME,
      collectionTime: COLLECTION_TIME,
      observedAt: OBSERVED_AT_LATE,
      payload: { result: "yes" },
      provenance: {
        source: DataSource.KALSHI_REST,
        collectionTime: COLLECTION_TIME,
        observedAt: OBSERVED_AT_LATE,
        fetchId: "settlement-fetch",
      },
    },
  ];
}

function createImportResult() {
  const bronzeRecords = createBronzeRecords();
  return {
    jobId: "import-job-001",
    bronzeRecords,
    validationResult: {
      valid: true,
      errors: [],
      warnings: [],
      statistics: {
        totalRecords: bronzeRecords.length,
        marketCount: 1,
        btcBarCount: 1,
        settlementCount: 1,
        duplicateCount: 0,
      },
    },
    metadata: {
      jobId: "import-job-001",
      marketTicker: MARKET_TICKER,
      startTime: START_TIME,
      endTime: END_TIME,
      collectionTime: COLLECTION_TIME,
      observedAt: COLLECTION_TIME,
      bronzeRecordCount: bronzeRecords.length,
      valid: true,
    },
  };
}

function createScannedDataset(
  overrides: Partial<ScannedImportedMarketDataset> = {},
): ScannedImportedMarketDataset {
  const paths = buildImportedMarketDirectoryPath(
    IMPORTS_ROOT,
    SERIES_TICKER,
    MARKET_TICKER,
  );
  const config = createConfig();
  const importResult = createImportResult();
  const metadata = buildImportedMarketMetadata({ config, importResult });

  return {
    seriesTicker: SERIES_TICKER,
    marketTicker: MARKET_TICKER,
    paths,
    files: {
      config: JSON.stringify({
        jobId: config.jobId,
        marketTicker: config.marketTicker,
        startTime: config.startTime,
        endTime: config.endTime,
        collectionTime: config.collectionTime,
        observedAt: config.observedAt,
        kalshi: config.kalshi,
        btc: config.btc,
        output: config.output,
      }),
      importResult: serializeHistoricalBronzeImportResult(importResult),
      metadata: serializeImportedMarketMetadata(metadata),
    },
    ...overrides,
  };
}

function createRegistryIo(
  files: Record<string, string>,
  directories: Set<string>,
): DatasetRegistryIo {
  return {
    readdir: (path) =>
      [...directories]
        .filter((entry) => {
          const parent = entry.slice(0, entry.lastIndexOf("/"));
          return parent === path;
        })
        .map((entry) => entry.slice(entry.lastIndexOf("/") + 1))
        .sort(),
    readFile: (path) => {
      const content = files[path];
      if (content === undefined) {
        throw new Error(`Missing file: ${path}`);
      }
      return content;
    },
    fileExists: (path) => files[path] !== undefined,
    isDirectory: (path) => directories.has(path),
  };
}

describe("buildImportedMarketMetadata", () => {
  it("generates metadata with provider, counts, and import duration", () => {
    const metadata = buildImportedMarketMetadata({
      config: createConfig(),
      importResult: createImportResult(),
    });

    expect(metadata).toMatchObject({
      marketTicker: MARKET_TICKER,
      eventTicker: EVENT_TICKER,
      seriesTicker: SERIES_TICKER,
      importTimestamp: COLLECTION_TIME,
      bronzeRecordCount: 5,
      btcBarCount: 1,
      kalshiCandleCount: 2,
      settlementPresent: true,
      importDurationMs: 2_000,
      sourceProviders: {
        btc: {
          provider: HistoricalBronzeImportBtcProvider.COINBASE_SPOT,
          symbol: "BTC-USD",
          interval: HistoricalBronzeImportBtcInterval.ONE_MINUTE,
        },
      },
      validationStatus: {
        valid: true,
        errorCount: 0,
        warningCount: 0,
      },
      provenance: {
        jobId: "import-job-001",
        importTimestamp: COLLECTION_TIME,
        sources: expect.arrayContaining([
          DataSource.KALSHI_REST,
          DataSource.KALSHI_CANDLES,
          DataSource.COINBASE_SPOT,
        ]),
      },
    });
  });
});

describe("buildDatasetManifest", () => {
  it("builds a deterministic manifest with stable ordering", () => {
    const earlierTicker = "KXBTC15M-26APR281930-30";
    const earlierPaths = buildImportedMarketDirectoryPath(
      IMPORTS_ROOT,
      SERIES_TICKER,
      earlierTicker,
    );
    const earlierConfig = createConfig();
    const earlierImportResult = createImportResult();
    const earlierMetadata = buildImportedMarketMetadata({
      config: {
        ...earlierConfig,
        marketTicker: earlierTicker,
        jobId: "import-job-002",
      },
      importResult: {
        ...earlierImportResult,
        jobId: "import-job-002",
        metadata: {
          ...earlierImportResult.metadata,
          jobId: "import-job-002",
          marketTicker: earlierTicker,
        },
        bronzeRecords: earlierImportResult.bronzeRecords.map((record) => ({
          ...record,
          ticker: earlierTicker,
        })),
      },
    });

    const secondMarket = createScannedDataset({
      seriesTicker: SERIES_TICKER,
      marketTicker: earlierTicker,
      paths: earlierPaths,
      files: {
        config: JSON.stringify({
          ...JSON.parse(createScannedDataset().files.config!),
          jobId: "import-job-002",
          marketTicker: earlierTicker,
        }),
        importResult: serializeHistoricalBronzeImportResult({
          ...createImportResult(),
          jobId: "import-job-002",
          metadata: {
            ...createImportResult().metadata,
            jobId: "import-job-002",
            marketTicker: earlierTicker,
          },
          bronzeRecords: createImportResult().bronzeRecords.map((record) => ({
            ...record,
            ticker: earlierTicker,
          })),
        }),
        metadata: serializeImportedMarketMetadata(earlierMetadata),
      },
    });

    const first = buildDatasetManifest({
      inputDir: IMPORTS_ROOT,
      generatedAt: GENERATED_AT,
      entries: [createScannedDataset(), secondMarket],
    });
    const second = buildDatasetManifest({
      inputDir: IMPORTS_ROOT,
      generatedAt: GENERATED_AT,
      entries: [secondMarket, createScannedDataset()],
    });

    expect(first).toEqual(second);
    expect(first.markets.map((market) => market.marketTicker)).toEqual([
      "KXBTC15M-26APR281930-30",
      MARKET_TICKER,
    ]);
    expect(serializeDatasetManifest(first)).toBe(serializeDatasetManifest(second));
    expect(first.summary.marketCount).toBe(2);
    expect(first.summary.totalBronzeRecords).toBe(10);
  });

  it("rejects duplicate market directories", () => {
    const duplicate = createScannedDataset();

    expect(() =>
      buildDatasetManifest({
        inputDir: IMPORTS_ROOT,
        generatedAt: GENERATED_AT,
        entries: [duplicate, duplicate],
      }),
    ).toThrowError(
      expect.objectContaining({
        code: DatasetRegistryErrorCode.DUPLICATE_MARKET_DIRECTORY,
      }),
    );
  });

  it("rejects missing import-result.json", () => {
    const scanned = createScannedDataset({
      files: {
        config: createScannedDataset().files.config,
      },
    });

    expect(() =>
      buildDatasetManifest({
        inputDir: IMPORTS_ROOT,
        generatedAt: GENERATED_AT,
        entries: [scanned],
      }),
    ).toThrowError(
      expect.objectContaining({
        code: DatasetRegistryErrorCode.MISSING_IMPORT_RESULT,
      }),
    );
  });

  it("marks markets without metadata as missing-metadata", () => {
    const scanned = createScannedDataset({
      files: {
        config: createScannedDataset().files.config,
        importResult: createScannedDataset().files.importResult,
      },
    });

    const manifest = buildDatasetManifest({
      inputDir: IMPORTS_ROOT,
      generatedAt: GENERATED_AT,
      entries: [scanned],
    });

    expect(manifest.markets[0]?.importStatus).toBe(
      ImportedMarketDatasetStatus.MISSING_METADATA,
    );
  });

  it("rejects invalid metadata", () => {
    const scanned = createScannedDataset({
      files: {
        ...createScannedDataset().files,
        metadata: JSON.stringify({ marketTicker: "wrong" }),
      },
    });

    expect(() =>
      buildDatasetManifest({
        inputDir: IMPORTS_ROOT,
        generatedAt: GENERATED_AT,
        entries: [scanned],
      }),
    ).toThrowError(
      expect.objectContaining({
        code: DatasetRegistryErrorCode.INVALID_METADATA,
      }),
    );
  });
});

describe("buildDatasetManifestFromDirectory", () => {
  it("scans the imports tree and builds a manifest", () => {
    const scanned = createScannedDataset();
    const directories = new Set<string>([
      IMPORTS_ROOT,
      `${IMPORTS_ROOT}/${SERIES_TICKER}`,
      scanned.paths.directoryPath,
    ]);
    const files = {
      [scanned.paths.configPath]: scanned.files.config!,
      [scanned.paths.importResultPath]: scanned.files.importResult!,
      [scanned.paths.metadataPath]: scanned.files.metadata!,
    };

    const manifest = buildDatasetManifestFromDirectory(
      IMPORTS_ROOT,
      createRegistryIo(files, directories),
      { generatedAt: GENERATED_AT },
    );

    expect(manifest.markets).toHaveLength(1);
    expect(manifest.markets[0]?.importStatus).toBe(
      ImportedMarketDatasetStatus.COMPLETE,
    );
    expect(manifest.markets[0]?.directoryPath).toBe(scanned.paths.directoryPath);
  });

  it("detects broken directory structures from the scanner", () => {
    expect(() =>
      scanImportedMarketDatasets(
        "missing-root",
        createRegistryIo({}, new Set()),
      ),
    ).toThrowError(DatasetRegistryError);
  });
});
