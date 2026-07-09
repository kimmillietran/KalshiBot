import { z } from "zod";

import {
  computeTopOfBookGapsMs,
  parseIsoTimestampMs,
  safeShare,
  utcDateKey,
} from "./forwardCaptureReadinessMath";
import type {
  ForwardCaptureReadinessIo,
  ForwardCaptureRunTableEntry,
} from "./forwardCaptureReadinessTypes";

const captureHealthSchema = z
  .object({
    runId: z.string(),
    generatedAt: z.string().optional(),
    verdict: z.string().optional(),
    config: z
      .object({
        series: z.string().optional(),
        durationSeconds: z.number().optional(),
        maxMarkets: z.number().optional(),
        dryRun: z.boolean().optional(),
      })
      .passthrough()
      .optional(),
    marketDiscovery: z
      .object({
        selectedMarketTickers: z.array(z.string()).optional(),
      })
      .passthrough()
      .optional(),
    capture: z
      .object({
        messagesReceived: z.number().optional(),
      })
      .passthrough()
      .optional(),
    orderbook: z
      .object({
        validTopOfBookRecords: z.number().optional(),
        sequenceGapCount: z.number().optional(),
        reconnectCount: z.number().optional(),
        marketsWithValidBook: z.number().optional(),
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

export type LoadedForwardCaptureRun = {
  runId: string;
  sourceRoot: string;
  healthPath: string;
  health: z.infer<typeof captureHealthSchema>;
  topOfBookRecords: ParsedTopOfBookRecord[];
  btcSpotRecords: ParsedBtcSpotRecord[];
  rawMessageCount: number;
};

function parseJsonl<T>(
  content: string,
  schema: z.ZodType<T>,
): T[] {
  const records: T[] = [];

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    try {
      const parsed = schema.safeParse(JSON.parse(trimmed));
      if (parsed.success) {
        records.push(parsed.data);
      }
    } catch {
      // skip malformed lines
    }
  }

  return records;
}

function countJsonlLines(content: string): number {
  return content
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0).length;
}

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

function loadRun(
  io: ForwardCaptureReadinessIo,
  runDir: string,
  sourceRoot: string,
): LoadedForwardCaptureRun | null {
  const healthPath = joinPath(runDir, "capture-health.json");
  if (!io.fileExists(healthPath)) {
    return null;
  }

  try {
    const health = captureHealthSchema.parse(JSON.parse(io.readFile(healthPath)));
    const topOfBookPath = joinPath(runDir, "top-of-book.jsonl");
    const btcSpotPath = joinPath(runDir, "btc-spot.jsonl");
    const rawMessagesPath = joinPath(runDir, "raw-messages.jsonl");

    const topOfBookRecords = io.fileExists(topOfBookPath)
      ? parseJsonl(io.readFile(topOfBookPath), topOfBookRecordSchema)
      : [];
    const btcSpotRecords = io.fileExists(btcSpotPath)
      ? parseJsonl(io.readFile(btcSpotPath), btcSpotRecordSchema)
      : [];
    const rawMessageCount = io.fileExists(rawMessagesPath)
      ? countJsonlLines(io.readFile(rawMessagesPath))
      : health.capture?.messagesReceived ?? 0;

    return {
      runId: health.runId,
      sourceRoot,
      healthPath,
      health,
      topOfBookRecords,
      btcSpotRecords,
      rawMessageCount,
    };
  } catch {
    return null;
  }
}

/** Discovers and loads forward capture runs from spike and forward-quote roots. */
export function loadForwardCaptureRuns(
  io: ForwardCaptureReadinessIo,
  inputPaths: { forwardQuotesDir: string; kalshiWsSpikeDir: string },
): LoadedForwardCaptureRun[] {
  const runDirs = [
    ...discoverRunDirectories(io, inputPaths.forwardQuotesDir),
    ...discoverRunDirectories(io, inputPaths.kalshiWsSpikeDir),
  ];

  const runs: LoadedForwardCaptureRun[] = [];
  for (const runDir of runDirs) {
    const sourceRoot = runDir.includes(inputPaths.forwardQuotesDir)
      ? inputPaths.forwardQuotesDir
      : inputPaths.kalshiWsSpikeDir;
    const loaded = loadRun(io, runDir, sourceRoot);
    if (loaded) {
      runs.push(loaded);
    }
  }

  return runs.sort((left, right) => left.runId.localeCompare(right.runId));
}

function isSuccessfulRun(verdict: string | undefined): boolean {
  return verdict === "capture-spike-success" || verdict === "forward-capture-success";
}

function hasDepthFields(record: ParsedTopOfBookRecord): boolean {
  return (
    record.yesBestBidSize !== null
    && record.yesBestBidSize !== undefined
    && record.yesBestAskSize !== null
    && record.yesBestAskSize !== undefined
    && record.noBestBidSize !== null
    && record.noBestBidSize !== undefined
    && record.noBestAskSize !== null
    && record.noBestAskSize !== undefined
  );
}

function isNonZeroSpread(record: ParsedTopOfBookRecord): boolean {
  const spreads = [record.yesSpreadCents, record.noSpreadCents].filter(
    (value): value is number => value !== null && value !== undefined,
  );
  if (spreads.length === 0) {
    const yesBid = record.yesBestBidCents;
    const yesAsk = record.yesBestAskCents;
    if (yesBid !== null && yesBid !== undefined && yesAsk !== null && yesAsk !== undefined) {
      return yesAsk > yesBid;
    }

    return false;
  }

  return spreads.some((spread) => spread > 0);
}

function runDurationMinutes(run: LoadedForwardCaptureRun): number {
  const configuredSeconds = run.health.config?.durationSeconds ?? 0;
  const timestamps = run.topOfBookRecords
    .map((record) => parseIsoTimestampMs(record.receivedAtLocal))
    .filter((value): value is number => value !== null);

  if (timestamps.length >= 2) {
    const observedMinutes = (Math.max(...timestamps) - Math.min(...timestamps)) / 60_000;
    return Math.max(configuredSeconds / 60, observedMinutes);
  }

  return configuredSeconds / 60;
}

function summarizeRun(run: LoadedForwardCaptureRun): ForwardCaptureRunTableEntry {
  const validRecords = run.topOfBookRecords.filter(
    (record) => record.bookState === "valid",
  ).length;
  const validBookShare = safeShare(validRecords, run.topOfBookRecords.length);

  return {
    runId: run.runId,
    sourceRoot: run.sourceRoot,
    generatedAt: run.health.generatedAt ?? null,
    durationMinutes: runDurationMinutes(run),
    marketCount: new Set(run.topOfBookRecords.map((record) => record.marketTicker)).size
      || run.health.marketDiscovery?.selectedMarketTickers?.length
      || 0,
    topOfBookRecordCount: run.topOfBookRecords.length,
    btcSpotRecordCount: run.btcSpotRecords.length,
    rawMessageCount: run.rawMessageCount,
    validBookShare,
    sequenceGapCount: run.health.orderbook?.sequenceGapCount ?? 0,
    reconnectCount: run.health.orderbook?.reconnectCount ?? 0,
    verdict: run.health.verdict ?? null,
    successful: isSuccessfulRun(run.health.verdict),
  };
}

export type ForwardCaptureRunMetrics = {
  runs: LoadedForwardCaptureRun[];
  runTable: ForwardCaptureRunTableEntry[];
  allTopOfBookRecords: ParsedTopOfBookRecord[];
  allBtcSpotRecords: ParsedBtcSpotRecord[];
  allGapsMs: number[];
  calendarDays: Set<string>;
};

/** Summarizes loaded runs into metrics used for aggregation and readiness gates. */
export function summarizeForwardCaptureRuns(
  runs: LoadedForwardCaptureRun[],
): ForwardCaptureRunMetrics {
  const allTopOfBookRecords = runs.flatMap((run) => run.topOfBookRecords);
  const allBtcSpotRecords = runs.flatMap((run) => run.btcSpotRecords);
  const allGapsMs = runs.flatMap((run) =>
    computeTopOfBookGapsMs(run.topOfBookRecords.map((record) => record.receivedAtLocal)),
  );

  const calendarDays = new Set<string>();
  for (const run of runs) {
    const day = utcDateKey(run.health.generatedAt);
    if (day) {
      calendarDays.add(day);
    }

    for (const record of run.topOfBookRecords) {
      const recordDay = utcDateKey(record.receivedAtLocal);
      if (recordDay) {
        calendarDays.add(recordDay);
      }
    }
  }

  return {
    runs,
    runTable: runs.map(summarizeRun),
    allTopOfBookRecords,
    allBtcSpotRecords,
    allGapsMs,
    calendarDays,
  };
}

export function buildRunBreakdownMetrics(
  runs: LoadedForwardCaptureRun[],
): import("./forwardCaptureReadinessTypes").ForwardCaptureBreakdownEntry[] {
  return runs.map((run) => {
    const metrics = summarizeForwardCaptureRuns([run]);
    const validRecords = metrics.allTopOfBookRecords.filter(
      (record) => record.bookState === "valid",
    ).length;
    const nonZeroSpreadRecords = metrics.allTopOfBookRecords.filter(isNonZeroSpread).length;
    const zeroSpreadRecords = metrics.allTopOfBookRecords.length - nonZeroSpreadRecords;

    return {
      key: run.runId,
      runCount: 1,
      successfulRunCount: isSuccessfulRun(run.health.verdict) ? 1 : 0,
      totalDurationMinutes: runDurationMinutes(run),
      researchReadyDurationMinutes: isSuccessfulRun(run.health.verdict)
        ? runDurationMinutes(run)
        : 0,
      marketCount: new Set(metrics.allTopOfBookRecords.map((r) => r.marketTicker)).size,
      eventCount: new Set(
        metrics.allTopOfBookRecords
          .map((r) => r.eventTicker)
          .filter((value): value is string => Boolean(value)),
      ).size,
      topOfBookRecordCount: metrics.allTopOfBookRecords.length,
      btcSpotRecordCount: metrics.allBtcSpotRecords.length,
      rawMessageCount: run.rawMessageCount,
      validBookShare: safeShare(validRecords, metrics.allTopOfBookRecords.length),
      sequenceGapCount: run.health.orderbook?.sequenceGapCount ?? 0,
      reconnectCount: run.health.orderbook?.reconnectCount ?? 0,
      medianTopOfBookGapMs: null,
      p90TopOfBookGapMs: null,
      btcSpotCoverageShare: safeShare(
        metrics.allBtcSpotRecords.length,
        Math.max(metrics.allTopOfBookRecords.length, 1),
      ),
      nonZeroSpreadShare: safeShare(
        nonZeroSpreadRecords,
        metrics.allTopOfBookRecords.length,
      ),
      zeroSpreadShare: safeShare(zeroSpreadRecords, metrics.allTopOfBookRecords.length),
      daysCovered: metrics.calendarDays.size,
      hoursCovered: runDurationMinutes(run) / 60,
    };
  });
}

export function groupRunsByKey(
  runs: LoadedForwardCaptureRun[],
  keySelector: (record: ParsedTopOfBookRecord) => string | null,
): Map<string, LoadedForwardCaptureRun[]> {
  const grouped = new Map<string, LoadedForwardCaptureRun[]>();

  for (const run of runs) {
    const keys = new Set(
      run.topOfBookRecords
        .map(keySelector)
        .filter((value): value is string => Boolean(value)),
    );

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
  hasDepthFields,
  isNonZeroSpread,
  isSuccessfulRun,
  runDurationMinutes,
};
