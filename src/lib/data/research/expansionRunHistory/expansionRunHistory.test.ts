import { describe, expect, it } from "vitest";

import {
  analyzeExpansionRunHistory,
  findBestRunByMetric,
  findWorstRunByMetric,
} from "./analyzeExpansionRunHistory";
import { buildExpansionRunHistoryRun } from "./buildExpansionRunHistoryRun";
import { buildExpansionRunHistoryReport } from "./buildExpansionRunHistoryReport";
import {
  appendExpansionRunHistoryRun,
  pruneExpansionRunHistoryRuns,
  serializeExpansionRunHistoryDocument,
  tryLoadExpansionRunHistoryDocument,
} from "./expansionRunHistoryDocument";
import type { ExpansionRunHistoryRun } from "./expansionRunHistoryTypes";
import { DEFAULT_EXPANSION_RUN_HISTORY_MAX_RUNS } from "./expansionRunHistoryTypes";
import { loadExpansionRunHistoryInputs } from "./loadExpansionRunHistoryInputs";
import { serializeExpansionRunHistoryHtml } from "./serializeExpansionRunHistoryHtml";

const HISTORY_PATH = "data/research-results/expansion-run-history.json";
const HTML_PATH = "data/reports/expansion-run-history.html";
const SUMMARY_PATH = "data/research-results/historical-expansion-import-summary.json";
const CHECKPOINT_PATH = "data/research-results/historical-expansion-import-checkpoint.json";
const REBUILD_PATH = "data/research-results/expansion-rebuild-summary.json";

function createRun(input: {
  runId: string;
  importedCount?: number;
  failedCount?: number;
  unsupportedCount?: number;
  rateLimitedCount?: number;
  importsPerMinute?: number | null;
  discoveryOverheadShare?: number | null;
  importSuccessRate?: number | null;
  researchYieldPerImportedMarket?: number | null;
}): ExpansionRunHistoryRun {
  return {
    runId: input.runId,
    generatedAt: input.runId,
    summarySourcePath: SUMMARY_PATH,
    maxMarkets: 1000,
    plannedCount: 1000,
    importedCount: input.importedCount ?? 100,
    failedCount: input.failedCount ?? 0,
    skippedCount: 0,
    unsupportedCount: input.unsupportedCount ?? 0,
    rateLimitedCount: input.rateLimitedCount ?? 0,
    backoffDurationMs: 0,
    elapsedMs: 60_000,
    importsPerMinute: input.importsPerMinute ?? 100,
    discoveryTimeEstimateMs: 30_000,
    discoveryOverheadShare: input.discoveryOverheadShare ?? 0.5,
    discoverySegmentsCacheHit: 0,
    discoverySegmentsRefreshed: 0,
    estimatedDiscoverySavingsMs: 0,
    cacheEnabled: true,
    discoverySegmentsCorrupt: 0,
    sampleStrategy: "supported-first",
    adaptiveThrottleEnabled: true,
    resultingFixtureCount: 100,
    resultingAtlasMarketCount: 80,
    researchYieldPerImportedMarket: input.researchYieldPerImportedMarket ?? 0.8,
    importSuccessRate: input.importSuccessRate ?? 0.98,
    unsupportedRate: 0.02,
    rateLimitRate: 0.01,
    execute: true,
    runStatus: "completed",
  };
}

function createSummaryJson(input: {
  generatedAt: string;
  importedCount?: number;
  failedCount?: number;
  unsupportedCount?: number;
  skippedUnsupportedCount?: number;
  durationMs?: number;
  rateLimitedCount?: number;
  adaptiveThrottleEnabled?: boolean;
  discoverySegmentsCacheHit?: number;
  discoverySegmentsRefreshed?: number;
  estimatedDiscoverySavingsMs?: number;
  cacheEnabled?: boolean;
  discoverySegmentsCorrupt?: number;
}) {
  return JSON.stringify({
    generatedAt: input.generatedAt,
    execute: true,
    inputPath: "data/import-configs/historical-expansion-config.json",
    outputPath: SUMMARY_PATH,
    htmlOutputPath: "data/reports/historical-expansion-import-summary.html",
    checkpointPath: CHECKPOINT_PATH,
    resume: false,
    maxRetries: 2,
    runStatus: "completed",
    importConfigsDir: "data/import-configs",
    importsDir: "data/imports",
    maxMarkets: 1000,
    sampleStrategy: "supported-first",
    rateLimitDiagnostics: {
      rateLimitedCount: input.rateLimitedCount ?? 0,
      backoffDurationMs: 1000,
      retryCount: 0,
      firstRateLimitedTicker: null,
      recommendedNextAction: "none",
    },
    adaptiveThrottleDiagnostics: {
      adaptiveThrottleEnabled: input.adaptiveThrottleEnabled ?? true,
      minBackoffMs: 250,
      maxBackoffMs: 5000,
      currentDelayMs: 500,
      initialDelayMs: 500,
      rateLimitEvents: input.rateLimitedCount ?? 0,
      avoidedRetriesEstimate: null,
      totalBackoffMs: 1000,
      throughputMarketsPerMinute: 120,
      throttleAdjustmentCount: 1,
    },
    discoveryDiagnostics: {
      cacheEnabled: input.cacheEnabled ?? true,
      discoverySegmentsRequested: 12,
      discoverySegmentsCacheHit: input.discoverySegmentsCacheHit ?? 8,
      discoverySegmentsRefreshed: input.discoverySegmentsRefreshed ?? 4,
      discoverySegmentsStale: 0,
      discoverySegmentsCorrupt: input.discoverySegmentsCorrupt ?? 0,
      discoverySegmentPaths: ["data/research-results/discovery-cache/KXBTC15M-2026-01.json"],
      totalDiscoveredFromCacheCount: 800,
      estimatedDiscoverySavingsMs: input.estimatedDiscoverySavingsMs ?? 120_000,
    },
    summary: {
      jobCount: 1,
      discoveredMarketCount: 1000,
      importedCount: input.importedCount ?? 984,
      skippedCount: 0,
      failedCount: input.failedCount ?? 16,
      plannedCount: 1000,
      unsupportedCount: input.unsupportedCount ?? 0,
      skippedUnsupportedCount: input.skippedUnsupportedCount ?? 0,
      durationMs: input.durationMs ?? 600_000,
    },
    jobs: [
      {
        jobId: "expansion-KXBTC15M-20260101-20260131",
        seriesTicker: "KXBTC15M",
        durationMs: input.durationMs ?? 600_000,
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
  });
}

describe("expansionRunHistoryDocument", () => {
  it("creates history on first run", () => {
    const run = createRun({ runId: "2026-07-01T10:00:00.000Z" });
    const history = appendExpansionRunHistoryRun(null, run, {
      generatedAt: "2026-07-01T10:05:00.000Z",
      outputPath: HISTORY_PATH,
      htmlOutputPath: HTML_PATH,
    });

    expect(history.runs).toHaveLength(1);
    expect(history.runs[0]?.runId).toBe(run.runId);
  });

  it("appends without overwriting prior runs", () => {
    const first = createRun({ runId: "2026-07-01T10:00:00.000Z", importedCount: 100 });
    const second = createRun({ runId: "2026-07-02T10:00:00.000Z", importedCount: 984 });
    const history = appendExpansionRunHistoryRun(
      appendExpansionRunHistoryRun(null, first, {
        generatedAt: "2026-07-01T10:05:00.000Z",
        outputPath: HISTORY_PATH,
        htmlOutputPath: HTML_PATH,
      }),
      second,
      {
        generatedAt: "2026-07-02T10:05:00.000Z",
        outputPath: HISTORY_PATH,
        htmlOutputPath: HTML_PATH,
      },
    );

    expect(history.runs.map((run) => run.runId)).toEqual([
      "2026-07-01T10:00:00.000Z",
      "2026-07-02T10:00:00.000Z",
    ]);
  });

  it("recovers from corrupted previous history", () => {
    const io = {
      readFile: () => "{not-json",
      fileExists: () => true,
    };
    const loaded = tryLoadExpansionRunHistoryDocument(io, HISTORY_PATH);

    expect(loaded.document).toBeNull();
    expect(loaded.corrupted).toBe(true);
  });

  it("prunes to latest 100 runs", () => {
    const runs = Array.from({ length: 105 }, (_, index) =>
      createRun({ runId: `2026-07-${String(index + 1).padStart(2, "0")}T10:00:00.000Z` }),
    );
    const history = pruneExpansionRunHistoryRuns({
      schemaVersion: 1,
      generatedAt: "2026-07-05T10:00:00.000Z",
      outputPath: HISTORY_PATH,
      htmlOutputPath: HTML_PATH,
      maxRunsRetained: DEFAULT_EXPANSION_RUN_HISTORY_MAX_RUNS,
      runs,
    });

    expect(history.runs).toHaveLength(100);
    expect(history.runs[0]?.runId).toBe("2026-07-06T10:00:00.000Z");
  });

  it("includes schemaVersion in new history documents", () => {
    const run = createRun({ runId: "2026-07-01T10:00:00.000Z" });
    const history = appendExpansionRunHistoryRun(null, run, {
      generatedAt: "2026-07-01T10:05:00.000Z",
      outputPath: HISTORY_PATH,
      htmlOutputPath: HTML_PATH,
    });

    expect(history.schemaVersion).toBe(1);
  });
});

describe("analyzeExpansionRunHistory", () => {
  it("computes improving throughput and success trends", () => {
    const runs = [
      createRun({
        runId: "2026-07-01T10:00:00.000Z",
        importedCount: 100,
        importsPerMinute: 20,
        importSuccessRate: 0.5,
        discoveryOverheadShare: 0.8,
      }),
      createRun({
        runId: "2026-07-02T10:00:00.000Z",
        importedCount: 500,
        importsPerMinute: 80,
        importSuccessRate: 0.9,
        discoveryOverheadShare: 0.4,
      }),
      createRun({
        runId: "2026-07-03T10:00:00.000Z",
        importedCount: 984,
        importsPerMinute: 120,
        importSuccessRate: 0.98,
        discoveryOverheadShare: 0.2,
      }),
    ];

    const analysis = analyzeExpansionRunHistory(runs);

    expect(analysis.trends.importSuccessRate.direction).toBe("improving");
    expect(analysis.trends.importsPerMinute.direction).toBe("improving");
    expect(analysis.trends.discoveryOverheadShare.direction).toBe("improving");
    expect(analysis.highlights.bestThroughputRun?.importsPerMinute).toBe(120);
    expect(analysis.highlights.efficiencyImproving).toBe(true);
  });

  it("identifies best and worst runs", () => {
    const runs = [
      createRun({ runId: "2026-07-01T10:00:00.000Z", importsPerMinute: 40 }),
      createRun({ runId: "2026-07-02T10:00:00.000Z", importsPerMinute: 120 }),
      createRun({ runId: "2026-07-03T10:00:00.000Z", discoveryOverheadShare: 0.9 }),
    ];

    expect(findBestRunByMetric(runs, "importsPerMinute")?.runId).toBe(
      "2026-07-02T10:00:00.000Z",
    );
    expect(findWorstRunByMetric(runs, "discoveryOverheadShare")?.runId).toBe(
      "2026-07-03T10:00:00.000Z",
    );
  });
});

describe("buildExpansionRunHistoryReport", () => {
  it("builds a run record from expansion import summary inputs", () => {
    const loaded = {
      summaryPath: SUMMARY_PATH,
      summary: JSON.parse(createSummaryJson({ generatedAt: "2026-07-05T12:00:00.000Z" })),
      performanceMetrics: {
        summaryMetrics: {
          totalElapsedMs: 600_000,
          importsPerMinute: 98.4,
        },
        timeEstimates: {
          discoveryTimeEstimateMs: 300_000,
        },
      },
      resultingFixtureCount: 984,
      resultingAtlasMarketCount: 900,
      discoverySegmentsCacheHit: 8,
      discoverySegmentsRefreshed: 4,
      estimatedDiscoverySavingsMs: 120_000,
      cacheEnabled: true,
      discoverySegmentsCorrupt: 0,
      experimentSnapshotCount: 3,
    };

    const run = buildExpansionRunHistoryRun(loaded as never);

    expect(run.importedCount).toBe(984);
    expect(run.adaptiveThrottleEnabled).toBe(true);
    expect(run.resultingAtlasMarketCount).toBe(900);
    expect(run.researchYieldPerImportedMarket).toBeCloseTo(900 / 984, 3);
    expect(run.discoverySegmentsCacheHit).toBe(8);
    expect(run.estimatedDiscoverySavingsMs).toBe(120_000);
  });

  it("reads discovery metrics from summary discoveryDiagnostics, not checkpoint", () => {
    const summaryJson = createSummaryJson({
      generatedAt: "2026-07-05T12:00:00.000Z",
      discoverySegmentsCacheHit: 10,
      discoverySegmentsRefreshed: 2,
      estimatedDiscoverySavingsMs: 250_000,
      cacheEnabled: false,
      discoverySegmentsCorrupt: 1,
    });
    const files: Record<string, string> = {
      [SUMMARY_PATH]: summaryJson,
      [CHECKPOINT_PATH]: JSON.stringify({
        generatedAt: "2026-07-05T12:00:00.000Z",
        updatedAt: "2026-07-05T12:00:00.000Z",
        inputPath: "data/import-configs/historical-expansion-config.json",
        checkpointPath: CHECKPOINT_PATH,
        resume: false,
        runStatus: "completed",
        maxRetries: 2,
        jobs: [],
        discoveryCacheHitCount: 999,
        discoveryCacheMissCount: 888,
      }),
    };

    const io = {
      readFile: (path: string) => files[path] ?? "",
      fileExists: (path: string) => path in files,
      readdir: () => [] as string[],
      isDirectory: () => false,
    };

    const loaded = loadExpansionRunHistoryInputs(io, {
      expansionImportSummaryPath: SUMMARY_PATH,
      expansionImportCheckpointPath: CHECKPOINT_PATH,
      expansionRebuildSummaryPath: REBUILD_PATH,
      experimentIndexPath: "data/research-results/experiment-index.json",
      importConfigsDir: "data/import-configs",
      importsDir: "data/imports",
      historyPath: HISTORY_PATH,
    });

    expect(loaded.discoverySegmentsCacheHit).toBe(10);
    expect(loaded.discoverySegmentsRefreshed).toBe(2);
    expect(loaded.estimatedDiscoverySavingsMs).toBe(250_000);
    expect(loaded.cacheEnabled).toBe(false);
    expect(loaded.discoverySegmentsCorrupt).toBe(1);
  });

  it("writes history and report from CLI inputs", () => {
    const files: Record<string, string> = {
      [SUMMARY_PATH]: createSummaryJson({ generatedAt: "2026-07-05T12:00:00.000Z" }),
      [CHECKPOINT_PATH]: JSON.stringify({
        generatedAt: "2026-07-05T12:00:00.000Z",
        updatedAt: "2026-07-05T12:00:00.000Z",
        inputPath: "data/import-configs/historical-expansion-config.json",
        checkpointPath: CHECKPOINT_PATH,
        resume: false,
        runStatus: "completed",
        maxRetries: 2,
        jobs: [],
      }),
      [REBUILD_PATH]: JSON.stringify({
        generatedAt: "2026-07-05T12:05:00.000Z",
        after: { fixtureCount: 984, atlasMarketCount: 900 },
      }),
    };

    const io = {
      readFile: (path: string) => files[path] ?? "",
      fileExists: (path: string) => path in files,
      readdir: () => [] as string[],
      isDirectory: () => false,
    };

    const { historyJson, report } = buildExpansionRunHistoryReport({
      generatedAt: "2026-07-05T12:10:00.000Z",
      outputPath: HISTORY_PATH,
      htmlOutputPath: HTML_PATH,
      historyPath: HISTORY_PATH,
      inputPaths: {
        expansionImportSummaryPath: SUMMARY_PATH,
        expansionImportCheckpointPath: CHECKPOINT_PATH,
        expansionRebuildSummaryPath: REBUILD_PATH,
        experimentIndexPath: "data/research-results/experiment-index.json",
        importConfigsDir: "data/import-configs",
        importsDir: "data/imports",
        historyPath: HISTORY_PATH,
      },
      io,
    });

    expect(JSON.parse(historyJson).runs).toHaveLength(1);
    expect(report.summary.runCount).toBe(1);
    expect(report.highlights.latestRun?.importedCount).toBe(984);

    const html = serializeExpansionRunHistoryHtml(report);
    expect(html).toContain("Expansion Run History");
    expect(html).toContain("984");
    expect(html).toContain("completed");
  });
});

describe("serializeExpansionRunHistoryDocument", () => {
  it("serializes deterministically", () => {
    const history = appendExpansionRunHistoryRun(null, createRun({ runId: "2026-07-01T10:00:00.000Z" }), {
      generatedAt: "2026-07-01T10:05:00.000Z",
      outputPath: HISTORY_PATH,
      htmlOutputPath: HTML_PATH,
    });

    expect(serializeExpansionRunHistoryDocument(history)).toContain("2026-07-01T10:00:00.000Z");
  });
});
