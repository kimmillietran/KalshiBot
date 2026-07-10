import { z } from "zod";

import { classifyBidOnlyParitySnapshot } from "./classifyBidOnlyParitySnapshot";
import { classifyParitySnapshot } from "./classifyParitySnapshot";
import {
  median,
  percentile,
} from "../forwardCaptureReadiness/forwardCaptureReadinessMath";
import type {
  StaticParityCandidateSample,
  StaticParityClassification,
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
  bidOnlyGrossCandidateCount: number;
  bidOnlyBufferAdjustedCandidateCount: number;
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

function createEmptyMetrics(pricingModel: StaticParityFrictionConfig["pricingModel"]): StaticParityScanMetrics {
  return {
    pricingModel,
    runCountScanned: 0,
    runsSkipped: 0,
    skipReasons: {},
    topOfBookRecordsScanned: 0,
    validParitySnapshots: 0,
    invalidSnapshots: 0,
    insufficientDepthSnapshots: 0,
    grossParityCandidateCount: 0,
    bufferAdjustedCandidateCount: 0,
    bidOnlyRecordsEvaluated: 0,
    bidOnlyNoSignalCount: 0,
    bidOnlyWatchCount: 0,
    bidOnlyGrossCandidateCount: 0,
    bidOnlyBufferAdjustedCandidateCount: 0,
    executableConfirmedCandidateCount: 0,
    maxGrossEdgeCents: null,
    medianGrossEdgeCents: null,
    p95GrossEdgeCents: null,
    maxBidOnlyEdgeCents: null,
    medianBidOnlyEdgeCents: null,
    p95BidOnlyEdgeCents: null,
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

function isCandidateClassification(classification: StaticParityClassification): boolean {
  return (
    classification === "gross-parity-candidate"
    || classification === "buffer-adjusted-candidate"
    || classification === "parity-watch"
    || classification === "bid-only-gross-candidate"
    || classification === "bid-only-buffer-adjusted-candidate"
    || classification === "bid-only-watch"
  );
}

function maybePushSample(
  samples: StaticParityCandidateSample[],
  sample: StaticParityCandidateSample,
): void {
  if (isCandidateClassification(sample.classification) && samples.length < MAX_CANDIDATE_SAMPLES) {
    samples.push(sample);
  }
}

function scanRunDirectory(input: {
  io: StaticParityScanIo;
  runDir: string;
  friction: StaticParityFrictionConfig;
  metrics: StaticParityScanMetrics;
  candidateSamples: StaticParityCandidateSample[];
  grossEdges: number[];
  bidOnlyEdges: number[];
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
      bidOnlyGrossCandidateCount: 0,
      bidOnlyBufferAdjustedCandidateCount: 0,
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
      bidOnlyGrossCandidateCount: 0,
      bidOnlyBufferAdjustedCandidateCount: 0,
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
      bidOnlyGrossCandidateCount: 0,
      bidOnlyBufferAdjustedCandidateCount: 0,
    };
  }

  input.metrics.runCountScanned += 1;

  let grossCandidateCount = 0;
  let bufferAdjustedCandidateCount = 0;
  let bidOnlyGrossCandidateCount = 0;
  let bidOnlyBufferAdjustedCandidateCount = 0;
  let runRecordCount = 0;
  let previousCandidateTimestamp: string | null = null;
  let candidateRunStart: string | null = null;
  const isBidOnly = input.friction.pricingModel === "bid-only";

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

    const snapshotInput = {
      yesBidCents: record.yesBestBidCents ?? null,
      yesAskCents: record.yesBestAskCents ?? null,
      noBidCents: record.noBestBidCents ?? null,
      noAskCents: record.noBestAskCents ?? null,
      yesBestBidSize: record.yesBestBidSize ?? null,
      yesBestAskSize: record.yesBestAskSize ?? null,
      noBestBidSize: record.noBestBidSize ?? null,
      noBestAskSize: record.noBestAskSize ?? null,
      bookState: record.bookState,
    };

    if (isBidOnly) {
      const diagnostics = classifyBidOnlyParitySnapshot(snapshotInput, input.friction);
      input.metrics.bidOnlyRecordsEvaluated += 1;

      if (diagnostics.classification === "bid-only-invalid-price") {
        input.metrics.invalidSnapshots += 1;
        previousCandidateTimestamp = null;
        candidateRunStart = null;
        continue;
      }

      if (diagnostics.classification === "bid-only-insufficient-depth") {
        input.metrics.insufficientDepthSnapshots += 1;
        previousCandidateTimestamp = null;
        candidateRunStart = null;
        continue;
      }

      input.metrics.validParitySnapshots += 1;

      if (diagnostics.classification === "bid-only-no-signal") {
        input.metrics.bidOnlyNoSignalCount += 1;
      } else if (diagnostics.classification === "bid-only-watch") {
        input.metrics.bidOnlyWatchCount += 1;
      }

      if (diagnostics.isGrossCandidate) {
        input.metrics.bidOnlyGrossCandidateCount += 1;
        input.metrics.grossParityCandidateCount += 1;
        bidOnlyGrossCandidateCount += 1;
        grossCandidateCount += 1;
        if (diagnostics.bidOnlyEdgeCents !== null) {
          input.bidOnlyEdges.push(diagnostics.bidOnlyEdgeCents);
          input.metrics.maxBidOnlyEdgeCents =
            input.metrics.maxBidOnlyEdgeCents === null
              ? diagnostics.bidOnlyEdgeCents
              : Math.max(input.metrics.maxBidOnlyEdgeCents, diagnostics.bidOnlyEdgeCents);
        }
      }

      if (diagnostics.isBufferAdjustedCandidate) {
        input.metrics.bidOnlyBufferAdjustedCandidateCount += 1;
        input.metrics.bufferAdjustedCandidateCount += 1;
        bidOnlyBufferAdjustedCandidateCount += 1;
        bufferAdjustedCandidateCount += 1;
      }

      ({ candidateRunStart, previousCandidateTimestamp } = updateCandidateTimestamps(
        diagnostics.classification,
        record.receivedAtLocal,
        candidateRunStart,
        previousCandidateTimestamp,
        input.metrics,
      ));

      maybePushSample(input.candidateSamples, {
        timestamp: record.receivedAtLocal,
        runId: health.runId,
        marketTicker: record.marketTicker,
        eventTicker: record.eventTicker ?? null,
        yesBidCents: record.yesBestBidCents ?? null,
        yesAskCents: record.yesBestAskCents ?? null,
        noBidCents: record.noBestBidCents ?? null,
        noAskCents: record.noBestAskCents ?? null,
        yesAskPlusNoAskCents: null,
        yesBidPlusNoBidCents: diagnostics.bidSumCents,
        bidSumCents: diagnostics.bidSumCents,
        bidOnlyEdgeCents: diagnostics.bidOnlyEdgeCents,
        grossEdgeCents: diagnostics.bidOnlyEdgeCents,
        estimatedNetEdgeCents: diagnostics.estimatedNetEdgeCents,
        availableSize: diagnostics.minBidSizeContracts,
        minBidSizeContracts: diagnostics.minBidSizeContracts,
        classification: diagnostics.classification,
        reason: diagnostics.reason,
        requiresExecutableConfirmation: diagnostics.requiresExecutableConfirmation,
      });
      continue;
    }

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

    const diagnostics = classifyParitySnapshot(snapshotInput, input.friction);

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

    ({ candidateRunStart, previousCandidateTimestamp } = updateCandidateTimestamps(
      diagnostics.classification,
      record.receivedAtLocal,
      candidateRunStart,
      previousCandidateTimestamp,
      input.metrics,
    ));

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
      bidSumCents: diagnostics.yesBidPlusNoBidCents,
      bidOnlyEdgeCents: null,
      grossEdgeCents: diagnostics.grossEdgeCents,
      estimatedNetEdgeCents: diagnostics.estimatedNetEdgeCents,
      availableSize: diagnostics.availableSize,
      minBidSizeContracts: null,
      classification: diagnostics.classification,
      reason: diagnostics.reason,
      requiresExecutableConfirmation: input.friction.requireExecutableConfirmation,
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
    bidOnlyGrossCandidateCount,
    bidOnlyBufferAdjustedCandidateCount,
  };
}

function updateCandidateTimestamps(
  classification: StaticParityClassification,
  receivedAtLocal: string,
  candidateRunStart: string | null,
  previousCandidateTimestamp: string | null,
  metrics: StaticParityScanMetrics,
): { candidateRunStart: string | null; previousCandidateTimestamp: string | null } {
  if (isCandidateClassification(classification)) {
    if (candidateRunStart === null) {
      candidateRunStart = receivedAtLocal;
    }
    previousCandidateTimestamp = receivedAtLocal;
    return { candidateRunStart, previousCandidateTimestamp };
  }

  if (candidateRunStart && previousCandidateTimestamp) {
    const durationMs =
      Date.parse(previousCandidateTimestamp) - Date.parse(candidateRunStart);
    if (Number.isFinite(durationMs) && durationMs > 0) {
      metrics.totalCandidateDurationMs += durationMs;
      metrics.longestCandidateDurationMs = Math.max(
        metrics.longestCandidateDurationMs,
        durationMs,
      );
    }
  }

  return { candidateRunStart: null, previousCandidateTimestamp: null };
}

export function scanForwardCaptureParity(input: {
  io: StaticParityScanIo;
  forwardQuotesDir: string;
  friction: StaticParityFrictionConfig;
}): ScanForwardCaptureParityResult {
  const metrics = createEmptyMetrics(input.friction.pricingModel);
  const candidateSamples: StaticParityCandidateSample[] = [];
  const grossEdges: number[] = [];
  const bidOnlyEdges: number[] = [];
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
        bidOnlyEdges,
        markets,
        events,
      }),
    );
  }

  metrics.medianGrossEdgeCents = median(grossEdges);
  metrics.p95GrossEdgeCents = percentile(grossEdges, 95);
  metrics.medianBidOnlyEdgeCents = median(bidOnlyEdges);
  metrics.p95BidOnlyEdgeCents = percentile(bidOnlyEdges, 95);
  metrics.marketsInvolved = [...markets].sort();
  metrics.eventTickersInvolved = [...events].sort();

  return {
    metrics,
    candidateSamples,
    runs: runs.sort((left, right) => left.runId.localeCompare(right.runId)),
  };
}
