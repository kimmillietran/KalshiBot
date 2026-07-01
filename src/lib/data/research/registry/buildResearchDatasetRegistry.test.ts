import { describe, expect, it } from "vitest";

import { DataSource } from "@/lib/data/provenance";
import { SILVER_BRONZE_CONTENT_TYPE } from "@/lib/data/silver";
import type { RawHistoricalRecord } from "@/lib/data/types";
import { DEFAULT_BACKTEST_FILL_SIMULATION_CONFIG } from "@/lib/data/backtesting/strategyTypes";
import { DEFAULT_ENGINE_CONFIG } from "@/lib/trading/config/defaults";

import {
  buildResearchDatasetRegistries,
  buildResearchDatasetRegistryFromDirectories,
  scanResearchFixtures,
  serializeResearchDatasetSeriesRegistry,
} from "./buildResearchDatasetRegistry";
import { buildResearchFixturePath } from "./researchDatasetRegistryPaths";
import {
  ResearchDatasetRegistryErrorCode,
  type ResearchDatasetRegistryIo,
  type ScannedResearchFixture,
} from "./researchDatasetRegistryTypes";

const SERIES_TICKER = "KXBTC15M";
const MARKET_TICKER = "KXBTC15M-26APR281945-45";
const FIXTURES_ROOT = "data/fixtures";
const METADATA_ROOT = "data/imports";
const GENERATED_AT = "2026-06-27T12:00:00.000Z";
const CLOSE_TIME = "2026-04-28T23:45:00.000Z";

function createBronzeRecords(ticker: string): RawHistoricalRecord[] {
  return [
    {
      recordId: "market-1",
      ticker,
      contentType: SILVER_BRONZE_CONTENT_TYPE.MARKET,
      eventTime: "2026-04-28T23:30:00.000Z",
      collectionTime: "2026-04-28T23:45:10.000Z",
      observedAt: "2026-04-28T23:45:10.000Z",
      payload: {
        market: {
          event_ticker: "KXBTC15M-26APR281945",
          close_time: CLOSE_TIME,
        },
      },
      provenance: {
        source: DataSource.KALSHI_REST,
        collectionTime: "2026-04-28T23:45:10.000Z",
        observedAt: "2026-04-28T23:45:10.000Z",
        fetchId: "market-fetch",
      },
    },
    {
      recordId: "candle-1",
      ticker,
      contentType: SILVER_BRONZE_CONTENT_TYPE.CANDLESTICK,
      eventTime: CLOSE_TIME,
      collectionTime: "2026-04-28T23:45:10.000Z",
      observedAt: "2026-04-28T23:45:10.000Z",
      payload: {},
      provenance: {
        source: DataSource.KALSHI_CANDLES,
        collectionTime: "2026-04-28T23:45:10.000Z",
        observedAt: "2026-04-28T23:45:10.000Z",
        fetchId: "candle-fetch",
      },
    },
    {
      recordId: "btc-1",
      ticker,
      contentType: "binance.historical.kline",
      eventTime: CLOSE_TIME,
      collectionTime: "2026-04-28T23:45:10.000Z",
      observedAt: "2026-04-28T23:45:10.000Z",
      payload: {},
      provenance: {
        source: DataSource.COINBASE_SPOT,
        collectionTime: "2026-04-28T23:45:10.000Z",
        observedAt: "2026-04-28T23:45:10.000Z",
        fetchId: "btc-fetch",
      },
    },
    {
      recordId: "settlement-1",
      ticker,
      contentType: SILVER_BRONZE_CONTENT_TYPE.SETTLEMENT,
      eventTime: CLOSE_TIME,
      collectionTime: "2026-04-28T23:45:10.000Z",
      observedAt: "2026-04-28T23:45:10.000Z",
      payload: { result: "yes" },
      provenance: {
        source: DataSource.KALSHI_REST,
        collectionTime: "2026-04-28T23:45:10.000Z",
        observedAt: "2026-04-28T23:45:10.000Z",
        fetchId: "settlement-fetch",
      },
    },
  ];
}

function createFixtureJson(ticker: string = MARKET_TICKER): string {
  return JSON.stringify({
    runId: "fixture-run-001",
    durationMs: 4_000,
    initialCashCents: 100_000,
    strategyId: "noop",
    engineConfig: DEFAULT_ENGINE_CONFIG,
    fillConfig: DEFAULT_BACKTEST_FILL_SIMULATION_CONFIG,
    bronzeRecords: createBronzeRecords(ticker),
  });
}

function createMetadataJson(): string {
  return JSON.stringify({
    marketTicker: MARKET_TICKER,
    eventTicker: "KXBTC15M-26APR281945",
    seriesTicker: SERIES_TICKER,
    importTimestamp: "2026-04-28T23:45:10.000Z",
    sourceProviders: {
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
    },
    bronzeRecordCount: 4,
    btcBarCount: 1,
    kalshiCandleCount: 1,
    settlementPresent: true,
    validationStatus: {
      valid: true,
      errorCount: 0,
      warningCount: 0,
    },
    provenance: {
      jobId: "import-job-001",
      importTimestamp: "2026-04-28T23:45:10.000Z",
      sources: ["coinbase-spot", "kalshi-candles", "kalshi-rest"],
    },
    importDurationMs: 0,
  });
}

function createScannedFixture(
  overrides: Partial<ScannedResearchFixture> = {},
): ScannedResearchFixture {
  const fixturePath = buildResearchFixturePath(
    FIXTURES_ROOT,
    SERIES_TICKER,
    MARKET_TICKER,
  );

  return {
    seriesTicker: SERIES_TICKER,
    marketTicker: MARKET_TICKER,
    fixturePath,
    metadataPath: `${METADATA_ROOT}/${SERIES_TICKER}/${MARKET_TICKER}/metadata.json`,
    fixtureJson: createFixtureJson(),
    metadataJson: createMetadataJson(),
    ...overrides,
  };
}

function createRegistryIo(
  files: Record<string, string>,
  directories: Set<string>,
): ResearchDatasetRegistryIo {
  return {
    readdir: (path) =>
      [...directories]
        .filter((entry) => entry.slice(0, entry.lastIndexOf("/")) === path)
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

describe("buildResearchDatasetRegistries", () => {
  it("creates a registry with stable ordering and fixture summary fields", () => {
    const earlier = createScannedFixture({
      marketTicker: "KXBTC15M-26APR281930-30",
      fixturePath: buildResearchFixturePath(
        FIXTURES_ROOT,
        SERIES_TICKER,
        "KXBTC15M-26APR281930-30",
      ),
      fixtureJson: createFixtureJson("KXBTC15M-26APR281930-30"),
      metadataPath: null,
      metadataJson: undefined,
    });

    const first = buildResearchDatasetRegistries({
      fixturesRoot: FIXTURES_ROOT,
      metadataRoot: METADATA_ROOT,
      generatedAt: GENERATED_AT,
      scanned: [createScannedFixture(), earlier],
    });
    const second = buildResearchDatasetRegistries({
      fixturesRoot: FIXTURES_ROOT,
      metadataRoot: METADATA_ROOT,
      generatedAt: GENERATED_AT,
      scanned: [earlier, createScannedFixture()],
    });

    expect(first).toEqual(second);
    expect(first[0]?.markets.map((market) => market.marketTicker)).toEqual([
      "KXBTC15M-26APR281930-30",
      MARKET_TICKER,
    ]);
    expect(first[0]?.markets[1]).toMatchObject({
      marketCloseTime: CLOSE_TIME,
      settlementPresent: true,
      bronzeRecordCount: 4,
      btcBarCount: 1,
      kalshiCandleCount: 1,
      importMetadata: {
        importTimestamp: "2026-04-28T23:45:10.000Z",
        bronzeRecordCount: 4,
        settlementPresent: true,
      },
    });
    expect(serializeResearchDatasetSeriesRegistry(first[0]!)).toBe(
      serializeResearchDatasetSeriesRegistry(first[0]!),
    );
  });

  it("tolerates missing import metadata", () => {
    const registry = buildResearchDatasetRegistries({
      fixturesRoot: FIXTURES_ROOT,
      metadataRoot: METADATA_ROOT,
      generatedAt: GENERATED_AT,
      scanned: [
        createScannedFixture({
          metadataPath: null,
          metadataJson: undefined,
        }),
      ],
    });

    expect(registry[0]?.markets[0]?.importMetadata).toBeNull();
    expect(registry[0]?.summary.linkedMetadataCount).toBe(0);
  });

  it("rejects duplicate market tickers", () => {
    expect(() =>
      buildResearchDatasetRegistries({
        fixturesRoot: FIXTURES_ROOT,
        metadataRoot: METADATA_ROOT,
        generatedAt: GENERATED_AT,
        scanned: [createScannedFixture(), createScannedFixture()],
      }),
    ).toThrowError(
      expect.objectContaining({
        code: ResearchDatasetRegistryErrorCode.DUPLICATE_MARKET_TICKER,
      }),
    );
  });

  it("rejects invalid fixture schema", () => {
    expect(() =>
      buildResearchDatasetRegistries({
        fixturesRoot: FIXTURES_ROOT,
        metadataRoot: METADATA_ROOT,
        generatedAt: GENERATED_AT,
        scanned: [
          createScannedFixture({
            fixtureJson: "{}",
          }),
        ],
      }),
    ).toThrowError(
      expect.objectContaining({
        code: ResearchDatasetRegistryErrorCode.INVALID_FIXTURE_SCHEMA,
      }),
    );
  });

  it("rejects malformed metadata when present", () => {
    expect(() =>
      buildResearchDatasetRegistries({
        fixturesRoot: FIXTURES_ROOT,
        metadataRoot: METADATA_ROOT,
        generatedAt: GENERATED_AT,
        scanned: [
          createScannedFixture({
            metadataJson: JSON.stringify({ marketTicker: "wrong" }),
          }),
        ],
      }),
    ).toThrowError(
      expect.objectContaining({
        code: ResearchDatasetRegistryErrorCode.INVALID_METADATA,
      }),
    );
  });

  it("rejects empty datasets", () => {
    expect(() =>
      buildResearchDatasetRegistries({
        fixturesRoot: FIXTURES_ROOT,
        metadataRoot: METADATA_ROOT,
        generatedAt: GENERATED_AT,
        scanned: [],
      }),
    ).toThrowError(
      expect.objectContaining({
        code: ResearchDatasetRegistryErrorCode.EMPTY_DATASET,
      }),
    );
  });
});

describe("scanResearchFixtures", () => {
  it("scans fixture trees and links metadata when available", () => {
    const fixturePath = buildResearchFixturePath(
      FIXTURES_ROOT,
      SERIES_TICKER,
      MARKET_TICKER,
    );
    const metadataPath = `${METADATA_ROOT}/${SERIES_TICKER}/${MARKET_TICKER}/metadata.json`;
    const directories = new Set([
      FIXTURES_ROOT,
      `${FIXTURES_ROOT}/${SERIES_TICKER}`,
      `${FIXTURES_ROOT}/${SERIES_TICKER}/${MARKET_TICKER}`,
    ]);
    const files = {
      [fixturePath]: createFixtureJson(),
      [metadataPath]: createMetadataJson(),
    };

    const scanned = scanResearchFixtures(
      FIXTURES_ROOT,
      METADATA_ROOT,
      createRegistryIo(files, directories),
    );

    expect(scanned).toHaveLength(1);
    expect(scanned[0]?.metadataJson).toBeDefined();
  });

  it("reports missing fixture directories", () => {
    expect(() =>
      scanResearchFixtures(
        FIXTURES_ROOT,
        METADATA_ROOT,
        createRegistryIo({}, new Set()),
      ),
    ).toThrowError(
      expect.objectContaining({
        code: ResearchDatasetRegistryErrorCode.MISSING_FIXTURES_DIRECTORY,
      }),
    );
  });

  it("reports missing fixture.json files", () => {
    const directories = new Set([
      FIXTURES_ROOT,
      `${FIXTURES_ROOT}/${SERIES_TICKER}`,
      `${FIXTURES_ROOT}/${SERIES_TICKER}/${MARKET_TICKER}`,
    ]);

    expect(() =>
      scanResearchFixtures(
        FIXTURES_ROOT,
        METADATA_ROOT,
        createRegistryIo({}, directories),
      ),
    ).toThrowError(
      expect.objectContaining({
        code: ResearchDatasetRegistryErrorCode.MISSING_FIXTURE,
      }),
    );
  });
});

describe("buildResearchDatasetRegistryFromDirectories", () => {
  it("builds registries from scanned directories", () => {
    const fixturePath = buildResearchFixturePath(
      FIXTURES_ROOT,
      SERIES_TICKER,
      MARKET_TICKER,
    );
    const directories = new Set([
      FIXTURES_ROOT,
      `${FIXTURES_ROOT}/${SERIES_TICKER}`,
      `${FIXTURES_ROOT}/${SERIES_TICKER}/${MARKET_TICKER}`,
    ]);

    const registries = buildResearchDatasetRegistryFromDirectories(
      FIXTURES_ROOT,
      null,
      createRegistryIo({ [fixturePath]: createFixtureJson() }, directories),
      { generatedAt: GENERATED_AT },
    );

    expect(registries).toHaveLength(1);
    expect(registries[0]?.summary.marketCount).toBe(1);
  });
});
