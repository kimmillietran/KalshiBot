import { stableStringify } from "@/lib/trading/config/hashConfig";

import { scanCalibrationResearchOutputs } from "@/lib/data/research/calibration/scanCalibrationResearchOutputs";
import type { ScannedCalibrationResearchOutput } from "@/lib/data/research/calibration/calibrationTypes";

import {
  computeImpliedVolatilityVolPremiumBuckets,
  computeMarketVolPremiumSummaries,
  computeMoneynessVolPremiumBuckets,
  computeOverallVolPremiumSummary,
  computeRealizedVolatilityVolPremiumBuckets,
  computeRegimeMarketStateVolPremiumBuckets,
  computeRegimeTrendVolPremiumBuckets,
  computeRegimeVolatilityVolPremiumBuckets,
  computeTimeRemainingVolPremiumBuckets,
  computeVolPremiumAxisBuckets,
} from "./computeVolPremiumBucketMetrics";
import {
  buildRegimeTagsIndex,
  parseRegimeTagsReportJson,
  resolveRegimeTagsForMarket,
} from "./loadRegimeTagIndex";
import { extractVolPremiumObservationsFromResearchOutput } from "./parseVolPremiumObservations";
import {
  DEFAULT_VOL_PREMIUM_REGIME_TAGS_FILENAME,
  DEFAULT_VOL_PREMIUM_VOLATILITY_LOOKBACK_BARS,
  type BuildVolPremiumStudyInput,
  type VolPremiumIo,
  type VolPremiumObservation,
  type VolPremiumSampleCounts,
  type VolPremiumStudy,
  type VolPremiumWarning,
} from "./volPremiumTypes";

function sortWarnings(warnings: readonly VolPremiumWarning[]): VolPremiumWarning[] {
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
  observations: readonly VolPremiumObservation[],
): VolPremiumObservation[] {
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
  observations: readonly VolPremiumObservation[];
  marketCount: number;
  warnings: readonly VolPremiumWarning[];
}): VolPremiumSampleCounts {
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
    regimeTaggedObservations: input.observations.filter(
      (observation) => observation.regimeTags !== null,
    ).length,
  };
}

function collectObservations(
  scanned: readonly ScannedCalibrationResearchOutput[],
  options: {
    regimeTagsByJoinKey?: ReadonlyMap<string, import("@/lib/data/research/regimeTagging/regimeTaggingTypes").RegimeMarketTags>;
    volatilityLookbackBars: number;
  },
): {
  observations: VolPremiumObservation[];
  warnings: VolPremiumWarning[];
  marketCount: number;
} {
  const observations: VolPremiumObservation[] = [];
  const warnings: VolPremiumWarning[] = [];
  const seenMarkets = new Set<string>();

  for (const entry of scanned) {
    const regimeTags = resolveRegimeTagsForMarket(
      options.regimeTagsByJoinKey,
      entry.strategyId,
      entry.marketTicker,
    );

    const extracted = extractVolPremiumObservationsFromResearchOutput(
      entry.outputJson,
      entry.outputPath,
      {
        strategyId: entry.strategyId,
        seriesTicker: entry.seriesTicker,
        marketTicker: entry.marketTicker,
        regimeTags,
        volatilityLookbackBars: options.volatilityLookbackBars,
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

export function resolveRegimeTagsPath(inputRoot: string): string {
  return `${inputRoot.replace(/\\/g, "/").replace(/\/$/, "")}/${DEFAULT_VOL_PREMIUM_REGIME_TAGS_FILENAME}`;
}

export function loadOptionalRegimeTagsIndex(
  inputRoot: string,
  io: VolPremiumIo,
): {
  regimeTagsByJoinKey: Map<string, import("@/lib/data/research/regimeTagging/regimeTaggingTypes").RegimeMarketTags> | undefined;
  regimeTagsPath: string | null;
  warnings: VolPremiumWarning[];
} {
  const regimeTagsPath = resolveRegimeTagsPath(inputRoot);
  const warnings: VolPremiumWarning[] = [];

  if (!io.fileExists(regimeTagsPath)) {
    warnings.push({
      code: "missing-regime-tags",
      message: `Regime tags file not found at ${regimeTagsPath}; regime buckets will be empty`,
    });

    return {
      regimeTagsByJoinKey: undefined,
      regimeTagsPath: null,
      warnings,
    };
  }

  const report = parseRegimeTagsReportJson(io.readFile(regimeTagsPath));

  return {
    regimeTagsByJoinKey: buildRegimeTagsIndex(report),
    regimeTagsPath,
    warnings,
  };
}

/** Builds a deterministic vol premium study from scanned research outputs. */
export function buildVolPremiumStudy(input: BuildVolPremiumStudyInput): VolPremiumStudy {
  const volatilityLookbackBars =
    input.volatilityLookbackBars ?? DEFAULT_VOL_PREMIUM_VOLATILITY_LOOKBACK_BARS;
  const { observations, warnings, marketCount } = collectObservations(input.scanned, {
    regimeTagsByJoinKey: input.regimeTagsByJoinKey,
    volatilityLookbackBars,
  });

  const allWarnings = sortWarnings(warnings);

  if (input.scanned.length === 0) {
    allWarnings.push({
      code: "empty-dataset",
      message: "No research outputs found for vol premium study",
    });
  }

  return {
    generatedAt: input.generatedAt,
    inputRoot: input.inputRoot,
    outputPath: input.outputPath,
    regimeTagsPath: input.regimeTagsByJoinKey ? resolveRegimeTagsPath(input.inputRoot) : null,
    sampleCounts: buildSampleCounts({ observations, marketCount, warnings: allWarnings }),
    overallSummary: computeOverallVolPremiumSummary(observations),
    markets: computeMarketVolPremiumSummaries(observations),
    timeRemainingBuckets: computeTimeRemainingVolPremiumBuckets(observations),
    moneynessBuckets: computeMoneynessVolPremiumBuckets(observations),
    impliedVolatilityBuckets: computeImpliedVolatilityVolPremiumBuckets(observations),
    realizedVolatilityBuckets: computeRealizedVolatilityVolPremiumBuckets(observations),
    volPremiumBuckets: computeVolPremiumAxisBuckets(observations),
    regimeVolatilityBuckets: computeRegimeVolatilityVolPremiumBuckets(observations),
    regimeTrendBuckets: computeRegimeTrendVolPremiumBuckets(observations),
    regimeMarketStateBuckets: computeRegimeMarketStateVolPremiumBuckets(observations),
    warnings: allWarnings,
  };
}

export function buildVolPremiumStudyFromDirectories(
  inputRoot: string,
  outputPath: string,
  io: VolPremiumIo,
  options: { generatedAt: string; volatilityLookbackBars?: number },
): VolPremiumStudy {
  const scanned = scanCalibrationResearchOutputs(inputRoot, io);
  const regimeLoad = loadOptionalRegimeTagsIndex(inputRoot, io);
  const study = buildVolPremiumStudy({
    inputRoot,
    outputPath,
    generatedAt: options.generatedAt,
    scanned,
    regimeTagsByJoinKey: regimeLoad.regimeTagsByJoinKey,
    volatilityLookbackBars: options.volatilityLookbackBars,
  });

  return {
    ...study,
    regimeTagsPath: regimeLoad.regimeTagsPath,
    warnings: sortWarnings([...study.warnings, ...regimeLoad.warnings]),
  };
}

export function serializeVolPremiumStudy(study: VolPremiumStudy): string {
  return stableStringify(study);
}
