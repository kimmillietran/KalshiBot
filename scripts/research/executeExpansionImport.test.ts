import { describe, expect, it, vi } from "vitest";

import fixture from "@/lib/data/importers/kalshi/fixtures/KXBTC15M-25DEC311900-00-market-responses.json";

import { parseExecuteExpansionImportConfigFromArgv } from "./executeExpansionImportTypes";
import { runExecuteExpansionImportCommand } from "./executeExpansionImport";
import { normalizeExecuteExpansionImportArgv } from "../lib/cliArgvSchemas";

const GENERATED_AT = "2026-07-04T04:00:00.000Z";
const CONFIG_PATH = "data/import-configs/historical-expansion-config.json";
const SUMMARY_PATH = "data/research-results/historical-expansion-import-summary.json";
const HTML_PATH = "data/reports/historical-expansion-import-summary.html";
const CHECKPOINT_PATH = "data/research-results/historical-expansion-import-checkpoint.json";

function createMockDiscoveredMarket(
  marketTicker = "KXBTC15M-26JAN151215-00",
) {
  return {
    marketTicker,
    seriesTicker: "KXBTC15M",
    eventTicker: "KXBTC15M-26JAN151215",
    status: "finalized",
    openTime: "2026-01-15T12:00:00.000Z",
    closeTime: "2026-01-15T12:15:00.000Z",
    settlementTime: "2026-01-15T12:20:00.000Z",
    expirationValue: "60010.25",
    title: null,
    subtitle: null,
    listMarketWire: {
      ticker: marketTicker,
      event_ticker: "KXBTC15M-26JAN151215",
      series_ticker: "KXBTC15M",
      status: "finalized",
      open_time: "2026-01-15T12:00:00.000Z",
      close_time: "2026-01-15T12:15:00.000Z",
      expiration_value: "60010.25",
    },
    provenance: {
      source: "kalshi-historical-api" as const,
      fetchedAt: GENERATED_AT,
      requestPath: "/historical/markets?series_ticker=KXBTC15M",
    },
  };
}

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

describe("runExecuteExpansionImportCommand", () => {
  it("writes summary JSON and HTML in dry-run mode by default", async () => {
    const writes = new Map<string, string>();
    let stdout = "";
    let stderr = "";

    const exitCode = await runExecuteExpansionImportCommand([], {
      readFile: (path) => (path === CONFIG_PATH ? createManifestJson() : ""),
      fileExists: (path) => path === CONFIG_PATH,
      isDirectory: () => false,
      readdir: () => [],
      writeStdout: (text) => {
        stdout += text;
      },
      writeStderr: (text) => {
        stderr += text;
      },
      writeFile: (path, data) => {
        writes.set(path, data);
      },
      mkdirSync: () => {},
    }, {
      generatedAt: GENERATED_AT,
      deps: {
        discoverMarkets: vi.fn(async () => [createMockDiscoveredMarket()]),
        runImport: vi.fn(),
      },
    });

    expect(exitCode, stderr).toBe(0);
    expect(JSON.parse(stdout).execute).toBe(false);
    expect(JSON.parse(stdout).plannedCount).toBe(1);
    expect(writes.has(SUMMARY_PATH)).toBe(true);
    expect(writes.has(HTML_PATH)).toBe(true);
    expect(writes.get(HTML_PATH)).toContain("Historical Expansion Import Summary");
  });

  it("runs imports and writes checkpoint artifacts when --execute is passed", async () => {
    const writes = new Map<string, string>();
    let stderr = "";
    const runImport = vi.fn(async () => ({
      jobId: "expansion-import-KXBTC15M-26JAN151215-00",
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
        jobId: "expansion-import-KXBTC15M-26JAN151215-00",
        marketTicker: "KXBTC15M-26JAN151215-00",
        startTime: "2026-01-15T12:00:00.000Z",
        endTime: "2026-01-15T12:15:00.000Z",
        collectionTime: "2026-01-15T12:15:10.000Z",
        observedAt: "2026-01-15T12:15:10.000Z",
        bronzeRecordCount: 1,
        valid: true,
      },
      serialized: "{}",
    }));

    const exitCode = await runExecuteExpansionImportCommand(["--execute"], {
      readFile: (path) => (path === CONFIG_PATH ? createManifestJson() : ""),
      fileExists: (path) => path === CONFIG_PATH,
      isDirectory: () => false,
      readdir: () => [],
      writeStdout: () => {},
      writeStderr: (text) => {
        stderr += text;
      },
      writeFile: (path, data) => {
        writes.set(path, data);
      },
      mkdirSync: () => {},
    }, {
      generatedAt: GENERATED_AT,
      deps: {
        discoverMarkets: vi.fn(async () => [createMockDiscoveredMarket()]),
        runImport,
      },
    });

    expect(exitCode, stderr).toBe(0);
    expect(runImport).toHaveBeenCalledTimes(1);
    expect(
      writes.has(
        "data/imports/KXBTC15M/KXBTC15M-26JAN151215-00/import-result.json",
      ),
    ).toBe(true);
    expect(writes.has(CHECKPOINT_PATH)).toBe(true);
  });

  it("parses --trace-market for reconciliation debugging", () => {
    expect(
      parseExecuteExpansionImportConfigFromArgv(
        normalizeExecuteExpansionImportArgv([
          "--execute",
          "--trace-market",
          "KXBTC15M-25DEC311900-00",
        ]),
      ).traceMarket,
    ).toBe("KXBTC15M-25DEC311900-00");
  });

  it("parses max-markets from equals, space, and npm-forwarded argv forms", () => {
    expect(
      parseExecuteExpansionImportConfigFromArgv(
        normalizeExecuteExpansionImportArgv(["--execute", "--max-markets=10"]),
      ).maxMarkets,
    ).toBe(10);

    expect(
      parseExecuteExpansionImportConfigFromArgv(
        normalizeExecuteExpansionImportArgv(["--execute", "--max-markets", "10"]),
      ).maxMarkets,
    ).toBe(10);

    vi.stubEnv("npm_config_max_markets", "10");
    expect(
      parseExecuteExpansionImportConfigFromArgv(
        normalizeExecuteExpansionImportArgv(["--execute", "10"]),
      ).maxMarkets,
    ).toBe(10);
    vi.unstubAllEnvs();
  });

  it("parses --sample-strategy with supported-first as default", () => {
    expect(
      parseExecuteExpansionImportConfigFromArgv(
        normalizeExecuteExpansionImportArgv(["--execute"]),
      ).sampleStrategy,
    ).toBe("supported-first");

    expect(
      parseExecuteExpansionImportConfigFromArgv(
        normalizeExecuteExpansionImportArgv([
          "--execute",
          "--sample-strategy",
          "earliest",
        ]),
      ).sampleStrategy,
    ).toBe("earliest");
  });

  it("caps executed imports when max-markets is provided", async () => {
    const writes = new Map<string, string>();
    const runImport = vi.fn(async () => ({
      jobId: "expansion-import-KXBTC15M-26JAN151215-00",
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
        jobId: "expansion-import-KXBTC15M-26JAN151215-00",
        marketTicker: "KXBTC15M-26JAN151215-00",
        startTime: "2026-01-15T12:00:00.000Z",
        endTime: "2026-01-15T12:15:00.000Z",
        collectionTime: "2026-01-15T12:15:10.000Z",
        observedAt: "2026-01-15T12:15:10.000Z",
        bronzeRecordCount: 1,
        valid: true,
      },
      serialized: "{}",
    }));

    const exitCode = await runExecuteExpansionImportCommand(
      normalizeExecuteExpansionImportArgv(["--execute", "--max-markets", "1"]),
      {
        readFile: (path) => (path === CONFIG_PATH ? createManifestJson() : ""),
        fileExists: (path) => path === CONFIG_PATH,
        isDirectory: () => false,
        readdir: () => [],
        writeStdout: () => {},
        writeStderr: () => {},
        writeFile: (path, data) => {
          writes.set(path, data);
        },
        mkdirSync: () => {},
      },
      {
        generatedAt: GENERATED_AT,
        deps: {
          discoverMarkets: vi.fn(async () => [
            createMockDiscoveredMarket("KXBTC15M-26JAN151215-00"),
            createMockDiscoveredMarket("KXBTC15M-26JAN151230-00"),
          ]),
          runImport,
        },
      },
    );

    expect(exitCode).toBe(0);
    expect(runImport).toHaveBeenCalledTimes(1);
  });

  it("runs single-market smoke mode without calling full-window discovery", async () => {
    const writes = new Map<string, string>();
    let stdout = "";
    const discoverMarkets = vi.fn(async () => {
      throw new Error("full-window discovery must not run in single-market mode");
    });
    const runImport = vi.fn(async () => ({
      jobId: `expansion-import-${fixture.ticker}`,
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
        jobId: `expansion-import-${fixture.ticker}`,
        marketTicker: fixture.ticker,
        startTime: fixture.listMarket.open_time,
        endTime: fixture.listMarket.close_time,
        collectionTime: "2026-01-15T12:15:10.000Z",
        observedAt: "2026-01-15T12:15:10.000Z",
        bronzeRecordCount: 1,
        valid: true,
      },
      serialized: "{}",
    }));

    const exitCode = await runExecuteExpansionImportCommand(
      ["--market-ticker", fixture.ticker],
      {
        readFile: (path) => (path === CONFIG_PATH ? createManifestJson() : ""),
        fileExists: (path) => path === CONFIG_PATH,
        isDirectory: () => false,
        readdir: () => [],
        writeStdout: (text) => {
          stdout += text;
        },
        writeStderr: () => {},
        writeFile: (path, data) => {
          writes.set(path, data);
        },
        mkdirSync: () => {},
      },
      {
        generatedAt: GENERATED_AT,
        deps: {
          discoverMarkets,
          runImport,
        },
        fetchImpl: async (url: string) => {
          if (String(url).includes("/historical/markets?")) {
            return new Response(
              JSON.stringify({
                markets: [fixture.listMarket],
                cursor: "",
              }),
              { status: 200 },
            );
          }

          if (String(url).includes(`/historical/markets/${fixture.ticker}`)) {
            return new Response(JSON.stringify({ market: fixture.detailMarket }), {
              status: 200,
            });
          }

          throw new Error(`Unexpected fetch URL: ${url}`);
        },
      },
    );

    expect(exitCode).toBe(0);
    expect(discoverMarkets).not.toHaveBeenCalled();
    expect(JSON.parse(stdout).mode).toBe("single-market-smoke");
    expect(JSON.parse(stdout).importStatus).toBe("planned");
    expect(JSON.parse(stdout).reconciliationSuccess).toBe(true);
    expect(JSON.parse(stdout).expirationValueSource).toBe("list");
    expect(writes.has("data/research-results/single-market-expansion-import-debug.json")).toBe(
      true,
    );
    expect(writes.has("data/reports/single-market-expansion-import-debug.html")).toBe(true);
  });

  it("writes import artifacts in single-market execute mode", async () => {
    const writes = new Map<string, string>();
    const discoverMarkets = vi.fn();
    const runImport = vi.fn(async () => ({
      jobId: `expansion-import-${fixture.ticker}`,
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
        jobId: `expansion-import-${fixture.ticker}`,
        marketTicker: fixture.ticker,
        startTime: fixture.listMarket.open_time,
        endTime: fixture.listMarket.close_time,
        collectionTime: "2026-01-15T12:15:10.000Z",
        observedAt: "2026-01-15T12:15:10.000Z",
        bronzeRecordCount: 1,
        valid: true,
      },
      serialized: "{}",
    }));

    const exitCode = await runExecuteExpansionImportCommand(
      ["--market-ticker", fixture.ticker, "--execute"],
      {
        readFile: (path) => (path === CONFIG_PATH ? createManifestJson() : ""),
        fileExists: (path) => path === CONFIG_PATH,
        isDirectory: () => false,
        readdir: () => [],
        writeStdout: () => {},
        writeStderr: () => {},
        writeFile: (path, data) => {
          writes.set(path, data);
        },
        mkdirSync: () => {},
      },
      {
        generatedAt: GENERATED_AT,
        deps: {
          discoverMarkets,
          runImport,
        },
        fetchImpl: async (url: string) => {
          if (String(url).includes("/historical/markets?")) {
            return new Response(
              JSON.stringify({
                markets: [fixture.listMarket],
                cursor: "",
              }),
              { status: 200 },
            );
          }

          if (String(url).includes(`/historical/markets/${fixture.ticker}`)) {
            return new Response(JSON.stringify({ market: fixture.detailMarket }), {
              status: 200,
            });
          }

          throw new Error(`Unexpected fetch URL: ${url}`);
        },
      },
    );

    expect(exitCode).toBe(0);
    expect(discoverMarkets).not.toHaveBeenCalled();
    expect(runImport).toHaveBeenCalledTimes(1);
    expect(writes.has(`data/imports/KXBTC15M/${fixture.ticker}/import-result.json`)).toBe(
      true,
    );
  });
});
