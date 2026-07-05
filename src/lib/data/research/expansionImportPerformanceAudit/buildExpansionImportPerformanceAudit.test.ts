import { describe, expect, it } from "vitest";

import { buildExpansionImportPerformanceAudit } from "./buildExpansionImportPerformanceAudit";
import { parseExpansionImportPerformanceAuditSummaryJson } from "./loadExpansionImportPerformanceAuditInputs";
import { defaultExpansionImportPerformanceAuditConfig } from "./parseExpansionImportPerformanceAuditArgv";
import { serializeExpansionImportPerformanceAuditHtml } from "./serializeExpansionImportPerformanceAuditHtml";

const GENERATED_AT = "2026-07-05T21:30:00.000Z";
const SUMMARY_PATH = "data/research-results/historical-expansion-import-summary.json";
const CHECKPOINT_PATH = "data/research-results/historical-expansion-import-checkpoint.json";
const IMPORT_CONFIGS_DIR = "data/import-configs";
const IMPORTS_DIR = "data/imports";

const ELAPSED_MS = 698_000;

function buildFixtureSummaryJson(): string {
  const markets = [
    ...Array.from({ length: 984 }, (_, index) => ({
      marketTicker: `KXBTC15M-26JAN${String((index % 28) + 1).padStart(2, "0")}${String(12 + (index % 8)).padStart(2, "0")}${String((index * 3) % 60).padStart(2, "0")}-00`,
      seriesTicker: "KXBTC15M",
      status: "imported" as const,
      durationMs: 1200 + (index % 400),
      importResultPath: `data/imports/KXBTC15M/expansion-import-KXBTC15M-${index}.json`,
    })),
    ...Array.from({ length: 16 }, (_, index) => ({
      marketTicker: `KXBTC15M-26FEB${String(index + 1).padStart(2, "0")}121500-00`,
      seriesTicker: "KXBTC15M",
      status: "failed" as const,
      durationMs: 800 + index * 50,
      errorMessage:
        index % 2 === 0
          ? "Kalshi historical market response missing required fields: expiration_value"
          : "Kalshi API rate limit exceeded (429)",
    })),
  ];

  return JSON.stringify({
    generatedAt: GENERATED_AT,
    execute: true,
    inputPath: "data/import-configs/historical-expansion-config.json",
    outputPath: SUMMARY_PATH,
    importConfigsDir: IMPORT_CONFIGS_DIR,
    importsDir: IMPORTS_DIR,
    maxMarkets: 1000,
    runStatus: "completed",
    rateLimitDiagnostics: {
      rateLimitedCount: 87,
      backoffDurationMs: 435_000,
      retryCount: 87,
      firstRateLimitedTicker: "KXBTC15M-26JAN101230-00",
      recommendedNextAction: "Increase backoff and resume.",
    },
    summary: {
      jobCount: 1,
      discoveredMarketCount: 1100,
      importedCount: 984,
      skippedCount: 100,
      failedCount: 16,
      plannedCount: 1000,
      unsupportedCount: 8,
      skippedUnsupportedCount: 12,
      durationMs: ELAPSED_MS,
    },
    jobs: [
      {
        jobId: "expansion-KXBTC15M-20260101-20260331",
        seriesTicker: "KXBTC15M",
        discoveredMarketCount: 1100,
        importedCount: 984,
        skippedCount: 100,
        failedCount: 16,
        plannedCount: 1000,
        unsupportedCount: 8,
        skippedUnsupportedCount: 12,
        durationMs: ELAPSED_MS,
        markets,
      },
    ],
  });
}

function buildFixtureCheckpointJson(): string {
  return JSON.stringify({
    generatedAt: GENERATED_AT,
    updatedAt: GENERATED_AT,
    inputPath: "data/import-configs/historical-expansion-config.json",
    checkpointPath: CHECKPOINT_PATH,
    resume: false,
    runStatus: "completed",
    maxRetries: 2,
    jobs: [
      {
        jobId: "expansion-KXBTC15M-20260101-20260331",
        lastCompletedMarketTicker: "KXBTC15M-26JAN281945-00",
        completedMarkets: ["KXBTC15M-26JAN281945-00"],
        failedMarkets: [
          {
            marketTicker: "KXBTC15M-26FEB011215-00",
            retryCount: 2,
            lastErrorMessage: "Kalshi API rate limit exceeded (429)",
            lastAttemptAt: GENERATED_AT,
          },
        ],
      },
    ],
  });
}

function createIo() {
  const files: Record<string, string> = {
    [SUMMARY_PATH]: buildFixtureSummaryJson(),
    [CHECKPOINT_PATH]: buildFixtureCheckpointJson(),
    [`${IMPORT_CONFIGS_DIR}/expansion-import-KXBTC15M-sample.json`]: "{}",
    [`${IMPORTS_DIR}/KXBTC15M/expansion-import-sample.json`]: "{}".repeat(100),
  };
  const directories = new Set<string>([
    IMPORT_CONFIGS_DIR,
    IMPORTS_DIR,
    `${IMPORTS_DIR}/KXBTC15M`,
  ]);

  return {
    files,
    io: {
      readFile: (path: string) => files[path] ?? "",
      fileExists: (path: string) => path in files || directories.has(path),
      readdir: (path: string) =>
        Object.keys(files)
          .filter((entry) => entry.startsWith(`${path}/`))
          .map((entry) => entry.slice(path.length + 1).split("/")[0]!)
          .filter((entry, index, entries) => entries.indexOf(entry) === index),
      isDirectory: (path: string) => directories.has(path),
    },
  };
}

describe("buildExpansionImportPerformanceAudit", () => {
  it("computes throughput, backoff, and percentile metrics from a large expansion run", () => {
    const mock = createIo();
    const config = defaultExpansionImportPerformanceAuditConfig();
    const report = buildExpansionImportPerformanceAudit({
      generatedAt: GENERATED_AT,
      config,
      io: mock.io,
    });

    expect(report.summaryMetrics.totalElapsedMs).toBe(ELAPSED_MS);
    expect(report.summaryMetrics.importedCount).toBe(984);
    expect(report.summaryMetrics.failedCount).toBe(16);
    expect(report.summaryMetrics.rateLimitedCount).toBe(87);
    expect(report.summaryMetrics.backoffDurationMs).toBe(435_000);
    expect(report.summaryMetrics.importsPerMinute).toBeCloseTo(84.58, 1);
    expect(report.summaryMetrics.importDurationPercentiles.p50Ms).not.toBeNull();
    expect(report.failedMarketBreakdown.length).toBeGreaterThan(0);
    expect(report.recommendations.adaptiveThrottlingWouldHelp).toBe(true);
    expect(report.recommendations.recommendedBatchSize).not.toBeNull();
    expect(report.throughputByMonth.length).toBeGreaterThan(0);
    expect(report.timeEstimates.backoffTimeMs).toBe(435_000);
  });

  it("parses summaries missing throttle and resume diagnostics", () => {
    const summary = parseExpansionImportPerformanceAuditSummaryJson(
      SUMMARY_PATH,
      buildFixtureSummaryJson(),
    );

    expect(summary.adaptiveThrottleDiagnostics.adaptiveThrottleEnabled).toBe(false);
    expect(summary.adaptiveThrottleDiagnostics.totalBackoffMs).toBe(435_000);
    expect(summary.resumeDiagnostics.resumeSkippedSuccessful).toBe(0);
  });

  it("serializes HTML with key audit sections", () => {
    const mock = createIo();
    const report = buildExpansionImportPerformanceAudit({
      generatedAt: GENERATED_AT,
      config: defaultExpansionImportPerformanceAuditConfig(),
      io: mock.io,
    });
    const html = serializeExpansionImportPerformanceAuditHtml(report);

    expect(html).toContain("Expansion Import Performance Audit");
    expect(html).toContain("Rate-limit events");
    expect(html).toContain("Duration percentiles");
    expect(html).toContain("Optimization suggestions");
    expect(html).toContain("Throughput by month");
  });
});
