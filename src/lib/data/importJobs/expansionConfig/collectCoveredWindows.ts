import { posix } from "node:path";

import { DEFAULT_KXBTC15M_SERIES_TICKER } from "@/lib/data/discovery";

import type { HistoricalCoverageWindow } from "./expansionConfigTypes";

const CONFIG_FILENAME = "config.json";

function parseTimestamp(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function compareWindows(
  left: HistoricalCoverageWindow,
  right: HistoricalCoverageWindow,
): number {
  const byStart = left.windowStart.localeCompare(right.windowStart);
  if (byStart !== 0) {
    return byStart;
  }

  return left.windowEnd.localeCompare(right.windowEnd);
}

function mergeAdjacentWindows(
  windows: readonly HistoricalCoverageWindow[],
): HistoricalCoverageWindow[] {
  const sorted = [...windows]
    .map((window) => ({
      windowStart: window.windowStart,
      windowEnd: window.windowEnd,
    }))
    .sort(compareWindows);

  const merged: HistoricalCoverageWindow[] = [];

  for (const window of sorted) {
    const startMs = parseTimestamp(window.windowStart);
    const endMs = parseTimestamp(window.windowEnd);
    if (startMs === null || endMs === null || endMs < startMs) {
      continue;
    }

    const previous = merged.at(-1);
    if (previous === undefined) {
      merged.push(window);
      continue;
    }

    const previousEndMs = parseTimestamp(previous.windowEnd);
    if (previousEndMs === null) {
      merged.push(window);
      continue;
    }

    if (startMs <= previousEndMs) {
      previous.windowEnd =
        endMs > previousEndMs ? window.windowEnd : previous.windowEnd;
      continue;
    }

    merged.push(window);
  }

  return merged;
}

/** Returns true when the candidate window is fully contained in a covered window. */
export function isWindowFullyCovered(
  candidate: HistoricalCoverageWindow,
  coveredWindows: readonly HistoricalCoverageWindow[],
): boolean {
  const candidateStartMs = parseTimestamp(candidate.windowStart);
  const candidateEndMs = parseTimestamp(candidate.windowEnd);
  if (candidateStartMs === null || candidateEndMs === null) {
    return false;
  }

  for (const covered of coveredWindows) {
    const coveredStartMs = parseTimestamp(covered.windowStart);
    const coveredEndMs = parseTimestamp(covered.windowEnd);
    if (coveredStartMs === null || coveredEndMs === null) {
      continue;
    }

    if (candidateStartMs >= coveredStartMs && candidateEndMs <= coveredEndMs) {
      return true;
    }
  }

  return false;
}

function extractWindowFromConfigJson(json: string): HistoricalCoverageWindow | null {
  try {
    const parsed = JSON.parse(json) as {
      startTime?: unknown;
      endTime?: unknown;
    };
    if (typeof parsed.startTime !== "string" || typeof parsed.endTime !== "string") {
      return null;
    }

    return {
      windowStart: parsed.startTime,
      windowEnd: parsed.endTime,
    };
  } catch {
    return null;
  }
}

export type CollectCoveredWindowsIo = {
  fileExists: (path: string) => boolean;
  isDirectory: (path: string) => boolean;
  readdir: (path: string) => readonly string[];
  readFile: (path: string) => string;
};

/** Collects covered import windows from existing per-market config files. */
export function collectCoveredWindowsFromImportConfigs(
  importConfigsDir: string,
  io: CollectCoveredWindowsIo,
  options?: { seriesTicker?: string },
): HistoricalCoverageWindow[] {
  const seriesTicker = options?.seriesTicker ?? DEFAULT_KXBTC15M_SERIES_TICKER;
  const seriesDir = posix.join(importConfigsDir, seriesTicker);
  if (!io.fileExists(seriesDir) || !io.isDirectory(seriesDir)) {
    return [];
  }

  const windows: HistoricalCoverageWindow[] = [];

  for (const marketDir of io.readdir(seriesDir)) {
    const configPath = posix.join(seriesDir, marketDir, CONFIG_FILENAME);
    if (!io.fileExists(configPath)) {
      continue;
    }

    const window = extractWindowFromConfigJson(io.readFile(configPath));
    if (window) {
      windows.push(window);
    }
  }

  return mergeAdjacentWindows(windows);
}

export function mergeCoverageWindows(
  ...groups: readonly (readonly HistoricalCoverageWindow[])[]
): HistoricalCoverageWindow[] {
  return mergeAdjacentWindows(groups.flat());
}
