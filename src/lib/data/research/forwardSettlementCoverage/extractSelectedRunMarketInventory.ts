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

function ingestJsonlInventory(input: {
  map: Map<string, CapturedMarketInventoryEntry>;
  content: string;
  sourceArtifact: string;
  observedAtField: string;
  includeCloseTime?: boolean;
}): number {
  let count = 0;

  for (const line of input.content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const record = parseJsonLine(trimmed);
    if (!record) {
      continue;
    }

    const marketTicker = readString(record.marketTicker);
    if (!marketTicker || !isRealCaptureMarketTicker(marketTicker)) {
      continue;
    }

    const observedAt =
      readString(record[input.observedAtField])
      ?? readString(record.receivedAtLocal)
      ?? readString(record.timestamp);
    if (!observedAt) {
      continue;
    }

    count += 1;
    mergeInventoryEntry(input.map, {
      marketTicker,
      observedAt,
      eventTicker: readString(record.eventTicker),
      seriesTicker: readString(record.seriesTicker),
      marketCloseTime: input.includeCloseTime
        ? readString(record.closeTime)
        : null,
      sourceArtifact: input.sourceArtifact,
    });
  }

  return count;
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

/** Extracts deduplicated real-market inventory from one selected capture run. */
export function extractSelectedRunMarketInventory(input: {
  io: ForwardSettlementCoverageIo;
  captureRunDir: string;
  evaluatedAt: string;
}): {
  selectedRunId: string;
  inventory: readonly CapturedMarketInventoryEntry[];
  excludedTickers: readonly { marketTicker: string; reason: string }[];
  warnings: string[];
} {
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
    const rawLines = input.io.readFile(topOfBookPath).split(/\r?\n/);
    for (const line of rawLines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      const record = parseJsonLine(trimmed);
      const marketTicker = readString(record?.marketTicker);
      if (!marketTicker) {
        continue;
      }

      if (!isRealCaptureMarketTicker(marketTicker)) {
        if (!seenInvalid.has(marketTicker)) {
          seenInvalid.add(marketTicker);
          excludedTickers.push({
            marketTicker,
            reason: classifyInvalidMarketReason(marketTicker) ?? "excluded ticker",
          });
        }
        continue;
      }
    }

    const ingested = ingestJsonlInventory({
      map,
      content: input.io.readFile(topOfBookPath),
      sourceArtifact: topOfBookPath,
      observedAtField: "receivedAtLocal",
    });
    if (ingested === 0) {
      warnings.push("top-of-book.jsonl contained no usable real-market records.");
    }
  } else {
    warnings.push(`Missing top-of-book.jsonl in ${captureRunDir}`);
  }

  const metadataPath = posix.join(captureRunDir, "market-metadata.jsonl");
  if (input.io.fileExists(metadataPath)) {
    ingestJsonlInventory({
      map,
      content: input.io.readFile(metadataPath),
      sourceArtifact: metadataPath,
      observedAtField: "receivedAtLocal",
      includeCloseTime: true,
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
