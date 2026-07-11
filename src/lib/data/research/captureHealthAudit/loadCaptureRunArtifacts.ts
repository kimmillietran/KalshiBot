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
  hourBucketFromIso,
  parseIsoTimestampMs,
} from "./captureHealthAuditUtils";

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

function parseTopOfBookLine(line: string, lineNumber: number): ParsedTopOfBookRecord | null {
  const parsed = JSON.parse(line) as Record<string, unknown>;
  const marketTicker = typeof parsed.marketTicker === "string" ? parsed.marketTicker : null;
  const receivedAtLocal = typeof parsed.receivedAtLocal === "string" ? parsed.receivedAtLocal : null;

  if (!marketTicker || !receivedAtLocal) {
    return null;
  }

  const receivedAtMs = parseIsoTimestampMs(receivedAtLocal);
  if (receivedAtMs === null) {
    return null;
  }

  return {
    lineNumber,
    runId: typeof parsed.runId === "string" ? parsed.runId : null,
    marketTicker,
    eventTicker: typeof parsed.eventTicker === "string" ? parsed.eventTicker : null,
    seriesTicker: typeof parsed.seriesTicker === "string" ? parsed.seriesTicker : null,
    receivedAtLocal,
    receivedAtMs,
    exchangeTimestampMs:
      typeof parsed.exchangeTimestampMs === "number" ? parsed.exchangeTimestampMs : null,
    sequence: typeof parsed.sequence === "number" ? parsed.sequence : null,
    bookState: typeof parsed.bookState === "string" ? parsed.bookState : "unknown",
    yesBestBidCents:
      typeof parsed.yesBestBidCents === "number" ? parsed.yesBestBidCents : null,
    yesBestAskCents:
      typeof parsed.yesBestAskCents === "number" ? parsed.yesBestAskCents : null,
    yesBestBidSize:
      typeof parsed.yesBestBidSize === "number" ? parsed.yesBestBidSize : null,
    yesBestAskSize:
      typeof parsed.yesBestAskSize === "number" ? parsed.yesBestAskSize : null,
    noBestBidCents:
      typeof parsed.noBestBidCents === "number" ? parsed.noBestBidCents : null,
    noBestAskCents:
      typeof parsed.noBestAskCents === "number" ? parsed.noBestAskCents : null,
    noBestBidSize:
      typeof parsed.noBestBidSize === "number" ? parsed.noBestBidSize : null,
    noBestAskSize:
      typeof parsed.noBestAskSize === "number" ? parsed.noBestAskSize : null,
    yesSpreadCents: typeof parsed.yesSpreadCents === "number" ? parsed.yesSpreadCents : null,
    noSpreadCents: typeof parsed.noSpreadCents === "number" ? parsed.noSpreadCents : null,
    isEconomicallyValid:
      typeof parsed.isEconomicallyValid === "boolean" ? parsed.isEconomicallyValid : undefined,
    isParityUsable:
      typeof parsed.isParityUsable === "boolean" ? parsed.isParityUsable : undefined,
    economicBookState:
      typeof parsed.economicBookState === "string" ? parsed.economicBookState : undefined,
    hourBucket: hourBucketFromIso(receivedAtLocal),
  };
}

function parseBtcSpotLine(line: string): ParsedBtcSpotRecord | null {
  const parsed = JSON.parse(line) as Record<string, unknown>;
  const receivedAtLocal = typeof parsed.receivedAtLocal === "string" ? parsed.receivedAtLocal : null;
  const priceUsd = typeof parsed.priceUsd === "number" ? parsed.priceUsd : null;

  if (!receivedAtLocal || priceUsd === null) {
    return null;
  }

  const receivedAtMs = parseIsoTimestampMs(receivedAtLocal);
  if (receivedAtMs === null) {
    return null;
  }

  return {
    receivedAtLocal,
    receivedAtMs,
    exchangeTimestampMs:
      typeof parsed.exchangeTimestampMs === "number" ? parsed.exchangeTimestampMs : null,
    priceUsd,
  };
}

function parseMarketMetadataLine(line: string): ParsedMarketMetadataRecord | null {
  const parsed = JSON.parse(line) as Record<string, unknown>;
  const marketTicker = typeof parsed.marketTicker === "string" ? parsed.marketTicker : null;

  if (!marketTicker) {
    return null;
  }

  return {
    marketTicker,
    eventTicker: typeof parsed.eventTicker === "string" ? parsed.eventTicker : null,
  };
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

/** Resolves capture artifact paths and streams JSONL inputs from a run directory. */
export async function loadCaptureRunArtifacts(input: {
  captureRunDir: string;
  io: CaptureHealthAuditIo;
}): Promise<LoadedCaptureRunArtifacts> {
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
  let topOfBookRecords: ParsedTopOfBookRecord[] = [];
  let topOfBookInvalidLineCount = 0;
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

  if (artifacts.topOfBookPath) {
    const parsed = await collectJsonlRecords({
      path: artifacts.topOfBookPath,
      io: input.io,
      parseLine: parseTopOfBookLine,
    });
    topOfBookRecords = parsed.records;
    topOfBookInvalidLineCount = parsed.summary.invalidLineCount;
  } else {
    loadWarnings.push("top-of-book.jsonl is missing.");
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

  if (topOfBookInvalidLineCount > 0) {
    loadWarnings.push(`${topOfBookInvalidLineCount} invalid top-of-book JSONL line(s).`);
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
    topOfBookRecords,
    topOfBookInvalidLineCount,
    btcSpotRecords,
    btcSpotInvalidLineCount,
    marketMetadataRecords,
    captureHealth,
    loadWarnings,
  };
}
