import { posix } from "node:path";

import {
  StrategySweepError,
  StrategySweepErrorCode,
  SWEEP_OUTPUT_FILENAME,
} from "./strategySweepTypes";

function normalizePath(path: string): string {
  return posix.normalize(path.replace(/\\/g, "/"));
}

export type BuildStrategySweepOutputPathOptions = {
  parameterSetId?: string;
};

/** Maps a strategy/market pair to its sweep research output location. */
export function buildStrategySweepOutputPath(
  outputDir: string,
  strategyId: string,
  seriesTicker: string,
  marketTicker: string,
  options?: BuildStrategySweepOutputPathOptions,
): string {
  if (!strategyId.trim() || !seriesTicker.trim() || !marketTicker.trim()) {
    throw new StrategySweepError(
      "strategyId, seriesTicker, and marketTicker are required",
      StrategySweepErrorCode.INVALID_REGISTRY,
    );
  }

  const parameterSetId = options?.parameterSetId?.trim();
  if (parameterSetId !== undefined && !parameterSetId) {
    throw new StrategySweepError(
      "parameterSetId must be a non-empty string when provided",
      StrategySweepErrorCode.INVALID_REGISTRY,
    );
  }

  const segments = [
    normalizePath(outputDir),
    strategyId,
    ...(parameterSetId ? [parameterSetId] : []),
    seriesTicker,
    marketTicker,
    SWEEP_OUTPUT_FILENAME,
  ];

  return posix.join(...segments);
}
