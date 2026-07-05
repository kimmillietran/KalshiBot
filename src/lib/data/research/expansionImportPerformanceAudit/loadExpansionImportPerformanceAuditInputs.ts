import { z } from "zod";

import type { ExpansionImportAdaptiveThrottleDiagnostics } from "@/lib/data/importJobs/expansionExecutor/expansionImportAdaptiveThrottle";
import type { HistoricalExpansionImportSummary } from "@/lib/data/importJobs/expansionExecutor/expansionExecutorTypes";
import {
  createExpansionImportResumeDiagnostics,
  parseExpansionImportCheckpointJson,
} from "@/lib/data/importJobs/expansionImportSafety";
import type { HistoricalExpansionImportCheckpoint } from "@/lib/data/importJobs/expansionImportSafety";

import {
  ExpansionImportPerformanceAuditError,
  ExpansionImportPerformanceAuditErrorCode,
  type ExpansionImportPerformanceAuditConfig,
  type ExpansionImportPerformanceAuditInputStatus,
  type ExpansionImportPerformanceAuditIo,
  type ExpansionImportDirectoryStats,
} from "./expansionImportPerformanceAuditTypes";

const marketSchema = z.object({
  marketTicker: z.string().trim().min(1),
  seriesTicker: z.string().trim().min(1),
  status: z.enum(["planned", "imported", "skipped", "failed"]),
  configPath: z.string().nullable().optional(),
  importResultPath: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  skipReason: z.string().nullable().optional(),
  durationMs: z.number().finite().nonnegative().nullable().optional(),
});

const selectionSchema = z.object({
  selectedSupportedMarkets: z.number().finite().nonnegative().optional(),
  selectedUnknownMarkets: z.number().finite().nonnegative().optional(),
  selectedUnsupportedMarkets: z.number().finite().nonnegative().optional(),
  likelySupported: z.number().finite().nonnegative().optional(),
  unknown: z.number().finite().nonnegative().optional(),
  knownUnsupported: z.number().finite().nonnegative().optional(),
});

const jobSchema = z.object({
  jobId: z.string().trim().min(1),
  seriesTicker: z.string().trim().min(1),
  status: z.enum(["completed", "skipped", "failed"]).optional(),
  discoveredMarketCount: z.number().finite().nonnegative().optional(),
  importedCount: z.number().finite().nonnegative().optional(),
  skippedCount: z.number().finite().nonnegative().optional(),
  failedCount: z.number().finite().nonnegative().optional(),
  plannedCount: z.number().finite().nonnegative().optional(),
  unsupportedCount: z.number().finite().nonnegative().optional(),
  skippedUnsupportedCount: z.number().finite().nonnegative().optional(),
  durationMs: z.number().finite().nonnegative().optional(),
  markets: z.array(marketSchema),
});

const summarySchema = z.object({
  generatedAt: z.string().trim().min(1),
  execute: z.boolean(),
  inputPath: z.string().trim().min(1),
  outputPath: z.string().trim().min(1),
  htmlOutputPath: z.string().trim().min(1).optional(),
  checkpointPath: z.string().nullable().optional(),
  resume: z.boolean().optional(),
  maxRetries: z.number().finite().int().nonnegative().optional(),
  runStatus: z.enum(["completed", "partial", "interrupted"]).optional(),
  importConfigsDir: z.string().trim().min(1).optional(),
  importsDir: z.string().trim().min(1).optional(),
  maxMarkets: z.number().finite().int().positive().nullable().optional(),
  rateLimitDiagnostics: z
    .object({
      rateLimitedCount: z.number().finite().nonnegative(),
      backoffDurationMs: z.number().finite().nonnegative(),
      retryCount: z.number().finite().nonnegative(),
      firstRateLimitedTicker: z.string().nullable(),
      recommendedNextAction: z.string(),
    })
    .optional(),
  selection: selectionSchema.optional(),
  summary: z.object({
    jobCount: z.number().finite().nonnegative(),
    discoveredMarketCount: z.number().finite().nonnegative(),
    importedCount: z.number().finite().nonnegative(),
    skippedCount: z.number().finite().nonnegative(),
    failedCount: z.number().finite().nonnegative(),
    plannedCount: z.number().finite().nonnegative(),
    unsupportedCount: z.number().finite().nonnegative().optional(),
    skippedUnsupportedCount: z.number().finite().nonnegative().optional(),
    durationMs: z.number().finite().nonnegative(),
  }),
  jobs: z.array(jobSchema),
  adaptiveThrottleDiagnostics: z
    .object({
      adaptiveThrottleEnabled: z.boolean(),
      minBackoffMs: z.number().finite().nonnegative().nullable(),
      maxBackoffMs: z.number().finite().nonnegative().nullable(),
      currentDelayMs: z.number().finite().nonnegative().nullable(),
      initialDelayMs: z.number().finite().nonnegative().nullable(),
      rateLimitEvents: z.number().finite().nonnegative(),
      avoidedRetriesEstimate: z.number().finite().nonnegative().nullable(),
      totalBackoffMs: z.number().finite().nonnegative(),
      throughputMarketsPerMinute: z.number().finite().nonnegative().nullable(),
      throttleAdjustmentCount: z.number().finite().int().nonnegative(),
    })
    .optional(),
  resumeDiagnostics: z
    .object({
      resumeSkippedSuccessful: z.number().finite().int().nonnegative(),
      resumeSkippedUnsupported: z.number().finite().int().nonnegative(),
      resumeRetriedFailed: z.number().finite().int().nonnegative(),
      resumeRetriedTransient: z.number().finite().int().nonnegative(),
      resumeAmbiguousStateCount: z.number().finite().int().nonnegative(),
    })
    .optional(),
});

function defaultAdaptiveThrottleDiagnostics(
  backoffDurationMs: number,
): ExpansionImportAdaptiveThrottleDiagnostics {
  return {
    adaptiveThrottleEnabled: false,
    minBackoffMs: null,
    maxBackoffMs: null,
    currentDelayMs: null,
    initialDelayMs: null,
    rateLimitEvents: 0,
    avoidedRetriesEstimate: null,
    totalBackoffMs: backoffDurationMs,
    throughputMarketsPerMinute: null,
    throttleAdjustmentCount: 0,
  };
}

function parseJson(path: string, json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    throw new ExpansionImportPerformanceAuditError(
      `Invalid JSON in expansion import summary: ${path}`,
      ExpansionImportPerformanceAuditErrorCode.INVALID_JSON,
    );
  }
}

/** Parses the expansion import summary JSON for performance auditing. */
export function parseExpansionImportPerformanceAuditSummaryJson(
  path: string,
  json: string,
): HistoricalExpansionImportSummary {
  const parsed = parseJson(path, json);
  const result = summarySchema.safeParse(parsed);
  if (!result.success) {
    throw new ExpansionImportPerformanceAuditError(
      `Invalid expansion import summary schema in ${path}: ${result.error.message}`,
      ExpansionImportPerformanceAuditErrorCode.INVALID_DOCUMENT,
    );
  }

  const data = result.data;
  return {
    generatedAt: data.generatedAt,
    execute: data.execute,
    inputPath: data.inputPath,
    outputPath: data.outputPath,
    htmlOutputPath: data.htmlOutputPath ?? "data/reports/historical-expansion-import-summary.html",
    checkpointPath: data.checkpointPath ?? null,
    resume: data.resume ?? false,
    maxRetries: data.maxRetries ?? 0,
    runStatus: data.runStatus ?? "completed",
    importConfigsDir: data.importConfigsDir ?? "data/import-configs",
    importsDir: data.importsDir ?? "data/imports",
    maxMarkets: data.maxMarkets ?? null,
    jobIdFilter: null,
    sampleStrategy: "supported-first",
    selection: {
      selectedSupportedMarkets:
        data.selection?.selectedSupportedMarkets ?? data.selection?.likelySupported ?? 0,
      selectedUnknownMarkets: data.selection?.selectedUnknownMarkets ?? data.selection?.unknown ?? 0,
      selectedUnsupportedMarkets:
        data.selection?.selectedUnsupportedMarkets ?? data.selection?.knownUnsupported ?? 0,
    },
    summary: {
      jobCount: data.summary.jobCount,
      discoveredMarketCount: data.summary.discoveredMarketCount,
      importedCount: data.summary.importedCount,
      skippedCount: data.summary.skippedCount,
      failedCount: data.summary.failedCount,
      plannedCount: data.summary.plannedCount,
      unsupportedCount: data.summary.unsupportedCount ?? 0,
      skippedUnsupportedCount: data.summary.skippedUnsupportedCount ?? 0,
      selectedSupportedMarkets: 0,
      selectedUnknownMarkets: 0,
      selectedUnsupportedMarkets: 0,
      durationMs: data.summary.durationMs,
    },
    jobs: data.jobs.map((job) => ({
      jobId: job.jobId,
      seriesTicker: job.seriesTicker,
      status: job.status ?? "completed",
      discoveredMarketCount: job.discoveredMarketCount ?? job.markets.length,
      importedCount:
        job.importedCount ?? job.markets.filter((entry) => entry.status === "imported").length,
      skippedCount:
        job.skippedCount ?? job.markets.filter((entry) => entry.status === "skipped").length,
      failedCount:
        job.failedCount ?? job.markets.filter((entry) => entry.status === "failed").length,
      plannedCount:
        job.plannedCount ?? job.markets.filter((entry) => entry.status === "planned").length,
      unsupportedCount: job.unsupportedCount ?? 0,
      skippedUnsupportedCount: job.skippedUnsupportedCount ?? 0,
      selection: {
        selectedSupportedMarkets: 0,
        selectedUnknownMarkets: 0,
        selectedUnsupportedMarkets: 0,
      },
      durationMs: job.durationMs ?? 0,
      warnings: [],
      markets: job.markets.map((market) => ({
        marketTicker: market.marketTicker,
        seriesTicker: market.seriesTicker,
        status: market.status,
        configPath: market.configPath ?? null,
        importResultPath: market.importResultPath ?? null,
        errorMessage: market.errorMessage ?? null,
        skipReason: market.skipReason ?? null,
        durationMs: market.durationMs ?? null,
      })),
    })),
    warnings: [],
    rateLimitDiagnostics: data.rateLimitDiagnostics ?? {
      rateLimitedCount: 0,
      backoffDurationMs: 0,
      retryCount: 0,
      firstRateLimitedTicker: null,
      recommendedNextAction: "No rate-limit diagnostics recorded.",
    },
    adaptiveThrottleDiagnostics:
      data.adaptiveThrottleDiagnostics
      ?? defaultAdaptiveThrottleDiagnostics(data.rateLimitDiagnostics?.backoffDurationMs ?? 0),
    resumeDiagnostics: data.resumeDiagnostics ?? createExpansionImportResumeDiagnostics(),
  };
}

function walkDirectory(
  rootDir: string,
  io: ExpansionImportPerformanceAuditIo,
): string[] {
  if (!io.fileExists(rootDir) || !io.isDirectory(rootDir)) {
    return [];
  }

  const paths: string[] = [];

  function walk(currentDir: string): void {
    for (const entry of io.readdir(currentDir)) {
      const fullPath = `${currentDir.replace(/\\/g, "/")}/${entry}`.replace(/\/+/g, "/");
      if (io.isDirectory(fullPath)) {
        walk(fullPath);
        continue;
      }

      paths.push(fullPath);
    }
  }

  walk(rootDir);
  return paths;
}

function scanDirectoryStats(
  rootPath: string,
  io: ExpansionImportPerformanceAuditIo,
  matchers: {
    expansionConfig: (path: string) => boolean;
    importResult: (path: string) => boolean;
  },
): ExpansionImportDirectoryStats {
  const present = io.fileExists(rootPath) && io.isDirectory(rootPath);
  if (!present) {
    return {
      rootPath,
      present: false,
      fileCount: 0,
      totalBytes: 0,
      expansionConfigCount: 0,
      importResultCount: 0,
    };
  }

  const files = walkDirectory(rootPath, io);
  let totalBytes = 0;
  let expansionConfigCount = 0;
  let importResultCount = 0;

  for (const filePath of files) {
    const content = io.readFile(filePath);
    totalBytes += content.length;
    if (matchers.expansionConfig(filePath)) {
      expansionConfigCount += 1;
    }
    if (matchers.importResult(filePath)) {
      importResultCount += 1;
    }
  }

  return {
    rootPath,
    present: true,
    fileCount: files.length,
    totalBytes,
    expansionConfigCount,
    importResultCount,
  };
}

export type LoadedExpansionImportPerformanceAuditInputs = {
  inputStatus: ExpansionImportPerformanceAuditInputStatus;
  summary: HistoricalExpansionImportSummary;
  checkpoint: HistoricalExpansionImportCheckpoint | null;
  importConfigsStats: ExpansionImportDirectoryStats;
  importsDirStats: ExpansionImportDirectoryStats;
};

/** Loads expansion import performance audit inputs from disk. */
export function loadExpansionImportPerformanceAuditInputs(
  config: ExpansionImportPerformanceAuditConfig,
  io: ExpansionImportPerformanceAuditIo,
): LoadedExpansionImportPerformanceAuditInputs {
  if (!io.fileExists(config.expansionImportSummaryPath)) {
    throw new ExpansionImportPerformanceAuditError(
      `Required input not found: ${config.expansionImportSummaryPath}`,
      ExpansionImportPerformanceAuditErrorCode.MISSING_INPUT,
    );
  }

  const summary = parseExpansionImportPerformanceAuditSummaryJson(
    config.expansionImportSummaryPath,
    io.readFile(config.expansionImportSummaryPath),
  );

  const checkpointPresent = io.fileExists(config.expansionImportCheckpointPath);
  const checkpoint = checkpointPresent
    ? parseExpansionImportCheckpointJson(
        config.expansionImportCheckpointPath,
        io.readFile(config.expansionImportCheckpointPath),
      )
    : null;

  const importConfigsStats = scanDirectoryStats(config.importConfigsDir, io, {
    expansionConfig: (path) =>
      path.includes("/expansion-import-") && path.endsWith(".json"),
    importResult: () => false,
  });

  const importsDirStats = scanDirectoryStats(config.importsDir, io, {
    expansionConfig: () => false,
    importResult: (path) =>
      path.endsWith(".json")
      && (path.includes("/expansion-import-") || path.includes("/import-result")),
  });

  return {
    inputStatus: {
      expansionImportSummaryPresent: true,
      expansionImportCheckpointPresent: checkpointPresent,
      importConfigsDirPresent: importConfigsStats.present,
      importsDirPresent: importsDirStats.present,
    },
    summary,
    checkpoint,
    importConfigsStats,
    importsDirStats,
  };
}
