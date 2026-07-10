import { z } from "zod";

import { classifyParitySnapshot } from "./classifyParitySnapshot";
import {
  median,
  percentile,
} from "../forwardCaptureReadiness/forwardCaptureReadinessMath";
import type {
  StaticParityCandidateSample,
  StaticParityFrictionConfig,
  StaticParityScanIo,
  StaticParityScanMetrics,
} from "./staticParityScanTypes";

const captureHealthSchema = z
  .object({
    runId: z.string(),
    startedAt: z.string().optional(),
    endedAt: z.string().optional(),
    verdict: z.string().optional(),
    capture: z
      .object({
        topOfBookRecordCount: z.number().optional(),
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
    isParityUsable: z.boolean().optional(),
    isEconomicallyValid: z.boolean().optional(),
    economicBookState: z.string().optional(),
  })
  .passthrough();

const MAX_CANDIDATE_SAMPLES = 25;

export type ScannedParityRun = {
  runId: string;
  scanned: boolean;
  skipReason: string | null;
  topOfBookRecordCount: number;
  grossCandidateCount: number;
  bufferAdjustedCandidateCount: number;
};

export type ScanForwardCaptureParityResult = {
  metrics: StaticParityScanMetrics;
  candidateSamples: StaticParityCandidateSample[];
  runs: ScannedParityRun[];
};

function joinPath(root: string, child: string): string {
  return `${root.replace(/[\\/]+$/, "")}/${child}`;
}

function discoverRunDirectories(io: StaticParityScanIo, rootPath: string): string[] {
  if (!io.fileExists(rootPath) || !io.isDirectory(rootPath)) {
    return [];
  }

  return io
    .readdir(rootPath)
    .map((entry) => joinPath(rootPath, entry))
    .filter((entryPath) => io.isDirectory(entryPath))
    .filter((entryPath) => io.fileExists(joinPath(entryPath, "capture-health.json")));
}

function createEmptyMetrics(): StaticParityScanMetrics {
  return {
    runCountScanned: 0,
    runsSkipped: 0,
    skipReasons: {},
    topOfBookRecordsScanned: 0,
    validParitySnapshots: 0,
    invalidSnapshots: 0,
    insufficientDepthSnapshots: 0,
    grossParityCandidateCount: 0,
    bufferAdjustedCandidateCount: 0,
    maxGrossEdgeCents: null,
    medianGrossEdgeCents: null,
    p95GrossEdgeCents: null,
    totalCandidateDurationMs: 0,
    longestCandidateDurationMs: 0,
    marketsInvolved: [],
    eventTickersInvolved: [],
    timeRangeStart: null,
    timeRangeEnd: null,
    malformedLineCount: 0,
    warnings: [],
  };
}

function updateTimeRange(
  currentStart: string | null,
  currentEnd: string | null,
  timestamp: string,
): { start: string | null; end: string | null } {
  if (!currentStart || timestamp < currentStart) {
    currentStart = timestamp;
  }
  if (!currentEnd || timestamp > currentEnd) {
    currentEnd = timestamp;
  }

  return { start: currentStart, end: currentEnd };
}

function maybePushSample(
  samples: StaticParityCandidateSample[],
  sample: StaticParityCandidateSample,
): void {
  if (
    sample.classification === "gross-parity-candidate"
    || sample.classification === "buffer-adjusted-candidate"
    || sample.classification === "parity-watch"
  ) {
    if (samples.length < MAX_CANDIDATE_SAMPLES) {
      samples.push(sample);
    }
  }
}

function scanRunDirectory(input: {
  io: StaticParityScanIo;
  runDir: string;
  friction: StaticParityFrictionConfig;
  metrics: StaticParityScanMetrics;
  candidateSamples: StaticParityCandidateSample[];
  grossEdges: number[];
  markets: Set<string>;
  events: Set<string>;
}): ScannedParityRun {
  const healthPath = joinPath(input.runDir, "capture-health.json");
  const topOfBookPath = joinPath(input.runDir, "top-of-book.jsonl");

  if (!input.io.fileExists(healthPath)) {
    input.metrics.runsSkipped += 1;
    input.metrics.skipReasons.missing_health = (input.metrics.skipReasons.missing_health ?? 0) + 1;
    return {
      runId: input.runDir.split("/").pop() ?? input.runDir,
      scanned: false,
      skipReason: "missing capture-health.json",
      topOfBookRecordCount: 0,
      grossCandidateCount: 0,
      bufferAdjustedCandidateCount: 0,
    };
  }

  if (!input.io.fileExists(topOfBookPath)) {
    input.metrics.runsSkipped += 1;
    input.metrics.skipReasons.missing_top_of_book = (input.metrics.skipReasons.missing_top_of_book ?? 0) + 1;
    return {
      runId: input.runDir.split("/").pop() ?? input.runDir,
      scanned: false,
      skipReason: "missing top-of-book.jsonl",
      topOfBookRecordCount: 0,
      grossCandidateCount: 0,
      bufferAdjustedCandidateCount: 0,
    };
  }

  let health: z.infer<typeof captureHealthSchema>;
  try {
    health = captureHealthSchema.parse(JSON.parse(input.io.readFile(healthPath)));
  } catch {
    input.metrics.runsSkipped += 1;
    input.metrics.skipReasons.invalid_health = (input.metrics.skipReasons.invalid_health ?? 0) + 1;
    return {
      runId: input.runDir.split("/").pop() ?? input.runDir,
      scanned: false,
      skipReason: "invalid capture-health.json",
      topOfBookRecordCount: 0,
      grossCandidateCount: 0,
      bufferAdjustedCandidateCount: 0,
    };
  }

  input.metrics.runCountScanned += 1;

  let grossCandidateCount = 0;
  let bufferAdjustedCandidateCount = 0;
  let runRecordCount = 0;
  let previousCandidateTimestamp: string | null = null;
  let candidateRunStart: string | null = null;

  for (const line of input.io.readFile(topOfBookPath).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    let record: z.infer<typeof topOfBookRecordSchema>;
    try {
      const parsed = topOfBookRecordSchema.safeParse(JSON.parse(trimmed));
      if (!parsed.success) {
        input.metrics.malformedLineCount += 1;
        continue;
      }
      record = parsed.data;
    } catch {
      input.metrics.malformedLineCount += 1;
      continue;
    }

    runRecordCount += 1;
    input.metrics.topOfBookRecordsScanned += 1;
    input.markets.add(record.marketTicker);
    if (record.eventTicker) {
      input.events.add(record.eventTicker);
    }

    const timeRange = updateTimeRange(
      input.metrics.timeRangeStart,
      input.metrics.timeRangeEnd,
      record.receivedAtLocal,
    );
    input.metrics.timeRangeStart = timeRange.start;
    input.metrics.timeRangeEnd = timeRange.end;

    if (record.isParityUsable === false) {
      if (record.economicBookState === "insufficient-depth") {
        input.metrics.insufficientDepthSnapshots += 1;
      } else {
        input.metrics.invalidSnapshots += 1;
      }
      previousCandidateTimestamp = null;
      candidateRunStart = null;
      continue;
    }

    const diagnostics = classifyParitySnapshot(
      {
        yesBidCents: record.yesBestBidCents ?? null,
        yesAskCents: record.yesBestAskCents ?? null,
        noBidCents: record.noBestBidCents ?? null,
        noAskCents: record.noBestAskCents ?? null,
        yesBestBidSize: record.yesBestBidSize ?? null,
        yesBestAskSize: record.yesBestAskSize ?? null,
        noBestBidSize: record.noBestBidSize ?? null,
        noBestAskSize: record.noBestAskSize ?? null,
        bookState: record.bookState,
      },
      input.friction,
    );

    if (record.isParityUsable !== true) {
      if (diagnostics.classification === "invalid-book-state") {
        input.metrics.invalidSnapshots += 1;
        previousCandidateTimestamp = null;
        candidateRunStart = null;
        continue;
      }

      if (diagnostics.classification === "insufficient-book-depth") {
        input.metrics.insufficientDepthSnapshots += 1;
        previousCandidateTimestamp = null;
        candidateRunStart = null;
        continue;
      }
    }

    input.metrics.validParitySnapshots += 1;

    if (diagnostics.isGrossCandidate) {
      input.metrics.grossParityCandidateCount += 1;
      grossCandidateCount += 1;
      if (diagnostics.grossEdgeCents !== null) {
        input.grossEdges.push(diagnostics.grossEdgeCents);
        input.metrics.maxGrossEdgeCents =
          input.metrics.maxGrossEdgeCents === null
            ? diagnostics.grossEdgeCents
            : Math.max(input.metrics.maxGrossEdgeCents, diagnostics.grossEdgeCents);
      }
    }

    if (diagnostics.isBufferAdjustedCandidate) {
      input.metrics.bufferAdjustedCandidateCount += 1;
      bufferAdjustedCandidateCount += 1;
    }

    const isCandidateSnapshot =
      diagnostics.classification === "gross-parity-candidate"
      || diagnostics.classification === "buffer-adjusted-candidate"
      || diagnostics.classification === "parity-watch";

    if (isCandidateSnapshot) {
      if (candidateRunStart === null) {
        candidateRunStart = record.receivedAtLocal;
      }
      previousCandidateTimestamp = record.receivedAtLocal;
    } else if (candidateRunStart && previousCandidateTimestamp) {
      const durationMs =
        Date.parse(previousCandidateTimestamp) - Date.parse(candidateRunStart);
      if (Number.isFinite(durationMs) && durationMs > 0) {
        input.metrics.totalCandidateDurationMs += durationMs;
        input.metrics.longestCandidateDurationMs = Math.max(
          input.metrics.longestCandidateDurationMs,
          durationMs,
        );
      }
      candidateRunStart = null;
      previousCandidateTimestamp = null;
    }

    maybePushSample(input.candidateSamples, {
      timestamp: record.receivedAtLocal,
      runId: health.runId,
      marketTicker: record.marketTicker,
      eventTicker: record.eventTicker ?? null,
      yesBidCents: record.yesBestBidCents ?? null,
      yesAskCents: record.yesBestAskCents ?? null,
      noBidCents: record.noBestBidCents ?? null,
      noAskCents: record.noBestAskCents ?? null,
      yesAskPlusNoAskCents: diagnostics.yesAskPlusNoAskCents,
      yesBidPlusNoBidCents: diagnostics.yesBidPlusNoBidCents,
      grossEdgeCents: diagnostics.grossEdgeCents,
      estimatedNetEdgeCents: diagnostics.estimatedNetEdgeCents,
      availableSize: diagnostics.availableSize,
      classification: diagnostics.classification,
      reason: diagnostics.reason,
    });
  }

  const topOfBookRecordCount =
    health.capture?.topOfBookRecordCount ?? runRecordCount;

  return {
    runId: health.runId,
    scanned: true,
    skipReason: null,
    topOfBookRecordCount,
    grossCandidateCount,
    bufferAdjustedCandidateCount,
  };
}

export function scanForwardCaptureParity(input: {
  io: StaticParityScanIo;
  forwardQuotesDir: string;
  friction: StaticParityFrictionConfig;
}): ScanForwardCaptureParityResult {
  const metrics = createEmptyMetrics();
  const candidateSamples: StaticParityCandidateSample[] = [];
  const grossEdges: number[] = [];
  const markets = new Set<string>();
  const events = new Set<string>();
  const runs: ScannedParityRun[] = [];

  for (const runDir of discoverRunDirectories(input.io, input.forwardQuotesDir)) {
    runs.push(
      scanRunDirectory({
        io: input.io,
        runDir,
        friction: input.friction,
        metrics,
        candidateSamples,
        grossEdges,
        markets,
        events,
      }),
    );
  }

  metrics.medianGrossEdgeCents = median(grossEdges);
  metrics.p95GrossEdgeCents = percentile(grossEdges, 95);
  metrics.marketsInvolved = [...markets].sort();
  metrics.eventTickersInvolved = [...events].sort();

  return {
    metrics,
    candidateSamples,
    runs: runs.sort((left, right) => left.runId.localeCompare(right.runId)),
  };
}
