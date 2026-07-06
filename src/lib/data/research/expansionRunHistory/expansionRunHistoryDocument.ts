import { stableStringify } from "@/lib/trading/config/hashConfig";

import type {
  ExpansionRunHistoryDocument,
  ExpansionRunHistoryRun,
} from "./expansionRunHistoryTypes";
import {
  DEFAULT_EXPANSION_RUN_HISTORY_MAX_RUNS,
  EXPANSION_RUN_HISTORY_SCHEMA_VERSION,
} from "./expansionRunHistoryTypes";

function runsAreEquivalent(left: ExpansionRunHistoryRun, right: ExpansionRunHistoryRun): boolean {
  return left.runId === right.runId;
}

/** Appends a run to expansion history without overwriting prior runs. */
export function appendExpansionRunHistoryRun(
  existing: ExpansionRunHistoryDocument | null,
  run: ExpansionRunHistoryRun,
  input: {
    generatedAt: string;
    outputPath: string;
    htmlOutputPath: string;
    maxRunsRetained?: number;
  },
): ExpansionRunHistoryDocument {
  const maxRunsRetained = input.maxRunsRetained ?? DEFAULT_EXPANSION_RUN_HISTORY_MAX_RUNS;
  const priorRuns = existing?.runs ?? [];
  const withoutDuplicate = priorRuns.filter((entry) => !runsAreEquivalent(entry, run));
  const nextRuns = [...withoutDuplicate, run];

  return {
    schemaVersion: existing?.schemaVersion ?? EXPANSION_RUN_HISTORY_SCHEMA_VERSION,
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
    maxRunsRetained,
    runs: nextRuns.slice(-maxRunsRetained),
  };
}

export function parseExpansionRunHistoryDocument(
  path: string,
  json: string,
): ExpansionRunHistoryDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error(`Invalid JSON in expansion run history document: ${path}`);
  }

  if (
    !parsed
    || typeof parsed !== "object"
    || !Array.isArray((parsed as ExpansionRunHistoryDocument).runs)
  ) {
    throw new Error(`Invalid expansion run history document in ${path}`);
  }

  return parsed as ExpansionRunHistoryDocument;
}

/** Loads prior history, returning null when missing or corrupted. */
export function tryLoadExpansionRunHistoryDocument(
  io: { readFile: (path: string) => string; fileExists: (path: string) => boolean },
  path: string,
): { document: ExpansionRunHistoryDocument | null; corrupted: boolean } {
  if (!io.fileExists(path)) {
    return { document: null, corrupted: false };
  }

  try {
    return {
      document: parseExpansionRunHistoryDocument(path, io.readFile(path)),
      corrupted: false,
    };
  } catch {
    return { document: null, corrupted: true };
  }
}

export function serializeExpansionRunHistoryDocument(
  document: ExpansionRunHistoryDocument,
): string {
  return stableStringify(document);
}

/** Prunes history to the configured maximum run count. */
export function pruneExpansionRunHistoryRuns(
  document: ExpansionRunHistoryDocument,
): ExpansionRunHistoryDocument {
  return {
    ...document,
    runs: document.runs.slice(-document.maxRunsRetained),
  };
}
