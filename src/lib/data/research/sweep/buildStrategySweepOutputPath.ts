import { posix } from "node:path";

import {
  StrategySweepError,
  StrategySweepErrorCode,
  SWEEP_OUTPUT_FILENAME,
} from "./strategySweepTypes";

function normalizePath(path: string): string {
  return posix.normalize(path.replace(/\\/g, "/"));
}

/** Maps a strategy/market pair to its sweep research output location. */
export function buildStrategySweepOutputPath(
  outputDir: string,
  strategyId: string,
  seriesTicker: string,
  marketTicker: string,
): string {
  if (!strategyId.trim() || !seriesTicker.trim() || !marketTicker.trim()) {
    throw new StrategySweepError(
      "strategyId, seriesTicker, and marketTicker are required",
      StrategySweepErrorCode.INVALID_REGISTRY,
    );
  }

  return posix.join(
    normalizePath(outputDir),
    strategyId,
    seriesTicker,
    marketTicker,
    SWEEP_OUTPUT_FILENAME,
  );
}
