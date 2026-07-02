import { posix } from "node:path";

import { buildStrategySweepOutputPath } from "@/lib/data/research/sweep";

import { ParameterStrategySweepError, ParameterStrategySweepErrorCode } from "./errors";

function normalizePath(path: string): string {
  return posix.normalize(path.replace(/\\/g, "/"));
}

export function buildParameterSweepOutputPath(
  outputDir: string,
  strategyId: string,
  parameterSetId: string,
  seriesTicker: string,
  marketTicker: string,
): string {
  if (!parameterSetId.trim()) {
    throw new ParameterStrategySweepError(
      "parameterSetId is required",
      ParameterStrategySweepErrorCode.INVALID_DEFINITION,
    );
  }

  return buildStrategySweepOutputPath(
    normalizePath(outputDir),
    strategyId,
    seriesTicker,
    marketTicker,
    { parameterSetId },
  );
}

export function buildParameterSweepSetRootPath(
  outputDir: string,
  strategyId: string,
  parameterSetId: string,
): string {
  return posix.join(
    normalizePath(outputDir),
    strategyId,
    parameterSetId,
  );
}
