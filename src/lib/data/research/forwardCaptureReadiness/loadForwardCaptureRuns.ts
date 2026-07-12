import { z } from "zod";

import {
  parseIsoTimestampMs,
  utcDateKey,
} from "./forwardCaptureReadinessMath";
import {
  accumulateTopOfBookRecord,
  createEmptyRunBtcSpotStats,
  createEmptyRunTopOfBookStats,
  validBookShare,
  type RunBtcSpotStats,
  type RunTopOfBookStats,
} from "./runTopOfBookStats";
import type {
  ForwardCaptureReadinessIo,
  ForwardCaptureRunTableEntry,
} from "./forwardCaptureReadinessTypes";

const captureHealthSchema = z
  .object({
    runId: z.string(),
    generatedAt: z.string().optional(),
    startedAt: z.string().optional(),
    endedAt: z.string().optional(),
    verdict: z.string().optional(),
    config: z
      .object({
        series: z.string().optional(),
        durationSeconds: z.number().optional(),
        durationMinutes: z.number().optional(),
        maxMarkets: z.number().optional(),
        dryRun: z.boolean().optional(),
      })
      .passthrough()
      .optional(),
    marketDiscovery: z
      .object({
        selectedMarketTickers: z.array(z.string()).optional(),
        marketsSubscribed: z.number().optional(),
      })
      .passthrough()
      .optional(),
    capture: z
      .object({
        messagesReceived: z.number().optional(),
        rawMessageCount: z.number().optional(),
        topOfBookRecordCount: z.number().optional(),
      })
      .passthrough()
      .optional(),
    orderbook: z
      .object({
        validTopOfBookRecords: z.number().optional(),
        economicallyValidTopOfBookRecords: z.number().optional(),
        sequenceValidTopOfBookRecords: z.number().optional(),
        parityUsableTopOfBookRecords: z.number().optional(),
        sequenceGapCount: z.number().optional(),
        reconnectCount: z.number().optional(),
        marketsWithValidBook: z.number().optional(),
      })
      .passthrough()
      .optional(),
    connection: z
      .object({
        reconnectCount: z.number().optional(),
      })
      .passthrough()
      .optional(),
    btcSpot: z
      .object({
        status: z.string().optional(),
        recordsCaptured: z.number().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const topOfBookRecordSchema = z
  .object({
    runId: z.string().optional(),
    marketTicker: z.string(),
    eventTicker: z.string().nullable().optional(),
    seriesTicker: z.string().optional(),
    receivedAtLocal: z.string(),
    bookState: z.string(),
    yesBestBidCents: z.number().nullable().optional(),
    yesBestAskCents: z.number().nullable().optional(),
    yesBestBidSize: z.number().nullable().optional(),
    yesBestAskSize: z.number().nullable().optional(),
    noBestBidCents: z.number().nullable().optional(),
    noBestAskCents: z.number().nullable().optional(),
    noBestBidSize: z.number().nullable().optional(),
    noBestAskSize: z.number().nullable().optional(),
    yesSpreadCents: z.number().nullable().optional(),
    noSpreadCents: z.number().nullable().optional(),
    isEconomicallyValid: z.boolean().optional(),
    isParityUsable: z.boolean().optional(),
    economicBookState: z.string().optional(),
  })
  .passthrough();

const btcSpotRecordSchema = z
  .object({
    runId: z.string().optional(),
    receivedAtLocal: z.string(),
    priceUsd: z.number(),
  })
  .passthrough();

export type ParsedTopOfBookRecord = z.infer<typeof topOfBookRecordSchema>;
export type ParsedBtcSpotRecord = z.infer<typeof btcSpotRecordSchema>;
export type ParsedCaptureHealth = z.infer<typeof captureHealthSchema>;

export type LoadedForwardCaptureRun = {
  runId: string;
  sourceRoot: string;
  healthPath: string;
  health: ParsedCaptureHealth;
  topOfBookStats: RunTopOfBookStats;
  btcSpotStats: RunBtcSpotStats;
  rawMessageCount: number;
};

export type ForwardCaptureLoadWarning = {
  runId: string | null;
  runDir: string;
  message: string;
};

function joinPath(root: string, child: string): string {
  return `${root.replace(/[\\/]+$/, "")}/${child}`;
}

function discoverRunDirectories(
  io: ForwardCaptureReadinessIo,
  rootPath: string,
): string[] {
  if (!io.fileExists(rootPath) || !io.isDirectory(rootPath)) {
    return [];
  }

  return io
    .readdir(rootPath)
    .map((entry) => joinPath(rootPath, entry))
    .filter((entryPath) => io.isDirectory(entryPath))
    .filter((entryPath) => io.fileExists(joinPath(entryPath, "capture-health.json")));
}

function streamJsonlLines<T>(
  content: string,
  schema: z.ZodType<T>,
  onRecord: (record: T) => void,
): { malformedLineCount: number } {
  let malformedLineCount = 0;

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    try {
      const parsed = schema.safeParse(JSON.parse(trimmed));
      if (parsed.success) {
        onRecord(parsed.data);
      } else {
        malformedLineCount += 1;
      }
    } catch {
      malformedLineCount += 1;
    }
  }

  return { malformedLineCount };
}

function streamTopOfBookFile(
  content: string,
): RunTopOfBookStats {
  const stats = createEmptyRunTopOfBookStats();
  let previousTimestampMs: number | null = null;

  const result = streamJsonlLines(content, topOfBookRecordSchema, (record) => {
    previousTimestampMs = accumulateTopOfBookRecord(
      stats,
      record,
      previousTimestampMs,
    );
  });

  stats.malformedLineCount = result.malformedLineCount;
  return stats;
}

function streamBtcSpotFile(content: string): RunBtcSpotStats {
  const stats = createEmptyRunBtcSpotStats();

  const result = streamJsonlLines(content, btcSpotRecordSchema, (record) => {
    stats.recordCount += 1;
    const day = utcDateKey(record.receivedAtLocal);
    if (day) {
      stats.calendarDays.add(day);
    }
  });

  stats.malformedLineCount = result.malformedLineCount;
  return stats;
}

function resolveRawMessageCount(health: ParsedCaptureHealth): number {
  return (
    health.capture?.rawMessageCount
    ?? health.capture?.messagesReceived
    ?? 0
  );
}

function resolveTopOfBookRecordCount(
  health: ParsedCaptureHealth,
  stats: RunTopOfBookStats,
): number {
  return (
    health.capture?.topOfBookRecordCount
    ?? health.orderbook?.validTopOfBookRecords
    ?? stats.recordCount
  );
}

function resolveBtcSpotRecordCount(
  health: ParsedCaptureHealth,
  stats: RunBtcSpotStats,
): number {
  return health.btcSpot?.recordsCaptured ?? stats.recordCount;
}

export function loadRun(
  io: ForwardCaptureReadinessIo,
  runDir: string,
  sourceRoot: string,
): { run: LoadedForwardCaptureRun | null; warning: ForwardCaptureLoadWarning | null } {
  const healthPath = joinPath(runDir, "capture-health.json");
  if (!io.fileExists(healthPath)) {
    return {
      run: null,
      warning: {
        runId: null,
        runDir,
        message: "Missing capture-health.json; run skipped.",
      },
    };
  }

  try {
    const health = captureHealthSchema.parse(JSON.parse(io.readFile(healthPath)));
    const topOfBookPath = joinPath(runDir, "top-of-book.jsonl");
    const btcSpotPath = joinPath(runDir, "btc-spot.jsonl");

    const topOfBookStats = io.fileExists(topOfBookPath)
      ? streamTopOfBookFile(io.readFile(topOfBookPath))
      : createEmptyRunTopOfBookStats();
    const btcSpotStats = io.fileExists(btcSpotPath)
      ? streamBtcSpotFile(io.readFile(btcSpotPath))
      : createEmptyRunBtcSpotStats();

    const normalizedTopOfBookStats = {
      ...topOfBookStats,
      recordCount: resolveTopOfBookRecordCount(health, topOfBookStats),
    };
    const normalizedBtcSpotStats = {
      ...btcSpotStats,
      recordCount: resolveBtcSpotRecordCount(health, btcSpotStats),
    };

    return {
      run: {
        runId: health.runId,
        sourceRoot,
        healthPath,
        health,
        topOfBookStats: normalizedTopOfBookStats,
        btcSpotStats: normalizedBtcSpotStats,
        rawMessageCount: resolveRawMessageCount(health),
      },
      warning: null,
    };
  } catch (error) {
    return {
      run: null,
      warning: {
        runId: null,
        runDir,
        message:
          error instanceof Error
            ? `Failed to load run: ${error.message}`
            : "Failed to load run.",
      },
    };
  }
}

/** Discovers and loads forward capture runs from spike and forward-quote roots. */
export function loadForwardCaptureRuns(
  io: ForwardCaptureReadinessIo,
  inputPaths: { forwardQuotesDir: string; kalshiWsSpikeDir: string },
): LoadedForwardCaptureRun[] {
  const result = loadForwardCaptureRunsWithWarnings(io, inputPaths);
  return result.runs;
}

export function loadForwardCaptureRunsWithWarnings(
  io: ForwardCaptureReadinessIo,
  inputPaths: { forwardQuotesDir: string; kalshiWsSpikeDir: string },
): { runs: LoadedForwardCaptureRun[]; warnings: ForwardCaptureLoadWarning[] } {
  const runDirs = [
    ...discoverRunDirectories(io, inputPaths.forwardQuotesDir),
    ...discoverRunDirectories(io, inputPaths.kalshiWsSpikeDir),
  ];

  const runs: LoadedForwardCaptureRun[] = [];
  const warnings: ForwardCaptureLoadWarning[] = [];

  for (const runDir of runDirs) {
    const sourceRoot = runDir.includes(inputPaths.forwardQuotesDir)
      ? inputPaths.forwardQuotesDir
      : inputPaths.kalshiWsSpikeDir;
    const loaded = loadRun(io, runDir, sourceRoot);
    if (loaded.run) {
      runs.push(loaded.run);
    }
    if (loaded.warning) {
      warnings.push(loaded.warning);
    }
  }

  return {
    runs: runs.sort((left, right) => left.runId.localeCompare(right.runId)),
    warnings,
  };
}

function isSuccessfulRun(verdict: string | undefined): boolean {
  return (
    verdict === "capture-spike-success"
    || verdict === "forward-capture-success"
    || verdict === "capture-mvp-success"
    || verdict === "capture-research-ready"
    || verdict === "degraded-capture"
  );
}

/** Excludes mock, dry-run, credential-failure, and zero-observation captures from default aggregates. */
export function getResearchEligibilityExclusionReason(
  run: LoadedForwardCaptureRun,
): string | null {
  if (run.health.config?.dryRun === true) {
    return "dry-run capture";
  }

  const verdict = run.health.verdict ?? "";
  if (verdict.includes("credential")) {
    return "credential failure capture";
  }

  if (verdict.includes("dry-run")) {
    return "dry-run verdict";
  }

  if (verdict === "capture-too-short") {
    return "capture-too-short verdict";
  }

  const tickers = [
    ...run.topOfBookStats.marketTickers,
    ...(run.health.marketDiscovery?.selectedMarketTickers ?? []),
  ];
  if (tickers.some((ticker) => ticker.includes("MOCK"))) {
    return "mock market ticker";
  }

  if (run.topOfBookStats.recordCount === 0 && run.rawMessageCount === 0) {
    return "zero observations";
  }

  if (!isSuccessfulRun(verdict) && run.topOfBookStats.recordCount === 0) {
    return `ineligible verdict: ${verdict || "unknown"}`;
  }

  return null;
}

export function isResearchEligibleCaptureRun(run: LoadedForwardCaptureRun): boolean {
  return getResearchEligibilityExclusionReason(run) === null;
}

function runDurationMinutes(run: LoadedForwardCaptureRun): number {
  const startedAt = run.health.startedAt;
  const endedAt = run.health.endedAt;
  if (startedAt && endedAt) {
    const startMs = parseIsoTimestampMs(startedAt);
    const endMs = parseIsoTimestampMs(endedAt);
    if (startMs !== null && endMs !== null && endMs > startMs) {
      return (endMs - startMs) / 60_000;
    }
  }

  const durationMinutes = run.health.config?.durationMinutes;
  if (durationMinutes !== undefined && durationMinutes > 0) {
    return durationMinutes;
  }

  const configuredSeconds = run.health.config?.durationSeconds ?? 0;
  if (configuredSeconds > 0) {
    return configuredSeconds / 60;
  }

  const { minTimestampMs, maxTimestampMs } = run.topOfBookStats;
  if (minTimestampMs !== null && maxTimestampMs !== null && maxTimestampMs > minTimestampMs) {
    return (maxTimestampMs - minTimestampMs) / 60_000;
  }

  return 0;
}

function summarizeRun(run: LoadedForwardCaptureRun): ForwardCaptureRunTableEntry {
  return {
    runId: run.runId,
    sourceRoot: run.sourceRoot,
    generatedAt: run.health.generatedAt ?? null,
    durationMinutes: runDurationMinutes(run),
    marketCount:
      run.topOfBookStats.marketTickers.size
      || run.health.marketDiscovery?.selectedMarketTickers?.length
      || 0,
    topOfBookRecordCount: run.topOfBookStats.recordCount,
    btcSpotRecordCount: run.btcSpotStats.recordCount,
    rawMessageCount: run.rawMessageCount,
    validBookShare: validBookShare(run.topOfBookStats),
    sequenceGapCount: run.health.orderbook?.sequenceGapCount ?? 0,
    reconnectCount:
      run.health.orderbook?.reconnectCount
      ?? run.health.connection?.reconnectCount
      ?? 0,
    verdict: run.health.verdict ?? null,
    successful: isSuccessfulRun(run.health.verdict),
  };
}

export type ForwardCaptureRunMetrics = {
  runs: LoadedForwardCaptureRun[];
  runTable: ForwardCaptureRunTableEntry[];
  topOfBookStats: RunTopOfBookStats;
  btcSpotRecordCount: number;
  allGapsMs: number[];
  calendarDays: Set<string>;
};

/** Summarizes loaded runs into metrics used for aggregation and readiness gates. */
export function summarizeForwardCaptureRuns(
  runs: LoadedForwardCaptureRun[],
): ForwardCaptureRunMetrics {
  let topOfBookStats = createEmptyRunTopOfBookStats();
  let btcSpotRecordCount = 0;
  const calendarDays = new Set<string>();

  for (const run of runs) {
    topOfBookStats = {
      ...topOfBookStats,
      recordCount: topOfBookStats.recordCount + run.topOfBookStats.recordCount,
      validRecordCount:
        topOfBookStats.validRecordCount + run.topOfBookStats.validRecordCount,
      economicallyValidRecordCount:
        topOfBookStats.economicallyValidRecordCount
        + run.topOfBookStats.economicallyValidRecordCount,
      parityUsableRecordCount:
        topOfBookStats.parityUsableRecordCount
        + run.topOfBookStats.parityUsableRecordCount,
      bidPairPresentRecordCount:
        topOfBookStats.bidPairPresentRecordCount
        + run.topOfBookStats.bidPairPresentRecordCount,
      nonZeroSpreadRecordCount:
        topOfBookStats.nonZeroSpreadRecordCount
        + run.topOfBookStats.nonZeroSpreadRecordCount,
      hasDepthFields:
        topOfBookStats.hasDepthFields || run.topOfBookStats.hasDepthFields,
      marketTickers: new Set([
        ...topOfBookStats.marketTickers,
        ...run.topOfBookStats.marketTickers,
      ]),
      eventTickers: new Set([
        ...topOfBookStats.eventTickers,
        ...run.topOfBookStats.eventTickers,
      ]),
      seriesTickers: new Set([
        ...topOfBookStats.seriesTickers,
        ...run.topOfBookStats.seriesTickers,
      ]),
      calendarDays: new Set([
        ...topOfBookStats.calendarDays,
        ...run.topOfBookStats.calendarDays,
      ]),
      gapsMs: [...topOfBookStats.gapsMs, ...run.topOfBookStats.gapsMs],
      minTimestampMs:
        topOfBookStats.minTimestampMs === null
          ? run.topOfBookStats.minTimestampMs
          : run.topOfBookStats.minTimestampMs === null
            ? topOfBookStats.minTimestampMs
            : Math.min(topOfBookStats.minTimestampMs, run.topOfBookStats.minTimestampMs),
      maxTimestampMs:
        topOfBookStats.maxTimestampMs === null
          ? run.topOfBookStats.maxTimestampMs
          : run.topOfBookStats.maxTimestampMs === null
            ? topOfBookStats.maxTimestampMs
            : Math.max(topOfBookStats.maxTimestampMs, run.topOfBookStats.maxTimestampMs),
      malformedLineCount:
        topOfBookStats.malformedLineCount + run.topOfBookStats.malformedLineCount,
    };

    btcSpotRecordCount += run.btcSpotStats.recordCount;

    const day = utcDateKey(run.health.generatedAt);
    if (day) {
      calendarDays.add(day);
    }
    for (const recordDay of run.topOfBookStats.calendarDays) {
      calendarDays.add(recordDay);
    }
    for (const spotDay of run.btcSpotStats.calendarDays) {
      calendarDays.add(spotDay);
    }
  }

  return {
    runs,
    runTable: runs.map(summarizeRun),
    topOfBookStats,
    btcSpotRecordCount,
    allGapsMs: topOfBookStats.gapsMs,
    calendarDays,
  };
}

export function buildRunBreakdownMetrics(
  runs: LoadedForwardCaptureRun[],
): import("./forwardCaptureReadinessTypes").ForwardCaptureBreakdownEntry[] {
  return runs.map((run) => {
    const metrics = summarizeForwardCaptureRuns([run]);
    const zeroSpreadRecords =
      metrics.topOfBookStats.recordCount
      - metrics.topOfBookStats.nonZeroSpreadRecordCount;

    return {
      key: run.runId,
      runCount: 1,
      successfulRunCount: isSuccessfulRun(run.health.verdict) ? 1 : 0,
      totalDurationMinutes: runDurationMinutes(run),
      researchReadyDurationMinutes: isSuccessfulRun(run.health.verdict)
        ? runDurationMinutes(run)
        : 0,
      marketCount: metrics.topOfBookStats.marketTickers.size,
      eventCount: metrics.topOfBookStats.eventTickers.size,
      topOfBookRecordCount: metrics.topOfBookStats.recordCount,
      btcSpotRecordCount: run.btcSpotStats.recordCount,
      rawMessageCount: run.rawMessageCount,
      validBookShare: validBookShare(metrics.topOfBookStats),
      sequenceGapCount: run.health.orderbook?.sequenceGapCount ?? 0,
      reconnectCount:
        run.health.orderbook?.reconnectCount
        ?? run.health.connection?.reconnectCount
        ?? 0,
      medianTopOfBookGapMs: null,
      p90TopOfBookGapMs: null,
      btcSpotCoverageShare:
        metrics.topOfBookStats.recordCount > 0
          ? run.btcSpotStats.recordCount / metrics.topOfBookStats.recordCount
          : null,
      nonZeroSpreadShare:
        metrics.topOfBookStats.recordCount > 0
          ? metrics.topOfBookStats.nonZeroSpreadRecordCount
            / metrics.topOfBookStats.recordCount
          : null,
      zeroSpreadShare:
        metrics.topOfBookStats.recordCount > 0
          ? zeroSpreadRecords / metrics.topOfBookStats.recordCount
          : null,
      daysCovered: metrics.calendarDays.size,
      hoursCovered: runDurationMinutes(run) / 60,
    };
  });
}

export function groupRunsByKey(
  runs: LoadedForwardCaptureRun[],
  keySelector: (run: LoadedForwardCaptureRun) => readonly string[],
): Map<string, LoadedForwardCaptureRun[]> {
  const grouped = new Map<string, LoadedForwardCaptureRun[]>();

  for (const run of runs) {
    const keys = new Set(keySelector(run).filter(Boolean));

    if (keys.size === 0) {
      const fallback = utcDateKey(run.health.generatedAt) ?? run.runId;
      const bucket = grouped.get(fallback) ?? [];
      bucket.push(run);
      grouped.set(fallback, bucket);
      continue;
    }

    for (const key of keys) {
      const bucket = grouped.get(key) ?? [];
      bucket.push(run);
      grouped.set(key, bucket);
    }
  }

  return grouped;
}

export {
  isSuccessfulRun,
  runDurationMinutes,
};
