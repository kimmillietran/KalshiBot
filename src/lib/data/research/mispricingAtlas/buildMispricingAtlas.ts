import { stableStringify } from "@/lib/trading/config/hashConfig";

import { scanCalibrationResearchOutputs } from "@/lib/data/research/calibration/scanCalibrationResearchOutputs";
import type { ScannedCalibrationResearchOutput } from "@/lib/data/research/calibration/calibrationTypes";
import { DEFAULT_REGIME_TAGS_INPUT_PATH } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";

import {
  computeCoarseMispricingBucketSummaries,
  computeMoneynessBucketSummaries,
  computeOverallMispricingCalibration,
  computeProbabilityBucketSummaries,
  computeTimeRemainingBucketSummaries,
  computeVolatilityBucketSummaries,
} from "./computeMispricingBucketMetrics";
import {
  collectMispricingAtlasBucketGroups,
  computeMispricingAtlasCoverageDiagnostics,
} from "./computeMispricingAtlasCoverage";
import { extractMispricingObservationsFromResearchOutput } from "./parseMispricingObservations";
import { loadRegimeVolatilityByMarket } from "./loadRegimeVolatilityByMarket";
import {
  DEFAULT_MISPRICING_ATLAS_MIN_SAMPLE_THRESHOLD,
  type BuildMispricingAtlasInput,
  type MispricingAtlas,
  type MispricingAtlasIo,
  type MispricingAtlasSampleCounts,
  type MispricingAtlasWarning,
  type MispricingObservation,
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
  const sampleCounts = buildSampleCounts({ observations, marketCount, warnings });
  const minSampleThreshold =
    input.minSampleThreshold ?? DEFAULT_MISPRICING_ATLAS_MIN_SAMPLE_THRESHOLD;
  const probabilityBuckets = computeProbabilityBucketSummaries(observations);
  const timeRemainingBuckets = computeTimeRemainingBucketSummaries(observations);
  const moneynessBuckets = computeMoneynessBucketSummaries(observations);
  const volatilityBuckets = computeVolatilityBucketSummaries(observations);
  const coarseBuckets = computeCoarseMispricingBucketSummaries(
    observations,
    input.regimeVolatilityByMarket,
  );
  const coverageDiagnostics = computeMispricingAtlasCoverageDiagnostics({
    bucketGroups: collectMispricingAtlasBucketGroups({
      probabilityBuckets,
      timeRemainingBuckets,
      moneynessBuckets,
      volatilityBuckets,
      coarseBuckets,
    }),
    sampleCounts,
    minSampleThreshold,
  });

  return {
    generatedAt: input.generatedAt,
    inputRoot: input.inputRoot,
    outputPath: input.outputPath,
    sampleCounts,
    overallCalibration: computeOverallMispricingCalibration(observations),
    probabilityBuckets,
    timeRemainingBuckets,
    moneynessBuckets,
    volatilityBuckets,
    coarseBuckets,
    coverageDiagnostics,
    warnings,
  };
}

export function buildMispricingAtlasFromDirectories(
  inputRoot: string,
  outputPath: string,
  io: MispricingAtlasIo,
  options: {
    generatedAt: string;
    regimeTagsPath?: string;
    minSampleThreshold?: number;
  },
): MispricingAtlas {
  const scanned = scanCalibrationResearchOutputs(inputRoot, io);
  const regimeTagsPath = options.regimeTagsPath ?? DEFAULT_REGIME_TAGS_INPUT_PATH;
  const regimeVolatilityByMarket = loadRegimeVolatilityByMarket(io, regimeTagsPath);

  return buildMispricingAtlas({
    inputRoot,
    outputPath,
    generatedAt: options.generatedAt,
    scanned,
    regimeVolatilityByMarket,
    minSampleThreshold: options.minSampleThreshold,
  });
}

export function serializeMispricingAtlas(atlas: MispricingAtlas): string {
  return stableStringify(atlas);
}
