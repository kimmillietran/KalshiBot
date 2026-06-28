import { BacktestLedger } from "./BacktestLedger";
import type {
  BacktestEquityPoint,
  ClosedTradeSummary,
  ComputeBacktestMetricsInput,
} from "./metricsTypes";
import type { MarkPrice, TradeFill, TradeSide } from "./ledgerTypes";
import { positionKey } from "./ledgerTypes";
import type { ReplayStepResult } from "@/lib/data/replay/replaySessionTypes";
import type { EvaluationPricingSnapshot } from "@/types/domain/trading";

type PositionState = {
  quantity: number;
  averageCostCents: number;
  openedAt: string;
};

export type DeriveBacktestMetricsInputArgs = {
  replayResults: readonly ReplayStepResult[];
  fills: readonly TradeFill[];
  initialCashCents: number;
  periodsPerYear?: number;
  riskFreeRatePerPeriod?: number;
};

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

/** Maps replay output and ledger fills into metrics input without duplicating summary math. */
export function deriveBacktestMetricsInput(
  args: DeriveBacktestMetricsInputArgs,
): ComputeBacktestMetricsInput {
  const equityCurve = buildEquityCurve(
    args.replayResults,
    args.fills,
    args.initialCashCents,
  );
  const closedTrades = buildClosedTrades(args.fills);

  return {
    equityCurve,
    closedTrades,
    periodsPerYear: args.periodsPerYear,
    riskFreeRatePerPeriod: args.riskFreeRatePerPeriod,
  };
}
