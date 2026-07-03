import { posix } from "node:path";

import { StrategyHarnessError, STRATEGY_HARNESS_OUTPUT_FILENAME } from "./strategyHarnessTypes";

function normalizePath(path: string): string {
  return posix.normalize(path.replace(/\\/g, "/"));
}

/** Maps a synthesized strategy/market pair to harness research output location. */
export function buildStrategyHarnessOutputPath(
  outputDir: string,
  synthesizedStrategyId: string,
  seriesTicker: string,
  marketTicker: string,
): string {
  if (!synthesizedStrategyId.trim() || !seriesTicker.trim() || !marketTicker.trim()) {
    throw new StrategyHarnessError(
      "synthesizedStrategyId, seriesTicker, and marketTicker are required",
    );
  }

  return posix.join(
    normalizePath(outputDir),
    synthesizedStrategyId,
    seriesTicker,
    marketTicker,
    STRATEGY_HARNESS_OUTPUT_FILENAME,
  );
}

export function resolveStrategyHarnessSummaryPath(
  outputDir: string,
  summaryFilename: string,
): string {
  return posix.join(normalizePath(outputDir), summaryFilename);
}
