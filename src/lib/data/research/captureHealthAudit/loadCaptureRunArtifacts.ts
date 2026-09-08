import { join } from "node:path";

import { collectJsonlRecords, countJsonlLines } from "@/lib/data/research/jsonl";

import type {
  CaptureArtifactPaths,
  CaptureHealthAuditIo,
  ParsedBtcSpotRecord,
  ParsedMarketMetadataRecord,
  ParsedTopOfBookRecord,
} from "./captureHealthAuditTypes";
import { CaptureHealthAuditError, CaptureHealthAuditErrorCode } from "./captureHealthAuditTypes";
import {
  parseBtcSpotLine,
  parseMarketMetadataLine,
} from "./parseCaptureHealthRecords";
import {
  streamCaptureTopOfBook,
  type StreamCaptureTopOfBookProgress,
} from "./streamCaptureTopOfBook";

export type LoadedCaptureHealthJson = {
  runId?: string;
  config?: {
    durationSeconds?: number;
    dryRun?: boolean;
    captureBtcSpot?: boolean;
  };
  btcSpot?: {
    status?: string;
  };
  orderbook?: {
    sequenceGapCount?: number;
    sequenceGapEpisodeCount?: number;
    deltasQuarantinedDuringResync?: number;
    outOfOrderCount?: number;
    reconnectCount?: number;
  };
  connection?: {
    reconnectCount?: number;
  };
  capture?: {
    messagesReceived?: number;
    rawMessageCount?: number;
  };
};

export type LoadedCaptureRunArtifacts = {
  artifacts: CaptureArtifactPaths;
  rawMessageCount: number;
  rawInvalidLineCount: number;
  topOfBookCount: number;
  /**
   * Compatibility materialization for non-audit consumers (e.g. reconciliation).
   * Canonical long-run audits must use loadCaptureRunSideArtifacts + streaming
   * and must not retain this array.
   */
  topOfBookRecords: ParsedTopOfBookRecord[];
  topOfBookInvalidLineCount: number;
  btcSpotRecords: ParsedBtcSpotRecord[];
  btcSpotInvalidLineCount: number;
  marketMetadataRecords: ParsedMarketMetadataRecord[];
  captureHealth: LoadedCaptureHealthJson | null;
  loadWarnings: string[];
};

function firstExistingPath(
  io: CaptureHealthAuditIo,
  captureRunDir: string,
  candidates: readonly string[],
): string | null {
  for (const candidate of candidates) {
    const path = join(captureRunDir, candidate);
    if (io.fileExists(path)) {
      return path;
    }
  }

  return null;
}

function resolveHealthRawMessageCount(captureHealth: LoadedCaptureHealthJson | null): number | null {
  const fromHealth =
    captureHealth?.capture?.messagesReceived
    ?? captureHealth?.capture?.rawMessageCount
    ?? null;
  if (fromHealth !== null && Number.isFinite(fromHealth)) {
    return fromHealth;
  }

  return null;
}

/**
 * Loads side artifacts (native health, raw-count, BTC spot, metadata) without
 * materializing top-of-book records. BTC is available before TOB streaming so
 * join distances can be computed in one pass.
 */
export async function loadCaptureRunSideArtifacts(input: {
  captureRunDir: string;
  io: CaptureHealthAuditIo;
}): Promise<Omit<LoadedCaptureRunArtifacts, "topOfBookCount" | "topOfBookInvalidLineCount" | "topOfBookRecords"> & {
  topOfBookCount: 0;
  topOfBookInvalidLineCount: 0;
  topOfBookRecords: [];
}> {
  const captureRunDir = input.captureRunDir.replaceAll("\\", "/");
  if (!input.io.fileExists(captureRunDir) || !input.io.isDirectory(captureRunDir)) {
    throw new CaptureHealthAuditError(
      `Capture run directory not found: ${captureRunDir}`,
      CaptureHealthAuditErrorCode.MISSING_CAPTURE_DIR,
    );
  }

  const artifacts: CaptureArtifactPaths = {
    captureRunDir,
    rawMessagesPath: firstExistingPath(input.io, captureRunDir, [
      "raw-kalshi-ws.jsonl",
      "raw-messages.jsonl",
    ]),
    topOfBookPath: firstExistingPath(input.io, captureRunDir, ["top-of-book.jsonl"]),
    btcSpotPath: firstExistingPath(input.io, captureRunDir, ["btc-spot.jsonl"]),
    marketMetadataPath: firstExistingPath(input.io, captureRunDir, ["market-metadata.jsonl"]),
    captureHealthPath: firstExistingPath(input.io, captureRunDir, ["capture-health.json"]),
  };

  const loadWarnings: string[] = [];
  let rawMessageCount = 0;
  let rawInvalidLineCount = 0;
  let btcSpotRecords: ParsedBtcSpotRecord[] = [];
  let btcSpotInvalidLineCount = 0;
  let marketMetadataRecords: ParsedMarketMetadataRecord[] = [];
  let captureHealth: LoadedCaptureHealthJson | null = null;

  if (artifacts.captureHealthPath) {
    try {
      captureHealth = JSON.parse(input.io.readFile(artifacts.captureHealthPath)) as LoadedCaptureHealthJson;
    } catch {
      loadWarnings.push("capture-health.json could not be parsed.");
    }
  }

  if (artifacts.rawMessagesPath) {
    const healthRawCount = resolveHealthRawMessageCount(captureHealth);
    if (healthRawCount !== null) {
      rawMessageCount = healthRawCount;
    } else {
      const rawSummary = await countJsonlLines({
        path: artifacts.rawMessagesPath,
        io: input.io,
        validateJson: true,
      });
      rawInvalidLineCount = rawSummary.invalidLineCount;
      rawMessageCount = rawSummary.recordsHandled;
      if (rawSummary.truncated) {
        loadWarnings.push("Raw message stream truncated during count (unexpected).");
      }
    }
  }

  if (artifacts.btcSpotPath) {
    const parsed = await collectJsonlRecords({
      path: artifacts.btcSpotPath,
      io: input.io,
      parseLine: (line) => parseBtcSpotLine(line),
    });
    btcSpotRecords = parsed.records;
    btcSpotInvalidLineCount = parsed.summary.invalidLineCount;
  }

  if (artifacts.marketMetadataPath) {
    const parsed = await collectJsonlRecords({
      path: artifacts.marketMetadataPath,
      io: input.io,
      parseLine: (line) => parseMarketMetadataLine(line),
    });
    marketMetadataRecords = parsed.records;
  }

  if (!artifacts.topOfBookPath) {
    loadWarnings.push("top-of-book.jsonl is missing.");
  }
  if (rawInvalidLineCount > 0) {
    loadWarnings.push(`${rawInvalidLineCount} invalid raw message JSONL line(s).`);
  }
  if (btcSpotInvalidLineCount > 0) {
    loadWarnings.push(`${btcSpotInvalidLineCount} invalid BTC spot JSONL line(s).`);
  }

  return {
    artifacts,
    rawMessageCount,
    rawInvalidLineCount,
    topOfBookCount: 0,
    topOfBookInvalidLineCount: 0,
    topOfBookRecords: [],
    btcSpotRecords,
    btcSpotInvalidLineCount,
    marketMetadataRecords,
    captureHealth,
    loadWarnings,
  };
}

/** Resolves capture artifact paths and streams JSONL inputs from a run directory. */
export async function loadCaptureRunArtifacts(input: {
  captureRunDir: string;
  io: CaptureHealthAuditIo;
  onTopOfBookRecord?: (record: ParsedTopOfBookRecord) => void;
  onTopOfBookProgress?: (progress: StreamCaptureTopOfBookProgress) => void;
  /**
   * Default true so existing non-audit callers keep receiving records.
   * Formal capture-health audits must pass false / use side-artifact loading.
   */
  retainTopOfBookRecords?: boolean;
}): Promise<LoadedCaptureRunArtifacts> {
  const loaded = await loadCaptureRunSideArtifacts(input);
  const retainTopOfBookRecords = input.retainTopOfBookRecords !== false;
  const topOfBookRecords: ParsedTopOfBookRecord[] = [];
  let topOfBookCount = 0;
  let topOfBookInvalidLineCount = 0;

  if (loaded.artifacts.topOfBookPath) {
    const streamed = await streamCaptureTopOfBook({
      path: loaded.artifacts.topOfBookPath,
      io: input.io,
      onRecord: (record) => {
        if (retainTopOfBookRecords) {
          topOfBookRecords.push(record);
        }
        input.onTopOfBookRecord?.(record);
      },
      onProgress: input.onTopOfBookProgress,
    });
    topOfBookCount = streamed.topOfBookCount;
    topOfBookInvalidLineCount = streamed.invalidLineCount;
    if (topOfBookInvalidLineCount > 0) {
      loaded.loadWarnings.push(`${topOfBookInvalidLineCount} invalid top-of-book JSONL line(s).`);
    }
  }

  return {
    ...loaded,
    topOfBookCount,
    topOfBookInvalidLineCount,
    topOfBookRecords,
  };
}
