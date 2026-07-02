import { stableStringify } from "@/lib/trading/config/hashConfig";

import { normalizeRootPath } from "../aggregation/researchAggregatePaths";
import { discoverStrategyAggregateSummaries } from "../leaderboard/discoverStrategyAggregateSummaries";
import {
  StrategyLeaderboardError,
  StrategyLeaderboardErrorCode,
} from "../leaderboard/strategyLeaderboardTypes";

import { buildOverfittingDiagnosticsReport } from "./computeOverfittingMetrics";
import {
  discoverExperimentRegistry,
  resolveConfigCount,
} from "./discoverExperimentRegistry";
import {
  countParameterSweepConfigsFromRoot,
  discoverFoldPerformanceMatrix,
  loadStatisticalSignificanceReport,
} from "./discoverOverfittingInputs";
import {
  DEFAULT_MULTIPLE_TESTING_ALPHA,
  DEFAULT_OVERFITTING_DIAGNOSTICS_EXPERIMENTS_ROOT,
  type OverfittingDiagnosticsIo,
  type OverfittingDiagnosticsReport,
} from "./overfittingDiagnosticsTypes";

function discoverSummariesOrEmpty(
  inputRoot: string,
  io: OverfittingDiagnosticsIo,
) {
  try {
    return discoverStrategyAggregateSummaries(inputRoot, io);
  } catch (error) {
    if (
      error instanceof StrategyLeaderboardError &&
      error.code === StrategyLeaderboardErrorCode.EMPTY_DATASET
    ) {
      return [];
    }

    throw error;
  }
}

/** Builds overfitting diagnostics from research directories and optional registry inputs. */
export function buildOverfittingDiagnosticsFromDirectories(
  inputRoot: string,
  outputPath: string,
  io: OverfittingDiagnosticsIo,
  options: {
    generatedAt: string;
    experimentsRoot?: string;
    alpha?: number;
  },
): OverfittingDiagnosticsReport {
  const normalizedInputRoot = normalizeRootPath(inputRoot);
  const normalizedOutputPath = normalizeRootPath(outputPath);
  const experimentsRoot = normalizeRootPath(
    options.experimentsRoot ?? DEFAULT_OVERFITTING_DIAGNOSTICS_EXPERIMENTS_ROOT,
  );

  const summaries = discoverSummariesOrEmpty(normalizedInputRoot, io);
  const experimentRegistry = discoverExperimentRegistry(experimentsRoot, io);
  const parameterSweepConfigCount = countParameterSweepConfigsFromRoot(
    normalizedInputRoot,
    io,
  );
  const configCount = resolveConfigCount({
    experimentRegistry,
    parameterSweepConfigCount,
    strategyFamilyCount: summaries.length,
  });
  const { report: significanceReport, significancePath } =
    loadStatisticalSignificanceReport(normalizedInputRoot, io);
  const foldPerformanceMatrix = discoverFoldPerformanceMatrix(normalizedInputRoot, io);

  return buildOverfittingDiagnosticsReport({
    inputRoot: normalizedInputRoot,
    experimentsRoot,
    outputPath: normalizedOutputPath,
    generatedAt: options.generatedAt,
    summaries,
    significanceReport,
    significancePath,
    experimentRegistry,
    configCount,
    foldPerformanceMatrix,
    alpha: options.alpha ?? DEFAULT_MULTIPLE_TESTING_ALPHA,
  });
}

export function serializeOverfittingDiagnosticsReport(
  report: OverfittingDiagnosticsReport,
): string {
  return stableStringify(report);
}
