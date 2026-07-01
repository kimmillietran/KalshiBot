import { describe, expect, it } from "vitest";

import { ImportedMarketDatasetStatus } from "@/lib/data/datasets/registry";

import { runBuildDatasetManifestCommand } from "./buildDatasetManifest";

function createIo(files: Record<string, string>, directories: Set<string>) {
  let stdout = "";
  let stderr = "";
  const writes = new Map<string, string>();

  return {
    io: {
      readFile: (path: string) => {
        const content = files[path];
        if (content === undefined) {
          throw new Error(`Missing file: ${path}`);
        }
        return content;
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
      readdir: (path: string) =>
        [...directories]
          .filter((entry) => entry.slice(0, entry.lastIndexOf("/")) === path)
          .map((entry) => entry.slice(entry.lastIndexOf("/") + 1))
          .sort(),
      fileExists: (path: string) => files[path] !== undefined,
      isDirectory: (path: string) => directories.has(path),
    },
    writes,
    getStdout: () => stdout,
    getStderr: () => stderr,
  };
}

describe("runBuildDatasetManifestCommand", () => {
  it("writes dataset-manifest.json for organized imports", () => {
    const root = "data/imports";
    const series = `${root}/KXBTC15M`;
    const marketDir = `${series}/KXBTC15M-26APR281945-45`;
    const configPath = `${marketDir}/config.json`;
    const importResultPath = `${marketDir}/import-result.json`;
    const metadataPath = `${marketDir}/metadata.json`;

    const { io, writes, getStdout } = createIo(
      {
        [configPath]: JSON.stringify({
          jobId: "import-job-001",
          marketTicker: "KXBTC15M-26APR281945-45",
          startTime: "2026-04-28T23:30:00.000Z",
          endTime: "2026-04-28T23:45:00.000Z",
          collectionTime: "2026-04-28T23:45:10.000Z",
          observedAt: "2026-04-28T23:45:10.000Z",
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
        }),
        [importResultPath]: JSON.stringify({
          jobId: "import-job-001",
          bronzeRecords: [
            {
              recordId: "market-1",
              ticker: "KXBTC15M-26APR281945-45",
              contentType: "kalshi.historical.market",
              eventTime: "2026-04-28T23:30:00.000Z",
              collectionTime: "2026-04-28T23:45:10.000Z",
              observedAt: "2026-04-28T23:45:10.000Z",
              payload: {
                market: { event_ticker: "KXBTC15M-26APR281945" },
              },
              provenance: {
                source: "kalshi-rest",
                collectionTime: "2026-04-28T23:45:10.000Z",
                observedAt: "2026-04-28T23:45:10.000Z",
                fetchId: "market-fetch",
              },
            },
            {
              recordId: "btc-1",
              ticker: "KXBTC15M-26APR281945-45",
              contentType: "binance.historical.kline",
              eventTime: "2026-04-28T23:45:00.000Z",
              collectionTime: "2026-04-28T23:45:10.000Z",
              observedAt: "2026-04-28T23:45:10.000Z",
              payload: {},
              provenance: {
                source: "coinbase-spot",
                collectionTime: "2026-04-28T23:45:10.000Z",
                observedAt: "2026-04-28T23:45:10.000Z",
                fetchId: "btc-fetch",
              },
            },
            {
              recordId: "candle-1",
              ticker: "KXBTC15M-26APR281945-45",
              contentType: "kalshi.historical.candlestick",
              eventTime: "2026-04-28T23:45:00.000Z",
              collectionTime: "2026-04-28T23:45:10.000Z",
              observedAt: "2026-04-28T23:45:10.000Z",
              payload: {},
              provenance: {
                source: "kalshi-candles",
                collectionTime: "2026-04-28T23:45:10.000Z",
                observedAt: "2026-04-28T23:45:10.000Z",
                fetchId: "candle-fetch",
              },
            },
            {
              recordId: "settlement-1",
              ticker: "KXBTC15M-26APR281945-45",
              contentType: "kalshi.historical.settlement",
              eventTime: "2026-04-28T23:45:00.000Z",
              collectionTime: "2026-04-28T23:45:10.000Z",
              observedAt: "2026-04-28T23:45:10.000Z",
              payload: {},
              provenance: {
                source: "kalshi-rest",
                collectionTime: "2026-04-28T23:45:10.000Z",
                observedAt: "2026-04-28T23:45:10.000Z",
                fetchId: "settlement-fetch",
              },
            },
          ],
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
            jobId: "import-job-001",
            marketTicker: "KXBTC15M-26APR281945-45",
            startTime: "2026-04-28T23:30:00.000Z",
            endTime: "2026-04-28T23:45:00.000Z",
            collectionTime: "2026-04-28T23:45:10.000Z",
            observedAt: "2026-04-28T23:45:10.000Z",
            bronzeRecordCount: 4,
            valid: true,
          },
        }),
        [metadataPath]: JSON.stringify({
          marketTicker: "KXBTC15M-26APR281945-45",
          eventTicker: "KXBTC15M-26APR281945",
          seriesTicker: "KXBTC15M",
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
        }),
      },
      new Set([root, series, marketDir]),
    );

    const exitCode = runBuildDatasetManifestCommand(
      ["--input-dir", root, "--output", "dataset-manifest.json"],
      io,
      { generatedAt: "2026-06-27T12:00:00.000Z" },
    );

    expect(exitCode).toBe(0);
    expect(writes.has("dataset-manifest.json")).toBe(true);
    const manifest = JSON.parse(writes.get("dataset-manifest.json")!);
    expect(manifest.summary.marketCount).toBe(1);
    expect(manifest.markets[0]?.importStatus).toBe(
      ImportedMarketDatasetStatus.COMPLETE,
    );
    expect(JSON.parse(getStdout())).toMatchObject({
      marketCount: 1,
      completeMarketCount: 1,
    });
  });

  it("requires --output", () => {
    const { io, getStderr } = createIo({}, new Set(["data/imports"]));

    const exitCode = runBuildDatasetManifestCommand(
      ["--input-dir", "data/imports"],
      io,
      { generatedAt: "2026-06-27T12:00:00.000Z" },
    );

    expect(exitCode).toBe(1);
    expect(getStderr()).toContain("Missing required --output");
  });
});
