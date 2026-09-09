import { posix } from "node:path";

import { resolveSeriesTicker } from "@/lib/data/audit/settlementTrace/settlementTraceUtils";

import { classifyInvalidMarketReason, isRealCaptureMarketTicker } from "./isRealCaptureMarketTicker";
import type {
  CapturedMarketInventoryEntry,
  ForwardSettlementCoverageIo,
} from "./forwardSettlementCoverageTypes";
import { ForwardSettlementCoverageError } from "./forwardSettlementCoverageTypes";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseJsonLine(line: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(line);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function parseTimestampMs(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mergeInventoryEntry(
  map: Map<string, CapturedMarketInventoryEntry>,
  input: {
    marketTicker: string;
    observedAt: string;
    eventTicker?: string | null;
    seriesTicker?: string | null;
    marketCloseTime?: string | null;
    sourceArtifact: string;
  },
): void {
  const existing = map.get(input.marketTicker);
  const observedMs = parseTimestampMs(input.observedAt);
  const seriesTicker =
    input.seriesTicker
    ?? existing?.seriesTicker
    ?? resolveSeriesTicker(input.marketTicker);

  if (!existing) {
    map.set(input.marketTicker, {
      marketTicker: input.marketTicker,
      seriesTicker,
      firstObservedAt: input.observedAt,
      lastObservedAt: input.observedAt,
      observationCount: 1,
      marketCloseTime: input.marketCloseTime ?? null,
      expectedSettlementAvailability: "unknown",
      eventTicker: input.eventTicker ?? null,
      sourceArtifacts: [input.sourceArtifact],
    });
    return;
  }

  const firstMs = parseTimestampMs(existing.firstObservedAt);
  const lastMs = parseTimestampMs(existing.lastObservedAt);
  const firstObservedAt =
    observedMs !== null && firstMs !== null && observedMs < firstMs
      ? input.observedAt
      : existing.firstObservedAt;
  const lastObservedAt =
    observedMs !== null && lastMs !== null && observedMs > lastMs
      ? input.observedAt
      : existing.lastObservedAt;

  map.set(input.marketTicker, {
    ...existing,
    seriesTicker,
    firstObservedAt,
    lastObservedAt,
    observationCount: existing.observationCount + 1,
    marketCloseTime: input.marketCloseTime ?? existing.marketCloseTime,
    eventTicker: input.eventTicker ?? existing.eventTicker,
    sourceArtifacts: [
      ...new Set([...existing.sourceArtifacts, input.sourceArtifact]),
    ],
  });
}

function resolveObservedAt(
  record: Record<string, unknown>,
  observedAtField: string,
): string | null {
  return (
    readString(record[observedAtField])
    ?? readString(record.receivedAtLocal)
    ?? readString(record.recordedAtLocal)
    ?? readString(record.timestamp)
  );
}

/**
 * Single-pass JSONL inventory ingest. Updates compact per-ticker accumulators only;
 * does not retain raw lines or records.
 * Returns true when the line contributed a real-market inventory observation.
 */
export function ingestInventoryJsonlLine(input: {
  map: Map<string, CapturedMarketInventoryEntry>;
  excludedTickers: Array<{ marketTicker: string; reason: string }>;
  seenInvalid: Set<string>;
  line: string;
  sourceArtifact: string;
  observedAtField: string;
  includeCloseTime?: boolean;
  collectInvalidExclusions: boolean;
}): { action: "continue" | "skip"; inventoried: boolean } {
  const trimmed = input.line.trim();
  if (!trimmed) {
    return { action: "continue", inventoried: false };
  }

  const record = parseJsonLine(trimmed);
  if (!record) {
    return { action: "skip", inventoried: false };
  }

  const marketTicker = readString(record.marketTicker);
  if (!marketTicker) {
    return { action: "skip", inventoried: false };
  }

  if (!isRealCaptureMarketTicker(marketTicker)) {
    if (input.collectInvalidExclusions && !input.seenInvalid.has(marketTicker)) {
      input.seenInvalid.add(marketTicker);
      input.excludedTickers.push({
        marketTicker,
        reason: classifyInvalidMarketReason(marketTicker) ?? "excluded ticker",
      });
    }
    return { action: "continue", inventoried: false };
  }

  const observedAt = resolveObservedAt(record, input.observedAtField);
  if (!observedAt) {
    return { action: "skip", inventoried: false };
  }

  mergeInventoryEntry(input.map, {
    marketTicker,
    observedAt,
    eventTicker: readString(record.eventTicker),
    seriesTicker: readString(record.seriesTicker),
    marketCloseTime: input.includeCloseTime ? readString(record.closeTime) : null,
    sourceArtifact: input.sourceArtifact,
  });
  return { action: "continue", inventoried: true };
}

function resolveExpectedSettlementAvailability(input: {
  marketCloseTime: string | null;
  evaluatedAt: string;
}): "available" | "pending" | "unknown" {
  if (!input.marketCloseTime) {
    return "unknown";
  }

  const closeMs = Date.parse(input.marketCloseTime);
  const evaluatedMs = Date.parse(input.evaluatedAt);
  if (!Number.isFinite(closeMs) || !Number.isFinite(evaluatedMs)) {
    return "unknown";
  }

  return closeMs <= evaluatedMs ? "available" : "pending";
}

export function resolveSelectedRunId(captureRunDir: string): string {
  return posix.basename(captureRunDir.replace(/\\/g, "/"));
}

async function streamInventoryArtifact(input: {
  io: ForwardSettlementCoverageIo;
  path: string;
  map: Map<string, CapturedMarketInventoryEntry>;
  excludedTickers: Array<{ marketTicker: string; reason: string }>;
  seenInvalid: Set<string>;
  observedAtField: string;
  includeCloseTime?: boolean;
  collectInvalidExclusions: boolean;
}): Promise<number> {
  let usableRecords = 0;
  try {
    await input.io.iterateJsonl(input.path, {
      onLine: (line) => {
        const result = ingestInventoryJsonlLine({
          map: input.map,
          excludedTickers: input.excludedTickers,
          seenInvalid: input.seenInvalid,
          line,
          sourceArtifact: input.path,
          observedAtField: input.observedAtField,
          includeCloseTime: input.includeCloseTime,
          collectInvalidExclusions: input.collectInvalidExclusions,
        });
        if (result.inventoried) {
          usableRecords += 1;
        }
        return result.action;
      },
    });
  } catch (error) {
    if (error instanceof ForwardSettlementCoverageError) {
      throw error;
    }
    throw new ForwardSettlementCoverageError(
      `Failed to stream inventory JSONL ${input.path}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  return usableRecords;
}

/**
 * Extracts deduplicated real-market inventory from one selected capture run.
 * Streams top-of-book.jsonl once with memory scaling by distinct tickers.
 */
export async function extractSelectedRunMarketInventory(input: {
  io: ForwardSettlementCoverageIo;
  captureRunDir: string;
  evaluatedAt: string;
}): Promise<{
  selectedRunId: string;
  inventory: readonly CapturedMarketInventoryEntry[];
  excludedTickers: readonly { marketTicker: string; reason: string }[];
  warnings: string[];
}> {
  const captureRunDir = input.captureRunDir.replace(/\\/g, "/");
  if (!input.io.fileExists(captureRunDir) || !input.io.isDirectory(captureRunDir)) {
    throw new ForwardSettlementCoverageError(
      `Capture run directory not found: ${captureRunDir}`,
    );
  }

  const selectedRunId = resolveSelectedRunId(captureRunDir);
  const map = new Map<string, CapturedMarketInventoryEntry>();
  const excludedTickers: Array<{ marketTicker: string; reason: string }> = [];
  const warnings: string[] = [];
  const seenInvalid = new Set<string>();

  const topOfBookPath = posix.join(captureRunDir, "top-of-book.jsonl");
  if (input.io.fileExists(topOfBookPath)) {
    const ingested = await streamInventoryArtifact({
      io: input.io,
      path: topOfBookPath,
      map,
      excludedTickers,
      seenInvalid,
      observedAtField: "receivedAtLocal",
      collectInvalidExclusions: true,
    });
    if (ingested === 0) {
      warnings.push("top-of-book.jsonl contained no usable real-market records.");
    }
  } else {
    warnings.push(`Missing top-of-book.jsonl in ${captureRunDir}`);
  }

  const metadataPath = posix.join(captureRunDir, "market-metadata.jsonl");
  if (input.io.fileExists(metadataPath)) {
    await streamInventoryArtifact({
      io: input.io,
      path: metadataPath,
      map,
      excludedTickers,
      seenInvalid,
      observedAtField: "receivedAtLocal",
      includeCloseTime: true,
      collectInvalidExclusions: false,
    });
  } else {
    warnings.push(`Missing market-metadata.jsonl in ${captureRunDir}`);
  }

  const inventory = [...map.values()]
    .map((entry) => ({
      ...entry,
      expectedSettlementAvailability: resolveExpectedSettlementAvailability({
        marketCloseTime: entry.marketCloseTime,
        evaluatedAt: input.evaluatedAt,
      }),
    }))
    .sort((left, right) => left.marketTicker.localeCompare(right.marketTicker));

  if (inventory.length === 0) {
    warnings.push("No real captured markets found in selected run.");
  }

  return {
    selectedRunId,
    inventory,
    excludedTickers,
    warnings,
  };
}
