import { posix } from "node:path";

import {
  RESEARCH_OUTPUT_FILENAME,
  normalizeRootPath,
} from "@/lib/data/research/aggregation/researchAggregatePaths";

import {
  ResearchOutputInspectionError,
  ResearchOutputInspectionErrorCode,
  type DiscoverResearchOutputPathsOptions,
  type ResearchOutputInspectionIo,
} from "./inspectResearchOutputTypes";

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

function matchesStrategyFilter(
  outputPath: string,
  inputRoot: string,
  strategyId: string,
): boolean {
  const normalizedOutput = normalizePath(outputPath);
  const normalizedRoot = normalizeRootPath(inputRoot);
  const prefix = `${normalizedRoot}/`;

  if (!normalizedOutput.startsWith(prefix)) {
    return false;
  }

  const relativeSegments = normalizedOutput.slice(prefix.length).split("/");
  return relativeSegments[0] === strategyId;
}

function collectResearchOutputPathsRecursive(
  directoryPath: string,
  io: ResearchOutputInspectionIo,
  collected: string[],
): void {
  if (!io.isDirectory(directoryPath)) {
    return;
  }

  for (const entryName of [...io.readdir(directoryPath)].sort()) {
    const entryPath = posix.join(directoryPath, entryName);

    if (io.isDirectory(entryPath)) {
      collectResearchOutputPathsRecursive(entryPath, io, collected);
      continue;
    }

    if (entryName === RESEARCH_OUTPUT_FILENAME) {
      collected.push(entryPath);
    }
  }
}

/** Recursively discovers research-output.json files under an input root. */
export function discoverResearchOutputPaths(
  inputRoot: string,
  io: ResearchOutputInspectionIo,
  options: DiscoverResearchOutputPathsOptions = {},
): readonly string[] {
  const normalizedInputRoot = normalizeRootPath(inputRoot);

  if (!io.isDirectory(normalizedInputRoot)) {
    throw new ResearchOutputInspectionError(
      `Input directory does not exist: ${normalizedInputRoot}`,
      ResearchOutputInspectionErrorCode.MISSING_INPUT_DIRECTORY,
    );
  }

  const collected: string[] = [];
  collectResearchOutputPathsRecursive(normalizedInputRoot, io, collected);

  let filtered = collected.sort((left, right) => left.localeCompare(right));

  const strategyId = options.strategyId?.trim();
  if (strategyId) {
    filtered = filtered.filter((outputPath) =>
      matchesStrategyFilter(outputPath, normalizedInputRoot, strategyId),
    );
  }

  const limit = options.limit;
  if (typeof limit === "number" && Number.isFinite(limit) && limit >= 0) {
    return filtered.slice(0, Math.trunc(limit));
  }

  return filtered;
}
