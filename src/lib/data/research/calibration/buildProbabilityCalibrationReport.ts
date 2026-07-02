import { stableStringify } from "@/lib/trading/config/hashConfig";

import { buildCalibrationReportOutputPath } from "./calibrationPaths";
import { computeCalibrationChannelMetrics } from "./computeCalibrationMetrics";
import {
  CalibrationError,
  CalibrationErrorCode,
  type BuildProbabilityCalibrationReportInput,
  type CalibrationIo,
  type CalibrationMarketSummary,
  type CalibrationObservation,
  type CalibrationSampleCounts,
  type CalibrationWarning,
  type ProbabilityCalibrationReport,
  type ScannedCalibrationResearchOutput,
} from "./calibrationTypes";
import { extractCalibrationObservationsFromScan } from "./extractCalibrationObservations";
import { scanCalibrationResearchOutputs } from "./scanCalibrationResearchOutputs";

function buildSampleCounts(
  observations: readonly CalibrationObservation[],
  marketSummaries: readonly CalibrationMarketSummary[],
): CalibrationSampleCounts {
  const kalshiImpliedCount = observations.filter(
    (observation) => observation.source === "kalshi-implied",
  ).length;
  const strategyFairValueCount = observations.filter(
    (observation) => observation.source === "strategy-fair-value",
  ).length;

  return {
    totalObservations: observations.length,
    marketCount: marketSummaries.length,
    kalshiImpliedCount,
    strategyFairValueCount,
    skippedMissingSettlement: marketSummaries.filter(
      (market) => market.settlementOutcome === null,
    ).length,
    skippedMissingProbability: marketSummaries.filter((market) =>
      market.warnings.some(
        (warning) => warning.code === CalibrationErrorCode.MISSING_PROBABILITY,
      ),
    ).length,
  };
}

function sortObservations(
  observations: readonly CalibrationObservation[],
): CalibrationObservation[] {
  return [...observations].sort((left, right) => {
    const marketCompare = left.marketTicker.localeCompare(right.marketTicker);
    if (marketCompare !== 0) {
      return marketCompare;
    }

    const sourceCompare = left.source.localeCompare(right.source);
    if (sourceCompare !== 0) {
      return sourceCompare;
    }

    return left.predictedProbability - right.predictedProbability;
  });
}

function sortMarkets(
  markets: readonly CalibrationMarketSummary[],
): CalibrationMarketSummary[] {
  return [...markets].sort((left, right) =>
    left.marketTicker.localeCompare(right.marketTicker),
  );
}

function sortWarnings(
  warnings: readonly CalibrationWarning[],
): CalibrationWarning[] {
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

/** Builds a probability calibration report for one strategy/series group. */
export function buildProbabilityCalibrationReport(
  input: BuildProbabilityCalibrationReportInput,
): ProbabilityCalibrationReport {
  const {
    inputRoot,
    outputRoot,
    generatedAt,
    binCount,
    scanned,
  } = input;

  if (scanned.length === 0) {
    throw new CalibrationError(
      "No research outputs found for calibration report",
      CalibrationErrorCode.EMPTY_DATASET,
    );
  }

  const marketSummaries: CalibrationMarketSummary[] = [];
  const observations: CalibrationObservation[] = [];
  const warnings: CalibrationWarning[] = [];
  const seriesTickers = new Set<string>();
  const strategyIds = new Set<string>();

  for (const entry of [...scanned].sort((left, right) =>
    left.marketTicker.localeCompare(right.marketTicker),
  )) {
    const extracted = extractCalibrationObservationsFromScan(entry);
    seriesTickers.add(extracted.document.seriesTicker);
    strategyIds.add(extracted.document.strategyId);
    observations.push(...extracted.observations);
    warnings.push(...extracted.warnings);

    marketSummaries.push({
      marketTicker: extracted.document.marketTicker,
      outputPath: entry.outputPath,
      settlementOutcome: extracted.document.settlementOutcome,
      kalshiImpliedSampleCount: extracted.document.kalshiImpliedProbabilities.length,
      strategyFairValueSampleCount:
        extracted.document.strategyFairValueProbabilities.length,
      warnings: extracted.warnings,
    });
  }

  if (seriesTickers.size > 1 || strategyIds.size > 1) {
    throw new CalibrationError(
      "Calibration report requires a single strategyId and seriesTicker group",
      CalibrationErrorCode.INVALID_OUTPUT_SCHEMA,
    );
  }

  const resolvedStrategyId = [...strategyIds][0] ?? "unknown";
  const resolvedSeriesTicker = [...seriesTickers][0] ?? "unknown";

  const sortedObservations = sortObservations(observations);
  const kalshiImplied = computeCalibrationChannelMetrics(
    sortedObservations,
    "kalshi-implied",
    binCount,
  );
  const strategyFairValueMetrics = computeCalibrationChannelMetrics(
    sortedObservations,
    "strategy-fair-value",
    binCount,
  );
  const strategyFairValue =
    strategyFairValueMetrics.sampleCount > 0 ? strategyFairValueMetrics : null;

  const outputPath = buildCalibrationReportOutputPath(
    outputRoot,
    resolvedStrategyId,
    resolvedSeriesTicker,
  );

  return {
    generatedAt,
    strategyId: resolvedStrategyId,
    seriesTicker: resolvedSeriesTicker,
    inputRoot,
    outputPath,
    sampleCounts: buildSampleCounts(sortedObservations, marketSummaries),
    kalshiImplied,
    strategyFairValue,
    markets: sortMarkets(marketSummaries),
    warnings: sortWarnings(warnings),
  };
}

export function buildProbabilityCalibrationReportsFromScanned(
  inputRoot: string,
  outputRoot: string,
  scanned: readonly ScannedCalibrationResearchOutput[],
  options: { generatedAt: string; binCount?: number },
): readonly ProbabilityCalibrationReport[] {
  const grouped = new Map<string, ScannedCalibrationResearchOutput[]>();

  for (const entry of scanned) {
    const key = `${entry.strategyId}/${entry.seriesTicker}`;
    const group = grouped.get(key) ?? [];
    group.push(entry);
    grouped.set(key, group);
  }

  return [...grouped.entries()]
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([, groupScanned]) =>
      buildProbabilityCalibrationReport({
        inputRoot,
        outputRoot,
        generatedAt: options.generatedAt,
        binCount: options.binCount,
        scanned: groupScanned,
      }),
    );
}

export function buildProbabilityCalibrationReportsFromDirectories(
  inputRoot: string,
  outputRoot: string,
  io: CalibrationIo,
  options: { generatedAt: string; binCount?: number },
): readonly ProbabilityCalibrationReport[] {
  const scanned = scanCalibrationResearchOutputs(inputRoot, io);

  if (scanned.length === 0) {
    throw new CalibrationError(
      "No research outputs found for calibration report",
      CalibrationErrorCode.EMPTY_DATASET,
    );
  }

  return buildProbabilityCalibrationReportsFromScanned(
    inputRoot,
    outputRoot,
    scanned,
    options,
  );
}

export function serializeProbabilityCalibrationReport(
  report: ProbabilityCalibrationReport,
): string {
  return stableStringify(report);
}
