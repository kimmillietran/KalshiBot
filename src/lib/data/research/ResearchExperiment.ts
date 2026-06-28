import { computeBacktestMetrics } from "@/lib/data/backtesting";
import { BacktestLedger } from "@/lib/data/backtesting/BacktestLedger";
import { BacktestStrategyRunner } from "@/lib/data/backtesting/BacktestStrategyRunner";
import type {
  BacktestEquityPoint,
  ClosedTradeSummary,
} from "@/lib/data/backtesting/metricsTypes";
import type { MarkPrice, TradeFill, TradeSide } from "@/lib/data/backtesting/ledgerTypes";
import { positionKey } from "@/lib/data/backtesting/ledgerTypes";
import { ReplaySession } from "@/lib/data/replay/ReplaySession";
import type { ReplayStepResult } from "@/lib/data/replay/replaySessionTypes";
import { stableStringify } from "@/lib/trading/config/hashConfig";
import type { EvaluationPricingSnapshot } from "@/types/domain/trading";

import {
  ResearchExperimentError,
  ResearchExperimentErrorCode,
} from "./experimentTypes";
import type {
  ResearchExperimentConfiguration,
  ResearchExperimentConfig,
  ResearchExperimentInput,
  ResearchExperimentResult,
  ResearchStrategyConfig,
  RunResearchExperimentInput,
} from "./experimentTypes";

type PositionState = {
  quantity: number;
  averageCostCents: number;
  openedAt: string;
};

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }

  Object.freeze(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreeze(item);
    }
  } else {
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
  }

  return value;
}

function validateStrategyConfig(strategyConfig: ResearchStrategyConfig): void {
  if (
    strategyConfig === null ||
    typeof strategyConfig !== "object" ||
    Array.isArray(strategyConfig)
  ) {
    throw new ResearchExperimentError(
      "strategyConfig must be a plain object",
      ResearchExperimentErrorCode.INVALID_STRATEGY_CONFIG,
    );
  }
}

function validateFillConfig(
  fillConfig: ResearchExperimentConfig["fillConfig"],
): void {
  if (fillConfig.priceSource !== "engine-input-pricing") {
    throw new ResearchExperimentError(
      "fillConfig.priceSource must be engine-input-pricing",
      ResearchExperimentErrorCode.INVALID_FILL_CONFIG,
    );
  }

  if (fillConfig.allowPartialFills !== false) {
    throw new ResearchExperimentError(
      "fillConfig.allowPartialFills must be false",
      ResearchExperimentErrorCode.INVALID_FILL_CONFIG,
    );
  }

  if (
    !Number.isFinite(fillConfig.feeCentsPerContract) ||
    fillConfig.feeCentsPerContract < 0
  ) {
    throw new ResearchExperimentError(
      "fillConfig.feeCentsPerContract must be a non-negative finite number",
      ResearchExperimentErrorCode.INVALID_FILL_CONFIG,
    );
  }
}

function validateConfig(config: ResearchExperimentConfig): void {
  if (!config.experimentId.trim()) {
    throw new ResearchExperimentError(
      "experimentId is required",
      ResearchExperimentErrorCode.INVALID_EXPERIMENT_ID,
    );
  }

  if (!config.strategy) {
    throw new ResearchExperimentError(
      "strategy is required",
      ResearchExperimentErrorCode.MISSING_STRATEGY,
    );
  }

  if (!config.strategy.strategyId.trim()) {
    throw new ResearchExperimentError(
      "strategy.strategyId is required",
      ResearchExperimentErrorCode.INVALID_STRATEGY_ID,
    );
  }

  validateStrategyConfig(config.strategyConfig);

  if (!Number.isFinite(config.initialCashCents) || config.initialCashCents < 0) {
    throw new ResearchExperimentError(
      "initialCashCents must be a non-negative finite number",
      ResearchExperimentErrorCode.INVALID_INITIAL_CASH,
    );
  }

  validateFillConfig(config.fillConfig);
}

function validateInput(input: ResearchExperimentInput): void {
  if (!input.snapshots.length) {
    throw new ResearchExperimentError(
      "At least one historical snapshot is required",
      ResearchExperimentErrorCode.EMPTY_SNAPSHOTS,
    );
  }
}

function markPriceCents(
  pricing: EvaluationPricingSnapshot,
  side: TradeSide,
): number | null {
  const mark = side === "yes" ? pricing.yesMidCents : pricing.noMidCents;
  if (mark !== null) {
    return mark;
  }

  const bid = side === "yes" ? pricing.yesBidCents : pricing.noBidCents;
  const ask = side === "yes" ? pricing.yesAskCents : pricing.noAskCents;
  if (bid !== null && ask !== null) {
    return Math.round((bid + ask) / 2);
  }

  return bid ?? ask;
}

function buildMarkPrices(
  step: ReplayStepResult,
  positions: readonly { ticker: string; side: TradeSide }[],
): MarkPrice[] {
  const pricing = step.engineInput.pricing;
  if (!pricing) {
    return [];
  }

  return positions.flatMap((position) => {
    const priceCents = markPriceCents(pricing, position.side);
    if (priceCents === null) {
      return [];
    }

    return [
      {
        ticker: position.ticker,
        side: position.side,
        priceCents,
      },
    ];
  });
}

function compareFills(left: TradeFill, right: TradeFill): number {
  const timeCompare = Date.parse(left.occurredAt) - Date.parse(right.occurredAt);
  if (timeCompare !== 0) {
    return timeCompare;
  }

  if (left.sourceStepIndex !== right.sourceStepIndex) {
    return left.sourceStepIndex - right.sourceStepIndex;
  }

  return left.fillId.localeCompare(right.fillId);
}

function buildClosedTrades(fills: readonly TradeFill[]): ClosedTradeSummary[] {
  const positions = new Map<string, PositionState>();
  const closedTrades: ClosedTradeSummary[] = [];
  const orderedFills = [...fills].sort(compareFills);

  for (const fill of orderedFills) {
    const key = positionKey(fill.ticker, fill.side);
    const existing = positions.get(key);

    if (fill.action === "buy") {
      if (existing) {
        const totalQuantity = existing.quantity + fill.quantity;
        const weightedCost =
          existing.averageCostCents * existing.quantity +
          fill.priceCents * fill.quantity;
        positions.set(key, {
          quantity: totalQuantity,
          averageCostCents: weightedCost / totalQuantity,
          openedAt: existing.openedAt,
        });
      } else {
        positions.set(key, {
          quantity: fill.quantity,
          averageCostCents: fill.priceCents,
          openedAt: fill.occurredAt,
        });
      }
      continue;
    }

    if (!existing || existing.quantity < fill.quantity) {
      continue;
    }

    const realizedPnlCents =
      (fill.priceCents - existing.averageCostCents) * fill.quantity -
      fill.feeCents;
    const entryNotionalCents = existing.averageCostCents * fill.quantity;
    const exitNotionalCents = fill.priceCents * fill.quantity - fill.feeCents;

    closedTrades.push({
      tradeId: fill.fillId,
      ticker: fill.ticker,
      openedAt: existing.openedAt,
      closedAt: fill.occurredAt,
      realizedPnlCents,
      entryNotionalCents,
      exitNotionalCents,
    });

    const remainingQuantity = existing.quantity - fill.quantity;
    if (remainingQuantity > 0) {
      positions.set(key, {
        ...existing,
        quantity: remainingQuantity,
      });
    } else {
      positions.delete(key);
    }
  }

  return closedTrades;
}

function buildEquityCurve(
  replayResults: readonly ReplayStepResult[],
  fills: readonly TradeFill[],
  initialCashCents: number,
): BacktestEquityPoint[] {
  const fillsByStep = new Map<number, TradeFill[]>();
  for (const fill of fills) {
    const stepFills = fillsByStep.get(fill.sourceStepIndex) ?? [];
    stepFills.push(fill);
    fillsByStep.set(fill.sourceStepIndex, stepFills);
  }

  let ledger = BacktestLedger.create(initialCashCents);
  const equityCurve: BacktestEquityPoint[] = [];

  for (const step of replayResults) {
    const stepFills = fillsByStep.get(step.stepIndex) ?? [];
    for (const fill of [...stepFills].sort(compareFills)) {
      ledger = ledger.recordFill(fill);
    }

    const snapshot = ledger.snapshot();
    const marks = buildMarkPrices(step, snapshot.openPositions);
    const unrealized =
      marks.length > 0
        ? ledger.computeUnrealizedPnL(marks).unrealizedPnLCents
        : 0;

    equityCurve.push({
      stepIndex: step.stepIndex,
      timestamp: step.engineInput.evaluatedAt,
      equityCents: snapshot.cashCents + unrealized,
    });
  }

  return equityCurve;
}

function toConfiguration(
  config: ResearchExperimentConfig,
): ResearchExperimentConfiguration {
  return deepFreeze({
    experimentId: config.experimentId,
    strategyId: config.strategy.strategyId,
    strategyConfig: structuredClone(config.strategyConfig),
    initialCashCents: config.initialCashCents,
    fillConfig: structuredClone(config.fillConfig),
  });
}

/**
 * Runs a configured strategy over historical snapshots through replay,
 * simulated fills, ledger accounting, and metrics summarization.
 */
export function runResearchExperiment(
  params: RunResearchExperimentInput,
): ResearchExperimentResult {
  const { config, input } = params;

  validateConfig(config);
  validateInput(input);

  const replaySession = ReplaySession.create(input.snapshots);
  const { results: replayResults } = replaySession.stepAll();

  const runnerResult = BacktestStrategyRunner.run({
    initialCashCents: config.initialCashCents,
    steps: replayResults,
    strategy: config.strategy,
    fillConfig: config.fillConfig,
  });

  const ledgerSnapshot = runnerResult.ledger.snapshot();
  const equityCurve = buildEquityCurve(
    replayResults,
    ledgerSnapshot.fills,
    config.initialCashCents,
  );
  const closedTrades = buildClosedTrades(ledgerSnapshot.fills);
  const metrics = computeBacktestMetrics({
    equityCurve,
    closedTrades,
  });

  const completedAtStep =
    replayResults.length > 0
      ? replayResults[replayResults.length - 1]!.stepIndex
      : -1;

  return deepFreeze({
    experimentId: config.experimentId,
    strategyId: config.strategy.strategyId,
    completedAtStep,
    replayResults,
    ledger: runnerResult.ledger,
    metrics,
    configuration: toConfiguration(config),
  });
}

export function serializeResearchExperimentResult(
  result: ResearchExperimentResult,
): string {
  return stableStringify({
    experimentId: result.experimentId,
    strategyId: result.strategyId,
    completedAtStep: result.completedAtStep,
    replayResults: [...result.replayResults],
    ledger: result.ledger.snapshot(),
    metrics: result.metrics,
    configuration: result.configuration,
  });
}
