import { z } from "zod";

import { resolveCaptureRunDirectories } from "../downstreamAnalysisScope/discoverCaptureRunDirectories";
import {
  validateInputArtifacts,
  type ArtifactValidationIo,
} from "../downstreamAnalysisScope/validateInputArtifacts";
import { classifyBidOnlyParitySnapshot } from "../staticParityScan/classifyBidOnlyParitySnapshot";
import type {
  BidOnlyCandidateLifecycleConfig,
  BidOnlyCandidateLifecycleIo,
  BidOnlyClassifiedRecord,
} from "./bidOnlyCandidateLifecycleTypes";
import {
  classificationFamily,
  frictionFromLifecycleConfig,
  isBidOnlyCandidateClassification,
  joinPath,
  parseIsoTimestampMs,
} from "./bidOnlyCandidateLifecycleUtils";

const topOfBookRecordSchema = z
  .object({
    runId: z.string().optional(),
    marketTicker: z.string(),
    eventTicker: z.string().nullable().optional(),
    receivedAtLocal: z.string(),
    bookState: z.string(),
    yesBestBidCents: z.number().nullable().optional(),
    noBestBidCents: z.number().nullable().optional(),
    yesBestBidSize: z.number().nullable().optional(),
    noBestBidSize: z.number().nullable().optional(),
  })
  .passthrough();

const captureHealthSchema = z
  .object({
    runId: z.string(),
  })
  .passthrough();

const btcSpotRecordSchema = z
  .object({
    receivedAtLocal: z.string(),
    exchangeTimestampMs: z.number().nullable().optional(),
    priceUsd: z.number(),
  })
  .passthrough();

const marketMetadataSchema = z
  .object({
    marketTicker: z.string(),
    closeTime: z.string().nullable().optional(),
  })
  .passthrough();

export type LoadedBtcSpotPoint = {
  timestampMs: number;
  priceUsd: number;
};

export type LoadedMarketMetadata = {
  marketTicker: string;
  closeTimeMs: number | null;
};

export type LoadedBidOnlyRunInput = {
  runId: string;
  runDir: string;
  records: BidOnlyClassifiedRecord[];
  btcSpots: LoadedBtcSpotPoint[];
  marketMetadata: Map<string, LoadedMarketMetadata>;
  malformedLineCount: number;
  warnings: string[];
};

export type LoadedBidOnlyParityInputs = {
  runs: LoadedBidOnlyRunInput[];
  warnings: string[];
  scopeWarnings: string[];
  dataQualityWarnings: string[];
  artifactValidation: ReturnType<typeof validateInputArtifacts> | null;
};

function loadBtcSpots(io: BidOnlyCandidateLifecycleIo, runDir: string): LoadedBtcSpotPoint[] {
  const path = joinPath(runDir, "btc-spot.jsonl");
  if (!io.fileExists(path)) {
    return [];
  }

  const points: LoadedBtcSpotPoint[] = [];
  for (const line of io.readFile(path).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    try {
      const parsed = btcSpotRecordSchema.parse(JSON.parse(trimmed));
      const timestampMs =
        parsed.exchangeTimestampMs ?? parseIsoTimestampMs(parsed.receivedAtLocal);
      if (timestampMs === null) {
        continue;
      }

      points.push({ timestampMs, priceUsd: parsed.priceUsd });
    } catch {
      // skip malformed btc lines
    }
  }

  return points.sort((left, right) => left.timestampMs - right.timestampMs);
}

function loadMarketMetadata(
  io: BidOnlyCandidateLifecycleIo,
  runDir: string,
): Map<string, LoadedMarketMetadata> {
  const path = joinPath(runDir, "market-metadata.jsonl");
  const metadata = new Map<string, LoadedMarketMetadata>();
  if (!io.fileExists(path)) {
    return metadata;
  }

  for (const line of io.readFile(path).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    try {
      const parsed = marketMetadataSchema.parse(JSON.parse(trimmed));
      metadata.set(parsed.marketTicker, {
        marketTicker: parsed.marketTicker,
        closeTimeMs: parsed.closeTime
          ? parseIsoTimestampMs(parsed.closeTime)
          : null,
      });
    } catch {
      // skip malformed metadata
    }
  }

  return metadata;
}

function loadRunRecords(
  io: BidOnlyCandidateLifecycleIo,
  runDir: string,
  runId: string,
  config: BidOnlyCandidateLifecycleConfig,
): Pick<LoadedBidOnlyRunInput, "records" | "malformedLineCount" | "warnings"> {
  const topOfBookPath = joinPath(runDir, "top-of-book.jsonl");
  const warnings: string[] = [];
  const records: BidOnlyClassifiedRecord[] = [];
  let malformedLineCount = 0;

  if (!io.fileExists(topOfBookPath)) {
    warnings.push("top-of-book.jsonl missing");
    return { records, malformedLineCount, warnings };
  }

  const friction = frictionFromLifecycleConfig(config);

  for (const line of io.readFile(topOfBookPath).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    try {
      const record = topOfBookRecordSchema.parse(JSON.parse(trimmed));
      const receivedAtMs = parseIsoTimestampMs(record.receivedAtLocal);
      if (receivedAtMs === null) {
        malformedLineCount += 1;
        continue;
      }

      const diagnostics = classifyBidOnlyParitySnapshot(
        {
          yesBidCents: record.yesBestBidCents ?? null,
          noBidCents: record.noBestBidCents ?? null,
          yesBestBidSize: record.yesBestBidSize ?? null,
          noBestBidSize: record.noBestBidSize ?? null,
          bookState: record.bookState,
        },
        friction,
      );

      records.push({
        runId,
        marketTicker: record.marketTicker,
        eventTicker: record.eventTicker ?? null,
        receivedAtLocal: record.receivedAtLocal,
        receivedAtMs,
        classification: diagnostics.classification,
        classificationFamily: classificationFamily(diagnostics.classification),
        bidSumCents: diagnostics.bidSumCents,
        bidOnlyEdgeCents: diagnostics.bidOnlyEdgeCents,
        estimatedNetEdgeCents: diagnostics.estimatedNetEdgeCents,
        minBidSizeContracts: diagnostics.minBidSizeContracts,
        requiresExecutableConfirmation: diagnostics.requiresExecutableConfirmation,
        reason: diagnostics.reason,
      });
    } catch {
      malformedLineCount += 1;
    }
  }

  if (malformedLineCount > 0) {
    warnings.push(`${malformedLineCount} malformed top-of-book JSONL line(s) skipped`);
  }

  records.sort((left, right) => left.receivedAtMs - right.receivedAtMs);
  return { records, malformedLineCount, warnings };
}

/** Loads forward capture inputs and classifies top-of-book records for episode building. */
export function loadBidOnlyParityInputs(input: {
  config: BidOnlyCandidateLifecycleConfig;
  io: BidOnlyCandidateLifecycleIo;
  evaluatedAt?: string;
}): LoadedBidOnlyParityInputs {
  const warnings: string[] = [];
  const scopeWarnings: string[] = [];
  const dataQualityWarnings: string[] = [];
  const runs: LoadedBidOnlyRunInput[] = [];
  const evaluatedAt = input.evaluatedAt ?? new Date().toISOString();
  const selection = {
    analysisScope: input.config.captureRunDir ? "selected-run" as const : "aggregate" as const,
    forwardQuotesDir: input.config.forwardQuotesDir,
    captureRunDir: input.config.captureRunDir,
    selectedRunId: input.config.captureRunDir
      ? input.config.captureRunDir.split("/").pop() ?? null
      : null,
  };

  let artifactValidation: ReturnType<typeof validateInputArtifacts> | null = null;
  if (
    selection.analysisScope === "selected-run"
    && input.config.staticParityScanPath
  ) {
    const validationIo: ArtifactValidationIo = {
      readFile: input.io.readFile,
      fileExists: input.io.fileExists,
    };
    artifactValidation = validateInputArtifacts({
      io: validationIo,
      selection,
      artifactPaths: [input.config.staticParityScanPath],
      evaluatedAt,
      requireIdentityInSelectedRun: true,
    });

    if (artifactValidation.mismatchedArtifacts.length > 0) {
      scopeWarnings.push(
        ...artifactValidation.mismatchedArtifacts.map(
          (path) => `Scope mismatch: static parity artifact ${path} does not match selected run.`,
        ),
      );
    }

    if (artifactValidation.malformedArtifacts.length > 0) {
      scopeWarnings.push(
        ...artifactValidation.malformedArtifacts.map(
          (path) => `Scope mismatch: malformed static parity artifact ${path}.`,
        ),
      );
    }

    if (artifactValidation.missingArtifacts.length > 0) {
      scopeWarnings.push(
        ...artifactValidation.missingArtifacts.map(
          (path) => `Scope mismatch: missing static parity artifact ${path}.`,
        ),
      );
    }
  }

  const runDirs = resolveCaptureRunDirectories({
    io: input.io,
    forwardQuotesDir: input.config.forwardQuotesDir,
    captureRunDir: input.config.captureRunDir,
  });

  for (const runDir of runDirs) {
    const healthPath = joinPath(runDir, "capture-health.json");
    let runId = runDir.split("/").pop() ?? runDir;

    try {
      runId = captureHealthSchema.parse(JSON.parse(input.io.readFile(healthPath))).runId;
    } catch {
      warnings.push(`${runId}: invalid capture-health.json`);
      continue;
    }

    const loadedRecords = loadRunRecords(input.io, runDir, runId, input.config);
    runs.push({
      runId,
      runDir,
      records: loadedRecords.records,
      btcSpots: loadBtcSpots(input.io, runDir),
      marketMetadata: loadMarketMetadata(input.io, runDir),
      malformedLineCount: loadedRecords.malformedLineCount,
      warnings: loadedRecords.warnings,
    });
    warnings.push(...loadedRecords.warnings.map((warning) => `${runId}: ${warning}`));
    dataQualityWarnings.push(
      ...loadedRecords.warnings.map((warning) => `${runId}: ${warning}`),
    );
  }

  if (runs.length === 0) {
    if (selection.analysisScope === "selected-run") {
      scopeWarnings.push(
        `No capture run found at ${input.config.captureRunDir ?? "selected path"}.`,
      );
    } else {
      warnings.push(`No capture runs found under ${input.config.forwardQuotesDir}`);
    }
  }

  return { runs, warnings, scopeWarnings, dataQualityWarnings, artifactValidation };
}

export function countBidOnlyCandidateRecords(records: readonly BidOnlyClassifiedRecord[]): number {
  return records.filter((record) => isBidOnlyCandidateClassification(record.classification))
    .length;
}
