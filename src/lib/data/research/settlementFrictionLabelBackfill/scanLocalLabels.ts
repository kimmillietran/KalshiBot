import { buildImportedMarketDirectoryPath } from "@/lib/data/datasets/registry/importedMarketDatasetPaths";
import { resolveSeriesTicker } from "@/lib/data/audit/settlementTrace/settlementTraceUtils";

import { extractLabelFromImportResult } from "./extractLabelFromImport";
import type { EnrichedSettlementLabel, TickerManifest } from "./types";

export type LocalLabelScanResult = {
  byTicker: Map<string, EnrichedSettlementLabel>;
  complete: number;
  partial: number;
  missing: number;
  conflicting: number;
  conflicts: Array<{ marketTicker: string; fields: string[] }>;
};

export type LocalLabelScanDeps = {
  fileExists: (path: string) => boolean;
  readFile: (path: string) => string;
  listImportRoots?: readonly string[];
};

/**
 * Scan permitted local import roots for exact target-ticker matches.
 * Default roots: dedicated backfill imports + shared data/imports.
 */
export function scanLocalSettlementLabels(input: {
  manifest: TickerManifest;
  deps: LocalLabelScanDeps;
  importRoots?: readonly string[];
}): LocalLabelScanResult {
  const roots = input.importRoots
    ?? input.deps.listImportRoots
    ?? [
      "data/imports/settlement-friction-label-backfill",
      "data/imports",
    ];

  const byTicker = new Map<string, EnrichedSettlementLabel>();
  const conflicts: Array<{ marketTicker: string; fields: string[] }> = [];

  for (const entry of input.manifest.tickers) {
    let best: EnrichedSettlementLabel | null = null;
    for (const root of roots) {
      const seriesTicker = resolveSeriesTicker(entry.marketTicker);
      const paths = buildImportedMarketDirectoryPath(root, seriesTicker, entry.marketTicker);
      if (!input.deps.fileExists(paths.importResultPath)) {
        continue;
      }
      let raw: unknown;
      try {
        raw = JSON.parse(input.deps.readFile(paths.importResultPath));
      } catch {
        continue;
      }
      const label = extractLabelFromImportResult({
        marketTicker: entry.marketTicker,
        importResultRaw: raw,
        source: "local-import",
        importResultPath: paths.importResultPath,
      });
      if (!best) {
        best = label;
        continue;
      }
      const conflictFields: string[] = [];
      for (const key of [
        "result",
        "expirationValue",
        "floorStrike",
        "closeTime",
        "settlementTs",
      ] as const) {
        const a = best[key];
        const b = label[key];
        if (a != null && b != null && a !== b) {
          conflictFields.push(key);
        }
      }
      if (conflictFields.length > 0) {
        conflicts.push({ marketTicker: entry.marketTicker, fields: conflictFields });
        continue;
      }
      if (label.completeness === "complete" && best.completeness !== "complete") {
        best = label;
      } else if (label.completeness === "partial" && best.completeness === "missing") {
        best = label;
      }
    }
    byTicker.set(
      entry.marketTicker,
      best
        ?? extractLabelFromImportResult({
          marketTicker: entry.marketTicker,
          importResultRaw: null,
          source: "absent",
          importResultPath: null,
        }),
    );
  }

  let complete = 0;
  let partial = 0;
  let missing = 0;
  for (const label of byTicker.values()) {
    if (label.completeness === "complete") complete += 1;
    else if (label.completeness === "partial") partial += 1;
    else missing += 1;
  }

  return {
    byTicker,
    complete,
    partial,
    missing,
    conflicting: conflicts.length,
    conflicts,
  };
}

export function tickersNeedingFetch(
  scan: LocalLabelScanResult,
  conflictTickers: ReadonlySet<string>,
): string[] {
  const need: string[] = [];
  for (const [ticker, label] of scan.byTicker) {
    if (conflictTickers.has(ticker)) continue;
    if (label.completeness !== "complete") need.push(ticker);
  }
  return need.sort();
}
