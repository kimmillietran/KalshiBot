import { posix } from "node:path";

import { resolveSeriesTicker } from "@/lib/data/audit/settlementTrace/settlementTraceUtils";

import type {
  CapturedMarketSettlementKey,
  ForwardSettlementJoinIo,
} from "./forwardSettlementJoinTypes";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function mergeMarketKey(
  map: Map<string, CapturedMarketSettlementKey>,
  input: {
    marketTicker: string;
    eventTicker?: string | null;
    seriesTicker?: string | null;
    openTime?: string | null;
    closeTime?: string | null;
    runId?: string;
    sourceArtifact: string;
  },
): void {
  const existing = map.get(input.marketTicker);
  const seriesTicker =
    input.seriesTicker
    ?? existing?.seriesTicker
    ?? resolveSeriesTicker(input.marketTicker);

  const merged: CapturedMarketSettlementKey = {
    marketTicker: input.marketTicker,
    eventTicker: input.eventTicker ?? existing?.eventTicker ?? null,
    seriesTicker,
    openTime: input.openTime ?? existing?.openTime ?? null,
    closeTime: input.closeTime ?? existing?.closeTime ?? null,
    captureRunIds: input.runId
      ? [...new Set([...(existing?.captureRunIds ?? []), input.runId])]
      : (existing?.captureRunIds ?? []),
    sourceArtifacts: [
      ...new Set([...(existing?.sourceArtifacts ?? []), input.sourceArtifact]),
    ],
  };

  map.set(input.marketTicker, merged);
}

function parseJsonLine(line: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(line);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function ingestTopOfBookFile(input: {
  map: Map<string, CapturedMarketSettlementKey>;
  runId: string;
  sourceArtifact: string;
  content: string;
  seriesFilter: string | null;
}): number {
  let lineCount = 0;

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
    if (!marketTicker) {
      continue;
    }

    const seriesTicker = readString(record.seriesTicker) ?? resolveSeriesTicker(marketTicker);
    if (input.seriesFilter && seriesTicker !== input.seriesFilter) {
      continue;
    }

    lineCount += 1;
    mergeMarketKey(input.map, {
      marketTicker,
      eventTicker: readString(record.eventTicker),
      seriesTicker,
      runId: readString(record.runId) ?? input.runId,
      sourceArtifact: input.sourceArtifact,
    });
  }

  return lineCount;
}

function ingestMarketMetadataFile(input: {
  map: Map<string, CapturedMarketSettlementKey>;
  runId: string;
  sourceArtifact: string;
  content: string;
  seriesFilter: string | null;
}): number {
  let lineCount = 0;

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
    if (!marketTicker) {
      continue;
    }

    const seriesTicker = readString(record.seriesTicker) ?? resolveSeriesTicker(marketTicker);
    if (input.seriesFilter && seriesTicker !== input.seriesFilter) {
      continue;
    }

    lineCount += 1;
    mergeMarketKey(input.map, {
      marketTicker,
      eventTicker: readString(record.eventTicker),
      seriesTicker,
      openTime: readString(record.openTime),
      closeTime: readString(record.closeTime),
      runId: readString(record.runId) ?? input.runId,
      sourceArtifact: input.sourceArtifact,
    });
  }

  return lineCount;
}

function ingestStaticParityScanMarkets(input: {
  map: Map<string, CapturedMarketSettlementKey>;
  content: string;
  sourceArtifact: string;
  seriesFilter: string | null;
}): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.content);
  } catch {
    return;
  }

  if (!isRecord(parsed)) {
    return;
  }

  const metrics = isRecord(parsed.metrics) ? parsed.metrics : null;
  const involved = metrics?.marketsInvolved;
  if (!Array.isArray(involved)) {
    return;
  }

  for (const value of involved) {
    const marketTicker = readString(value);
    if (!marketTicker) {
      continue;
    }

    const seriesTicker = resolveSeriesTicker(marketTicker);
    if (input.seriesFilter && seriesTicker !== input.seriesFilter) {
      continue;
    }

    mergeMarketKey(input.map, {
      marketTicker,
      seriesTicker,
      sourceArtifact: input.sourceArtifact,
    });
  }
}

/** Collects unique captured market keys from forward capture artifacts. */
export function parseCapturedMarketSettlementKeys(input: {
  io: ForwardSettlementJoinIo;
  forwardQuotesDir: string;
  staticParityScanPath: string | null;
  seriesTicker: string | null;
}): {
  markets: readonly CapturedMarketSettlementKey[];
  inputArtifactsUsed: string[];
  warnings: string[];
} {
  const map = new Map<string, CapturedMarketSettlementKey>();
  const inputArtifactsUsed: string[] = [];
  const warnings: string[] = [];

  if (input.io.fileExists(input.forwardQuotesDir)) {
    inputArtifactsUsed.push(input.forwardQuotesDir);

    for (const entry of input.io.readdir(input.forwardQuotesDir)) {
      const runDir = posix.join(input.forwardQuotesDir, entry);
      if (!input.io.isDirectory(runDir)) {
        continue;
      }

      const topOfBookPath = posix.join(runDir, "top-of-book.jsonl");
      if (input.io.fileExists(topOfBookPath)) {
        inputArtifactsUsed.push(topOfBookPath);
        ingestTopOfBookFile({
          map,
          runId: entry,
          sourceArtifact: topOfBookPath,
          content: input.io.readFile(topOfBookPath),
          seriesFilter: input.seriesTicker,
        });
      }

      const metadataPath = posix.join(runDir, "market-metadata.jsonl");
      if (input.io.fileExists(metadataPath)) {
        inputArtifactsUsed.push(metadataPath);
        ingestMarketMetadataFile({
          map,
          runId: entry,
          sourceArtifact: metadataPath,
          content: input.io.readFile(metadataPath),
          seriesFilter: input.seriesTicker,
        });
      }
    }
  }

  if (input.staticParityScanPath && input.io.fileExists(input.staticParityScanPath)) {
    inputArtifactsUsed.push(input.staticParityScanPath);
    ingestStaticParityScanMarkets({
      map,
      content: input.io.readFile(input.staticParityScanPath),
      sourceArtifact: input.staticParityScanPath,
      seriesFilter: input.seriesTicker,
    });
  }

  if (map.size === 0) {
    warnings.push("No captured markets found in forward capture artifacts.");
  }

  return {
    markets: [...map.values()].sort((left, right) =>
      left.marketTicker.localeCompare(right.marketTicker),
    ),
    inputArtifactsUsed,
    warnings,
  };
}
