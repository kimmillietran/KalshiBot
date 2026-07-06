import { describe, expect, it } from "vitest";

import { runExpansionRunHistoryCommand } from "./buildExpansionRunHistory";

const GENERATED_AT = "2026-07-05T21:30:00.000Z";
const SUMMARY_PATH = "data/research-results/historical-expansion-import-summary.json";
const CHECKPOINT_PATH = "data/research-results/historical-expansion-import-checkpoint.json";
const OUTPUT_PATH = "data/research-results/expansion-run-history.json";
const HTML_PATH = "data/reports/expansion-run-history.html";

function createIo() {
  const files: Record<string, string> = {
    [SUMMARY_PATH]: JSON.stringify({
      generatedAt: GENERATED_AT,
      execute: true,
      inputPath: "data/import-configs/historical-expansion-config.json",
      outputPath: SUMMARY_PATH,
      summary: {
        jobCount: 1,
        discoveredMarketCount: 1000,
        importedCount: 984,
        skippedCount: 0,
        failedCount: 16,
        plannedCount: 1000,
        durationMs: 600_000,
      },
      rateLimitDiagnostics: {
        rateLimitedCount: 2,
        backoffDurationMs: 5000,
        retryCount: 2,
        firstRateLimitedTicker: null,
        recommendedNextAction: "none",
      },
      discoveryDiagnostics: {
        cacheEnabled: true,
        discoverySegmentsRequested: 6,
        discoverySegmentsCacheHit: 4,
        discoverySegmentsRefreshed: 2,
        discoverySegmentsStale: 0,
        discoverySegmentsCorrupt: 0,
        discoverySegmentPaths: [],
        totalDiscoveredFromCacheCount: 600,
        estimatedDiscoverySavingsMs: 90_000,
      },
      jobs: [
        {
          jobId: "expansion-KXBTC15M-20260101-20260131",
          seriesTicker: "KXBTC15M",
          durationMs: 600_000,
          markets: [
            {
              marketTicker: "KXBTC15M-26JAN151215-00",
              seriesTicker: "KXBTC15M",
              status: "imported",
              durationMs: 1500,
            },
          ],
        },
      ],
    }),
    [CHECKPOINT_PATH]: JSON.stringify({
      generatedAt: GENERATED_AT,
      updatedAt: GENERATED_AT,
      inputPath: "data/import-configs/historical-expansion-config.json",
      checkpointPath: CHECKPOINT_PATH,
      resume: false,
      runStatus: "completed",
      maxRetries: 2,
      jobs: [],
    }),
  };

  let stdout = "";
  let stderr = "";

  return {
    files,
    stdout: () => stdout,
    stderr: () => stderr,
    io: {
      readFile: (path: string) => files[path] ?? "",
      fileExists: (path: string) => path in files,
      readdir: () => [] as string[],
      isDirectory: () => false,
      writeStdout: (text: string) => {
        stdout += text;
      },
      writeStderr: (text: string) => {
        stderr += text;
      },
      writeFile: (path: string, data: string) => {
        files[path] = data;
      },
      mkdirSync: () => undefined,
    },
  };
}

describe("runExpansionRunHistoryCommand", () => {
  it("creates history on first run", () => {
    const fixture = createIo();

    const exitCode = runExpansionRunHistoryCommand(
      ["--output", OUTPUT_PATH, "--html-output", HTML_PATH],
      fixture.io,
      { generatedAt: GENERATED_AT },
    );

    expect(exitCode).toBe(0);
    expect(fixture.files[OUTPUT_PATH]).toBeDefined();
    expect(fixture.files[HTML_PATH]).toContain("Expansion Run History");
    expect(JSON.parse(fixture.files[OUTPUT_PATH]!).runs).toHaveLength(1);
  });

  it("appends a second run to existing history", () => {
    const fixture = createIo();
    fixture.files[OUTPUT_PATH] = JSON.stringify({
      schemaVersion: 1,
      generatedAt: "2026-07-04T10:00:00.000Z",
      outputPath: OUTPUT_PATH,
      htmlOutputPath: HTML_PATH,
      maxRunsRetained: 100,
      runs: [
        {
          runId: "2026-07-04T10:00:00.000Z",
          generatedAt: "2026-07-04T10:00:00.000Z",
          summarySourcePath: SUMMARY_PATH,
          maxMarkets: 100,
          plannedCount: 100,
          importedCount: 10,
          failedCount: 90,
          skippedCount: 0,
          unsupportedCount: 80,
          rateLimitedCount: 0,
          backoffDurationMs: 0,
          elapsedMs: 60_000,
          importsPerMinute: 10,
          discoveryTimeEstimateMs: 40_000,
          discoveryOverheadShare: 0.66,
          discoverySegmentsCacheHit: 0,
          discoverySegmentsRefreshed: 0,
          estimatedDiscoverySavingsMs: 0,
          cacheEnabled: true,
          discoverySegmentsCorrupt: 0,
          sampleStrategy: "supported-first",
          adaptiveThrottleEnabled: false,
          resultingFixtureCount: 10,
          resultingAtlasMarketCount: null,
          researchYieldPerImportedMarket: null,
          importSuccessRate: 0.1,
          unsupportedRate: 0.8,
          rateLimitRate: 0,
          execute: true,
          runStatus: "partial",
        },
      ],
    });

    const exitCode = runExpansionRunHistoryCommand(
      ["--output", OUTPUT_PATH, "--html-output", HTML_PATH],
      fixture.io,
      { generatedAt: GENERATED_AT },
    );

    expect(exitCode).toBe(0);
    expect(JSON.parse(fixture.files[OUTPUT_PATH]!).runs).toHaveLength(2);
  });
});
