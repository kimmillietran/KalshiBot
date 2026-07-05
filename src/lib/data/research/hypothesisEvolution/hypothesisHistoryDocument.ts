import { stableStringify } from "@/lib/trading/config/hashConfig";

import type {
  HypothesisHistoryDocument,
  HypothesisHistoryRun,
} from "./hypothesisEvolutionTypes";
import { DEFAULT_HYPOTHESIS_HISTORY_MAX_RUNS } from "./hypothesisEvolutionTypes";

function runsAreEquivalent(left: HypothesisHistoryRun, right: HypothesisHistoryRun): boolean {
  return left.runId === right.runId;
}

/** Appends a run to history without overwriting prior runs. */
export function appendHypothesisHistoryRun(
  existing: HypothesisHistoryDocument | null,
  run: HypothesisHistoryRun,
  input: {
    generatedAt: string;
    outputPath: string;
    htmlOutputPath: string;
    maxRunsRetained?: number;
  },
): HypothesisHistoryDocument {
  const maxRunsRetained = input.maxRunsRetained ?? DEFAULT_HYPOTHESIS_HISTORY_MAX_RUNS;
  const priorRuns = existing?.runs ?? [];
  const withoutDuplicate = priorRuns.filter((entry) => !runsAreEquivalent(entry, run));
  const nextRuns = [...withoutDuplicate, run];

  return {
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
    maxRunsRetained,
    runs: nextRuns.slice(-maxRunsRetained),
  };
}

export function parseHypothesisHistoryDocument(
  path: string,
  json: string,
): HypothesisHistoryDocument {
  const parsed = JSON.parse(json) as HypothesisHistoryDocument;
  if (!parsed || !Array.isArray(parsed.runs)) {
    throw new Error(`Invalid hypothesis history document in ${path}`);
  }

  return parsed;
}

export function tryLoadHypothesisHistoryDocument(
  io: { readFile: (path: string) => string; fileExists: (path: string) => boolean },
  path: string,
): HypothesisHistoryDocument | null {
  if (!io.fileExists(path)) {
    return null;
  }

  return parseHypothesisHistoryDocument(path, io.readFile(path));
}

export function serializeHypothesisHistoryDocument(
  document: HypothesisHistoryDocument,
): string {
  return stableStringify(document);
}

/** Prunes history to the configured maximum run count. */
export function pruneHypothesisHistoryRuns(
  document: HypothesisHistoryDocument,
): HypothesisHistoryDocument {
  return {
    ...document,
    runs: document.runs.slice(-document.maxRunsRetained),
  };
}
