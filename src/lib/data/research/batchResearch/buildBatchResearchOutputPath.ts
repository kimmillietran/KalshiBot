import { posix } from "node:path";

import {
  BATCH_RESEARCH_OUTPUT_FILENAME,
  BatchResearchRunnerError,
  BatchResearchRunnerErrorCode,
} from "./batchResearchTypes";

function normalizePath(path: string): string {
  return posix.normalize(path.replace(/\\/g, "/"));
}

/** Maps a registry market entry to its batch research output location. */
export function buildBatchResearchOutputPath(
  outputDir: string,
  seriesTicker: string,
  marketTicker: string,
): string {
  if (!seriesTicker.trim() || !marketTicker.trim()) {
    throw new BatchResearchRunnerError(
      "seriesTicker and marketTicker are required",
      BatchResearchRunnerErrorCode.INVALID_REGISTRY,
    );
  }

  return posix.join(
    normalizePath(outputDir),
    seriesTicker,
    marketTicker,
    BATCH_RESEARCH_OUTPUT_FILENAME,
  );
}
