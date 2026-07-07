import { enumerateCalibrationResearchOutputPaths } from "@/lib/data/research/calibration/enumerateCalibrationResearchOutputPaths";
import type { CalibrationIo } from "@/lib/data/research/calibration/calibrationTypes";
import { findDerivedExpirationValueInDatasetSnapshots } from "@/lib/data/research/settlement";
import { DataQualityFlag } from "@/lib/data/schemas";

import type { DerivedSettlementSensitivityIo } from "./derivedSettlementSensitivityTypes";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseDatasetSnapshots(outputJson: string): readonly unknown[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(outputJson.replace(/^\uFEFF/, ""));
  } catch {
    return [];
  }

  if (!isRecord(parsed)) {
    return [];
  }

  const datasetValue = parsed.dataset ?? parsed;
  const dataset =
    typeof datasetValue === "string"
      ? (() => {
        try {
          return JSON.parse(datasetValue) as unknown;
        } catch {
          return null;
        }
      })()
      : datasetValue;

  if (!isRecord(dataset) || !Array.isArray(dataset.snapshots)) {
    return [];
  }

  return dataset.snapshots;
}

/** Scans research outputs and returns join keys for markets with derived expiration_value. */
export function discoverDerivedSettlementMarketKeys(input: {
  researchResultsDir: string;
  io: DerivedSettlementSensitivityIo;
}): Set<string> {
  const calibrationIo: CalibrationIo = {
    readFile: input.io.readFile,
    fileExists: input.io.fileExists,
    readdir: input.io.readdir,
    isDirectory: input.io.isDirectory,
  };

  const derivedKeys = new Set<string>();

  for (const entry of enumerateCalibrationResearchOutputPaths(
    input.researchResultsDir,
    calibrationIo,
  )) {
    const snapshots = parseDatasetSnapshots(input.io.readFile(entry.outputPath));
    if (
      !findDerivedExpirationValueInDatasetSnapshots(
        snapshots,
        DataQualityFlag.DERIVED_EXPIRATION_VALUE,
      )
    ) {
      continue;
    }

    derivedKeys.add(`${entry.strategyId}/${entry.seriesTicker}/${entry.marketTicker}`);
  }

  return derivedKeys;
}

export function observationMarketJoinKey(input: {
  strategyId: string;
  seriesTicker: string;
  marketTicker: string;
}): string {
  return `${input.strategyId}/${input.seriesTicker}/${input.marketTicker}`;
}

export function filterObservationsExcludingDerivedMarkets<
  T extends { strategyId: string; seriesTicker: string; marketTicker: string },
>(observations: readonly T[], derivedMarketKeys: ReadonlySet<string>): T[] {
  return observations.filter((observation) => {
    const joinKey = observationMarketJoinKey(observation);
    return !derivedMarketKeys.has(joinKey);
  });
}
