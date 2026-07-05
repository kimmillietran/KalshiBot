import {
  computeCoarseMispricingBucketSummaries,
  computeMoneynessBucketSummaries,
  computeOverallMispricingCalibration,
  computeProbabilityBucketSummaries,
  computeTimeRemainingBucketSummaries,
  computeVolatilityBucketSummaries,
} from "./computeMispricingBucketMetrics";
import { collectMispricingAtlasBucketGroups, computeMispricingAtlasCoverageDiagnostics } from "./computeMispricingAtlasCoverage";
import {
  DEFAULT_MISPRICING_ATLAS_MIN_SAMPLE_THRESHOLD,
  type BuildMispricingAtlasInput,
  type MispricingAtlas,
  type MispricingAtlasWarning,
  type MispricingObservation,
} from "./mispricingAtlasTypes";
import { extractMispricingObservationsFromResearchOutput } from "./parseMispricingObservations";

/** @internal Legacy materialization path retained for regression comparisons. */
export function buildMispricingAtlasFromScannedLegacy(
  input: BuildMispricingAtlasInput,
): MispricingAtlas {
  const observations: MispricingObservation[] = [];
  const warnings: MispricingAtlasWarning[] = [];
  const seenMarkets = new Set<string>();

  for (const entry of input.scanned) {
    const extracted = extractMispricingObservationsFromResearchOutput(
      entry.outputJson,
      entry.outputPath,
      {
        strategyId: entry.strategyId,
        seriesTicker: entry.seriesTicker,
        marketTicker: entry.marketTicker,
      },
    );

    seenMarkets.add(
      `${extracted.strategyId}/${extracted.seriesTicker}/${extracted.marketTicker}`,
    );
    observations.push(...extracted.observations);
    warnings.push(...extracted.warnings);
  }

  const sortedObservations = [...observations].sort((left, right) => {
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
  const sortedWarnings = [...warnings].sort((left, right) => {
    const marketCompare = (left.marketTicker ?? "").localeCompare(
      right.marketTicker ?? "",
    );
    if (marketCompare !== 0) {
      return marketCompare;
    }

    return left.message.localeCompare(right.message);
  });
  const sampleCounts = {
    totalObservations: sortedObservations.length,
    marketCount: seenMarkets.size,
    skippedMissingSettlement: sortedWarnings.filter(
      (warning) => warning.code === "missing-settlement",
    ).length,
    skippedMissingProbability: sortedWarnings.filter(
      (warning) => warning.code === "missing-probability",
    ).length,
    skippedMissingContext: sortedWarnings.filter(
      (warning) => warning.code === "missing-context",
    ).length,
  };
  const minSampleThreshold =
    input.minSampleThreshold ?? DEFAULT_MISPRICING_ATLAS_MIN_SAMPLE_THRESHOLD;
  const probabilityBuckets = computeProbabilityBucketSummaries(sortedObservations);
  const timeRemainingBuckets = computeTimeRemainingBucketSummaries(sortedObservations);
  const moneynessBuckets = computeMoneynessBucketSummaries(sortedObservations);
  const volatilityBuckets = computeVolatilityBucketSummaries(sortedObservations);
  const coarseBuckets = computeCoarseMispricingBucketSummaries(
    sortedObservations,
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
    overallCalibration: computeOverallMispricingCalibration(sortedObservations),
    probabilityBuckets,
    timeRemainingBuckets,
    moneynessBuckets,
    volatilityBuckets,
    coarseBuckets,
    coverageDiagnostics,
    warnings: sortedWarnings,
  };
}
