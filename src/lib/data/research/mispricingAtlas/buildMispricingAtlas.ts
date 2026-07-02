import { stableStringify } from "@/lib/trading/config/hashConfig";

import { scanCalibrationResearchOutputs } from "@/lib/data/research/calibration/scanCalibrationResearchOutputs";
import type { ScannedCalibrationResearchOutput } from "@/lib/data/research/calibration/calibrationTypes";

import {
  computeMoneynessBucketSummaries,
  computeOverallMispricingCalibration,
  computeProbabilityBucketSummaries,
  computeTimeRemainingBucketSummaries,
  computeVolatilityBucketSummaries,
} from "./computeMispricingBucketMetrics";
import { extractMispricingObservationsFromResearchOutput } from "./parseMispricingObservations";
import type {
  BuildMispricingAtlasInput,
  MispricingAtlas,
  MispricingAtlasIo,
  MispricingAtlasSampleCounts,
  MispricingAtlasWarning,
  MispricingObservation,
} from "./mispricingAtlasTypes";

function sortWarnings(
  warnings: readonly MispricingAtlasWarning[],
): MispricingAtlasWarning[] {
  return [...warnings].sort((left, right) => {
    const marketCompare = (left.marketTicker ?? "").localeCompare(
      right.marketTicker ?? "",
    );
    if (marketCompare !== 0) {
      return marketCompare;
    }

    return left.message.localeCompare(right.message);
  });
}

function sortObservations(
  observations: readonly MispricingObservation[],
): MispricingObservation[] {
  return [...observations].sort((left, right) => {
    const marketCompare = left.marketTicker.localeCompare(right.marketTicker);
    if (marketCompare !== 0) {
      return marketCompare;
    }

    const strategyCompare = left.strategyId.localeCompare(right.strategyId);
    if (strategyCompare !== 0) {
      return strategyCompare;
    }

    return left.stepIndex - right.stepIndex;
  });
}

function buildSampleCounts(input: {
  observations: readonly MispricingObservation[];
  marketCount: number;
  warnings: readonly MispricingAtlasWarning[];
}): MispricingAtlasSampleCounts {
  return {
    totalObservations: input.observations.length,
    marketCount: input.marketCount,
    skippedMissingSettlement: input.warnings.filter(
      (warning) => warning.code === "missing-settlement",
    ).length,
    skippedMissingProbability: input.warnings.filter(
      (warning) => warning.code === "missing-probability",
    ).length,
    skippedMissingContext: input.warnings.filter(
      (warning) => warning.code === "missing-context",
    ).length,
  };
}

function collectObservations(
  scanned: readonly ScannedCalibrationResearchOutput[],
): {
  observations: MispricingObservation[];
  warnings: MispricingAtlasWarning[];
  marketCount: number;
} {
  const observations: MispricingObservation[] = [];
  const warnings: MispricingAtlasWarning[] = [];
  const seenMarkets = new Set<string>();

  for (const entry of scanned) {
    const extracted = extractMispricingObservationsFromResearchOutput(
      entry.outputJson,
      entry.outputPath,
      {
        strategyId: entry.strategyId,
        seriesTicker: entry.seriesTicker,
        marketTicker: entry.marketTicker,
      },
    );

    seenMarkets.add(`${entry.strategyId}/${entry.seriesTicker}/${entry.marketTicker}`);
    observations.push(...extracted.observations);
    warnings.push(...extracted.warnings);
  }

  return {
    observations: sortObservations(observations),
    warnings: sortWarnings(warnings),
    marketCount: seenMarkets.size,
  };
}

/** Builds a deterministic mispricing atlas from scanned research outputs. */
export function buildMispricingAtlas(
  input: BuildMispricingAtlasInput,
): MispricingAtlas {
  const { observations, warnings, marketCount } = collectObservations(input.scanned);

  return {
    generatedAt: input.generatedAt,
    inputRoot: input.inputRoot,
    outputPath: input.outputPath,
    sampleCounts: buildSampleCounts({ observations, marketCount, warnings }),
    overallCalibration: computeOverallMispricingCalibration(observations),
    probabilityBuckets: computeProbabilityBucketSummaries(observations),
    timeRemainingBuckets: computeTimeRemainingBucketSummaries(observations),
    moneynessBuckets: computeMoneynessBucketSummaries(observations),
    volatilityBuckets: computeVolatilityBucketSummaries(observations),
    warnings,
  };
}

export function buildMispricingAtlasFromDirectories(
  inputRoot: string,
  outputPath: string,
  io: MispricingAtlasIo,
  options: { generatedAt: string },
): MispricingAtlas {
  const scanned = scanCalibrationResearchOutputs(inputRoot, io);

  return buildMispricingAtlas({
    inputRoot,
    outputPath,
    generatedAt: options.generatedAt,
    scanned,
  });
}

export function serializeMispricingAtlas(atlas: MispricingAtlas): string {
  return stableStringify(atlas);
}
