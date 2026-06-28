import { fnv1a32, stableStringify } from "@/lib/trading/config/hashConfig";

import { MonteCarloAnalysisError, MonteCarloErrorCode } from "./errors";
import type { ClosedTradeSummary } from "./metricsTypes";
import type {
  DeterministicIndexGenerator,
  MonteCarloConfig,
  MonteCarloRun,
  MonteCarloSummary,
  ResampleMode,
  RunMonteCarloAnalysisInput,
} from "./monteCarloTypes";
import { ResampleMode as ResampleModeValues } from "./monteCarloTypes";

export const DEFAULT_DETERMINISTIC_INDEX_GENERATOR: DeterministicIndexGenerator = (
  context,
) => {
  if (context.upperBound <= 0) {
    return 0;
  }

  const digest = fnv1a32(
    `mc:${context.seed}:${context.simulationIndex}:${context.drawIndex}`,
  );
  return parseInt(digest, 16) % context.upperBound;
};

function validateConfig(config: MonteCarloConfig): void {
  if (!Number.isFinite(config.simulationCount) || config.simulationCount <= 0) {
    throw new MonteCarloAnalysisError(MonteCarloErrorCode.ZERO_SIMULATIONS);
  }

  if (
    !Number.isFinite(config.startingEquityCents) ||
    config.startingEquityCents <= 0
  ) {
    throw new MonteCarloAnalysisError(
      MonteCarloErrorCode.INVALID_STARTING_EQUITY,
    );
  }

  if (!Number.isFinite(config.seed)) {
    throw new MonteCarloAnalysisError(MonteCarloErrorCode.INVALID_SEED);
  }

  if (
    config.resampleMode !== ResampleModeValues.BOOTSTRAP &&
    config.resampleMode !== ResampleModeValues.PERMUTATION
  ) {
    throw new MonteCarloAnalysisError(
      MonteCarloErrorCode.UNSUPPORTED_RESAMPLE_MODE,
    );
  }
}

function validateClosedTrades(closedTrades: readonly ClosedTradeSummary[]): void {
  if (closedTrades.length === 0) {
    throw new MonteCarloAnalysisError(MonteCarloErrorCode.EMPTY_TRADE_LIST);
  }

  for (const trade of closedTrades) {
    if (
      !Number.isFinite(trade.realizedPnlCents) ||
      !Number.isFinite(trade.entryNotionalCents) ||
      !Number.isFinite(trade.exitNotionalCents)
    ) {
      throw new MonteCarloAnalysisError(MonteCarloErrorCode.INVALID_TRADE_VALUE);
    }
  }
}

function resolveIndexGenerator(
  indexGenerator: DeterministicIndexGenerator | undefined,
): DeterministicIndexGenerator {
  return indexGenerator ?? DEFAULT_DETERMINISTIC_INDEX_GENERATOR;
}

/** Deterministic bootstrap indices with replacement. */
export function createBootstrapSequence(
  closedTrades: readonly ClosedTradeSummary[],
  seed: number,
  simulationIndex: number,
  indexGenerator: DeterministicIndexGenerator,
): readonly ClosedTradeSummary[] {
  const tradeCount = closedTrades.length;
  const resampled: ClosedTradeSummary[] = [];

  for (let drawIndex = 0; drawIndex < tradeCount; drawIndex += 1) {
    const tradeIndex = indexGenerator({
      seed,
      simulationIndex,
      drawIndex,
      upperBound: tradeCount,
    });
    resampled.push(closedTrades[tradeIndex]!);
  }

  return Object.freeze(resampled);
}

/** Deterministic permutation via Fisher-Yates using injected indices. */
export function createPermutationSequence(
  closedTrades: readonly ClosedTradeSummary[],
  seed: number,
  simulationIndex: number,
  indexGenerator: DeterministicIndexGenerator,
): readonly ClosedTradeSummary[] {
  const tradeCount = closedTrades.length;
  const order = Array.from({ length: tradeCount }, (_, index) => index);

  for (let swapIndex = tradeCount - 1; swapIndex > 0; swapIndex -= 1) {
    const chosenIndex = indexGenerator({
      seed,
      simulationIndex,
      drawIndex: swapIndex,
      upperBound: swapIndex + 1,
    });
    const temp = order[swapIndex]!;
    order[swapIndex] = order[chosenIndex]!;
    order[chosenIndex] = temp;
  }

  return Object.freeze(order.map((index) => closedTrades[index]!));
}

export function resampleTrades(
  closedTrades: readonly ClosedTradeSummary[],
  resampleMode: ResampleMode,
  seed: number,
  simulationIndex: number,
  indexGenerator: DeterministicIndexGenerator,
): readonly ClosedTradeSummary[] {
  if (resampleMode === ResampleModeValues.BOOTSTRAP) {
    return createBootstrapSequence(
      closedTrades,
      seed,
      simulationIndex,
      indexGenerator,
    );
  }

  return createPermutationSequence(
    closedTrades,
    seed,
    simulationIndex,
    indexGenerator,
  );
}

export function simulateEquityCurve(
  resampledTrades: readonly ClosedTradeSummary[],
  startingEquityCents: number,
): {
  endingEquityCents: number;
  maxDrawdownPct: number;
  totalReturnPct: number;
} {
  let equityCents = startingEquityCents;
  let runningPeakCents = startingEquityCents;
  let maxDrawdownPct = 0;

  for (const trade of resampledTrades) {
    equityCents += trade.realizedPnlCents;
    runningPeakCents = Math.max(runningPeakCents, equityCents);

    if (runningPeakCents > 0) {
      const drawdownPct =
        ((runningPeakCents - equityCents) / runningPeakCents) * 100;
      maxDrawdownPct = Math.max(maxDrawdownPct, drawdownPct);
    }
  }

  const totalReturnPct =
    ((equityCents - startingEquityCents) / startingEquityCents) * 100;

  return {
    endingEquityCents: equityCents,
    maxDrawdownPct,
    totalReturnPct,
  };
}

function mean(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(sortedValues: readonly number[], pct: number): number {
  if (sortedValues.length === 0) {
    return 0;
  }

  if (sortedValues.length === 1) {
    return sortedValues[0]!;
  }

  const rank = (pct / 100) * (sortedValues.length - 1);
  const lowerIndex = Math.floor(rank);
  const upperIndex = Math.ceil(rank);

  if (lowerIndex === upperIndex) {
    return sortedValues[lowerIndex]!;
  }

  const weight = rank - lowerIndex;
  return (
    sortedValues[lowerIndex]! * (1 - weight) +
    sortedValues[upperIndex]! * weight
  );
}

function summarizeSimulations(simulations: readonly MonteCarloRun[]): MonteCarloSummary {
  const endingEquities = simulations
    .map((simulation) => simulation.endingEquityCents)
    .sort((left, right) => left - right);
  const drawdowns = simulations.map((simulation) => simulation.maxDrawdownPct);

  return Object.freeze({
    simulations: Object.freeze([...simulations]),
    medianEndingEquity: percentile(endingEquities, 50),
    meanEndingEquity: mean(endingEquities),
    worstEndingEquity: endingEquities[0] ?? 0,
    bestEndingEquity: endingEquities[endingEquities.length - 1] ?? 0,
    percentile5: percentile(endingEquities, 5),
    percentile25: percentile(endingEquities, 25),
    percentile50: percentile(endingEquities, 50),
    percentile75: percentile(endingEquities, 75),
    percentile95: percentile(endingEquities, 95),
    averageDrawdownPct: mean(drawdowns),
    worstDrawdownPct: drawdowns.length === 0 ? 0 : Math.max(...drawdowns),
  });
}

/** Deterministic Monte Carlo resampling and distribution statistics. */
export function runMonteCarloAnalysis(
  input: RunMonteCarloAnalysisInput,
): MonteCarloSummary {
  validateConfig(input.config);
  validateClosedTrades(input.closedTrades);

  const indexGenerator = resolveIndexGenerator(input.indexGenerator);
  const simulations: MonteCarloRun[] = [];

  for (
    let simulationIndex = 0;
    simulationIndex < input.config.simulationCount;
    simulationIndex += 1
  ) {
    const resampledTrades = resampleTrades(
      input.closedTrades,
      input.config.resampleMode,
      input.config.seed,
      simulationIndex,
      indexGenerator,
    );
    const outcome = simulateEquityCurve(
      resampledTrades,
      input.config.startingEquityCents,
    );

    simulations.push(
      Object.freeze({
        simulationIndex,
        endingEquityCents: outcome.endingEquityCents,
        maxDrawdownPct: outcome.maxDrawdownPct,
        totalReturnPct: outcome.totalReturnPct,
      }),
    );
  }

  return summarizeSimulations(simulations);
}

export function serializeMonteCarloSummary(summary: MonteCarloSummary): string {
  return stableStringify(summary);
}
