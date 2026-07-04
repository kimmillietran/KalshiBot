import { describe, expect, it, vi } from "vitest";

import { runExecuteExpansionImportCommand } from "./executeExpansionImport";

const GENERATED_AT = "2026-07-04T04:00:00.000Z";
const CONFIG_PATH = "data/import-configs/historical-expansion-config.json";
const SUMMARY_PATH = "data/research-results/historical-expansion-import-summary.json";
const HTML_PATH = "data/reports/historical-expansion-import-summary.html";

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
        reason: null,
        expectedResearchBenefit: null,
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

    const exitCode = await runExecuteExpansionImportCommand([], {
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
    }, {
      generatedAt: GENERATED_AT,
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

    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout).execute).toBe(false);
    expect(JSON.parse(stdout).plannedCount).toBe(1);
    expect(writes.has(SUMMARY_PATH)).toBe(true);
    expect(writes.has(HTML_PATH)).toBe(true);
    expect(writes.get(HTML_PATH)).toContain("Historical Expansion Import Summary");
    expect(
      writes
        .keys()
        .some((path) => path.includes("data/imports/") || path.includes("import-result.json")),
    ).toBe(false);
  });

  it("runs imports when --execute is passed", async () => {
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

    const exitCode = await runExecuteExpansionImportCommand(["--execute"], {
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
    }, {
      generatedAt: GENERATED_AT,
      deps: {
        discoverMarkets: vi.fn(async () => [
          {
            marketTicker: "KXBTC15M-26JAN151215-00",
            seriesTicker: "KXBTC15M",
            openTime: "2026-01-15T12:00:00.000Z",
            closeTime: "2026-01-15T12:15:00.000Z",
          },
        ]),
        runImport,
      },
    });

    expect(exitCode).toBe(0);
    expect(runImport).toHaveBeenCalledTimes(1);
    expect(
      writes.has(
        "data/imports/KXBTC15M/KXBTC15M-26JAN151215-00/import-result.json",
      ),
    ).toBe(true);
  });

  it("writes dry-run progress output to stderr", async () => {
    let stderr = "";

    await runExecuteExpansionImportCommand([], {
      readFile: (path) => (path === CONFIG_PATH ? createManifestJson() : ""),
      fileExists: (path) => path === CONFIG_PATH,
      isDirectory: () => false,
      readdir: () => [],
      writeStdout: () => {},
      writeStderr: (text) => {
        stderr += text;
      },
      writeFile: () => {},
      mkdirSync: () => {},
    }, {
      generatedAt: GENERATED_AT,
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

    expect(stderr).toContain("[Expansion Import] DRY RUN");
    expect(stderr).toContain("Discovered: 1 markets");
    expect(stderr).toContain("Planned: 1");
  });

  it("writes execute progress with resume and max-markets labels to stderr", async () => {
    let stderr = "";

    await runExecuteExpansionImportCommand(
      ["--execute", "--resume", "--max-markets", "1"],
      {
        readFile: (path) => (path === CONFIG_PATH ? createManifestJson() : ""),
        fileExists: (path) => path === CONFIG_PATH,
        isDirectory: () => false,
        readdir: () => [],
        writeStdout: () => {},
        writeStderr: (text) => {
          stderr += text;
        },
        writeFile: () => {},
        mkdirSync: () => {},
      },
      {
        generatedAt: GENERATED_AT,
        deps: {
          discoverMarkets: vi.fn(async () => [
            {
              marketTicker: "KXBTC15M-26JAN151215-00",
              seriesTicker: "KXBTC15M",
              openTime: "2026-01-15T12:00:00.000Z",
              closeTime: "2026-01-15T12:15:00.000Z",
            },
          ]),
          runImport: vi.fn(async () => ({
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
          })),
        },
      },
    );

    expect(stderr).toContain("Import cap: 1 markets (--max-markets)");
    expect(stderr).toContain("Resume: enabled");
    expect(stderr).toContain("Imported: 1");
  });
});
