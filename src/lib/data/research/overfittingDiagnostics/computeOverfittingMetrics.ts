import type { ParsedStrategyAggregateSummary } from "../leaderboard/strategyLeaderboardTypes";
import type { StatisticalSignificanceReport } from "../statisticalSignificance/statisticalSignificanceTypes";

import { buildDeflatedSharpeDiagnostic } from "./computeDeflatedSharpe";
import { buildMultipleTestingDiagnostics } from "./computeMultipleTestingAdjustments";
import {
  buildUnavailablePboDiagnostic,
  computePboFromFoldMatrix,
} from "./computePboDiagnostic";
import type {
  BestObservedResult,
  BuildOverfittingDiagnosticsReportInput,
  EvaluationScope,
  OverfittingDiagnosticsReport,
  StrategyFamilyDiagnostics,
} from "./overfittingDiagnosticsTypes";

function buildBestObserved(summary: ParsedStrategyAggregateSummary): BestObservedResult {
  return {
    metric: "totalPnlCents",
    value: summary.performance.totalPnlCents,
    completedMarkets: summary.marketCounts.completed,
  };
}

function resolveRawPValue(
  strategyId: string,
  significanceReport: StatisticalSignificanceReport | null,
): { rawPValue: number | null; pValueSource: StrategyFamilyDiagnostics["pValueSource"] } {
  if (!significanceReport) {
    return { rawPValue: null, pValueSource: "unavailable" };
  }

  const match = significanceReport.strategies.find(
    (strategy) => strategy.strategyId === strategyId,
  );
  if (!match) {
    return { rawPValue: null, pValueSource: "unavailable" };
  }

  return {
    rawPValue: match.meanPnlPValueOneTailed,
    pValueSource: "statistical-significance",
  };
}

function buildStrategyFamilies(
  summaries: readonly ParsedStrategyAggregateSummary[],
  significanceReport: StatisticalSignificanceReport | null,
): StrategyFamilyDiagnostics[] {
  return [...summaries]
    .sort((left, right) => left.strategyId.localeCompare(right.strategyId))
    .map((summary) => {
      const pValue = resolveRawPValue(summary.strategyId, significanceReport);
      return {
        strategyId: summary.strategyId,
        bestObserved: buildBestObserved(summary),
        rawPValue: pValue.rawPValue,
        pValueSource: pValue.pValueSource,
      };
    });
}

function buildEvaluationScope(input: {
  experimentCount: number;
  configCount: number;
  summaries: readonly ParsedStrategyAggregateSummary[];
}): EvaluationScope {
  const strategyIds = [...input.summaries]
    .map((summary) => summary.strategyId)
    .sort((left, right) => left.localeCompare(right));

  return {
    experimentCount: input.experimentCount,
    configCount: input.configCount,
    strategyFamilyCount: strategyIds.length,
    strategyIds,
  };
}

/** Builds the full overfitting diagnostics report from discovered inputs. */
export function buildOverfittingDiagnosticsReport(
  input: BuildOverfittingDiagnosticsReportInput,
): OverfittingDiagnosticsReport {
  const families = buildStrategyFamilies(input.summaries, input.significanceReport);
  const multipleTesting = buildMultipleTestingDiagnostics(
    families,
    input.alpha,
  );

  const backtestOverfitting = input.foldPerformanceMatrix
    ? computePboFromFoldMatrix(input.foldPerformanceMatrix)
    : buildUnavailablePboDiagnostic(
        "No walk-forward fold performance matrix with sufficient folds and variants was found.",
      );

  const deflatedSharpe = buildDeflatedSharpeDiagnostic(
    input.summaries,
    input.configCount,
  );

  const warnings: string[] = [];
  if (!input.significanceReport) {
    warnings.push(
      "statistical-significance.json not found; p-values and multiple-testing adjustments are unavailable.",
    );
  }
  warnings.push(...input.experimentRegistry.warnings);

  return {
    generatedAt: input.generatedAt,
    inputRoot: input.inputRoot,
    experimentsRoot: input.experimentsRoot,
    significancePath: input.significancePath,
    outputPath: input.outputPath,
    evaluationScope: buildEvaluationScope({
      experimentCount: input.experimentRegistry.experimentCount,
      configCount: input.configCount,
      summaries: input.summaries,
    }),
    experimentRegistry: input.experimentRegistry,
    strategyFamilies: families,
    multipleTesting,
    backtestOverfitting,
    deflatedSharpe,
    warnings,
  };
}
