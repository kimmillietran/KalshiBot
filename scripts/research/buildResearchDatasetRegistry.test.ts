import { describe, expect, it, vi } from "vitest";

import { DataSource } from "@/lib/data/provenance";
import { SILVER_BRONZE_CONTENT_TYPE } from "@/lib/data/silver";
import { DEFAULT_BACKTEST_FILL_SIMULATION_CONFIG } from "@/lib/data/backtesting/strategyTypes";
import { DEFAULT_ENGINE_CONFIG } from "@/lib/trading/config/defaults";

import { runBuildResearchDatasetRegistryCommand } from "./buildResearchDatasetRegistry";

const SERIES_TICKER = "KXBTC15M";
const MARKET_TICKER = "KXBTC15M-26APR281945-45";

function createFixtureJson() {
  return JSON.stringify({
    runId: "fixture-run-001",
    durationMs: 4_000,
    initialCashCents: 100_000,
    strategyId: "noop",
    engineConfig: DEFAULT_ENGINE_CONFIG,
    fillConfig: DEFAULT_BACKTEST_FILL_SIMULATION_CONFIG,
    bronzeRecords: [
      {
        recordId: "market-1",
        ticker: MARKET_TICKER,
        contentType: SILVER_BRONZE_CONTENT_TYPE.MARKET,
        eventTime: "2026-04-28T23:30:00.000Z",
        collectionTime: "2026-04-28T23:45:10.000Z",
        observedAt: "2026-04-28T23:45:10.000Z",
        payload: {
          market: {
            event_ticker: "KXBTC15M-26APR281945",
            close_time: "2026-04-28T23:45:00.000Z",
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
        ticker: MARKET_TICKER,
        contentType: SILVER_BRONZE_CONTENT_TYPE.CANDLESTICK,
        eventTime: "2026-04-28T23:45:00.000Z",
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
        ticker: MARKET_TICKER,
        contentType: "binance.historical.kline",
        eventTime: "2026-04-28T23:45:00.000Z",
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
        ticker: MARKET_TICKER,
        contentType: SILVER_BRONZE_CONTENT_TYPE.SETTLEMENT,
        eventTime: "2026-04-28T23:45:00.000Z",
        collectionTime: "2026-04-28T23:45:10.000Z",
        observedAt: "2026-04-28T23:45:10.000Z",
        payload: {},
        provenance: {
          source: DataSource.KALSHI_REST,
          collectionTime: "2026-04-28T23:45:10.000Z",
          observedAt: "2026-04-28T23:45:10.000Z",
          fetchId: "settlement-fetch",
        },
      },
    ],
  });
}

function createIo() {
  const fixturesRoot = "data/fixtures";
  const metadataRoot = "data/imports";
  const seriesDir = `${fixturesRoot}/${SERIES_TICKER}`;
  const marketDir = `${seriesDir}/${MARKET_TICKER}`;
  const fixturePath = `${marketDir}/fixture.json`;
  const metadataPath = `${metadataRoot}/${SERIES_TICKER}/${MARKET_TICKER}/metadata.json`;
  const writes = new Map<string, string>();
  let stdout = "";
  let stderr = "";

  return {
    io: {
      readFile: (path: string) => {
        if (path === fixturePath) {
          return createFixtureJson();
        }
        if (path === metadataPath) {
          return JSON.stringify({
            marketTicker: MARKET_TICKER,
            importTimestamp: "2026-04-28T23:45:10.000Z",
            bronzeRecordCount: 4,
            settlementPresent: true,
          });
        }
        throw new Error(`Missing file: ${path}`);
      },
      writeStdout: (text: string) => {
        stdout += text;
      },
      writeStderr: (text: string) => {
        stderr += text;
      },
      writeFile: (path: string, data: string) => {
        writes.set(path, data);
      },
      mkdirSync: vi.fn(),
      readdir: (path: string) => {
        if (path === fixturesRoot) {
          return [SERIES_TICKER];
        }
        if (path === seriesDir) {
          return [MARKET_TICKER];
        }
        return [];
      },
      fileExists: (path: string) =>
        path === fixturePath || path === metadataPath,
      isDirectory: (path: string) =>
        path === fixturesRoot || path === seriesDir || path === marketDir,
    },
    writes,
    getStdout: () => stdout,
    getStderr: () => stderr,
  };
}

describe("runBuildResearchDatasetRegistryCommand", () => {
  it("writes per-series dataset registry files", () => {
    const { io, writes, getStdout } = createIo();

    const exitCode = runBuildResearchDatasetRegistryCommand(
      [
        "--input-dir",
        "data/fixtures",
        "--metadata-dir",
        "data/imports",
        "--output-dir",
        "data/research-datasets",
      ],
      io,
      { generatedAt: "2026-06-27T12:00:00.000Z" },
    );

    expect(exitCode).toBe(0);
    expect(writes.has("data/research-datasets/KXBTC15M/dataset-registry.json")).toBe(
      true,
    );
    const registry = JSON.parse(
      writes.get("data/research-datasets/KXBTC15M/dataset-registry.json")!,
    );
    expect(registry.summary.marketCount).toBe(1);
    expect(JSON.parse(getStdout())).toMatchObject({
      seriesCount: 1,
      marketCount: 1,
    });
  });

  it("reports missing fixture directories", () => {
    const { io, getStderr } = createIo();

    const exitCode = runBuildResearchDatasetRegistryCommand(
      [
        "--input-dir",
        "missing-fixtures",
        "--output-dir",
        "data/research-datasets",
      ],
      {
        ...io,
        isDirectory: () => false,
      },
      { generatedAt: "2026-06-27T12:00:00.000Z" },
    );

    expect(exitCode).toBe(1);
    expect(getStderr()).toContain("Fixture directory does not exist");
  });
});
