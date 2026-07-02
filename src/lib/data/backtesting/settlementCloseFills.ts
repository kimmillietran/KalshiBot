import type { ReplayStepResult } from "@/lib/data/replay/replaySessionTypes";
import type { SettlementRecord } from "@/lib/data/types";

import type { OpenPosition, TradeFill, TradeSide } from "./ledgerTypes";
import { positionKey } from "./ledgerTypes";

type PositionState = {
  quantity: number;
  averageCostCents: number;
};

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

function computeOpenPositionsFromFills(
  fills: readonly TradeFill[],
): OpenPosition[] {
  const positions = new Map<string, PositionState>();

  for (const fill of [...fills].sort(compareFills)) {
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
        });
      } else {
        positions.set(key, {
          quantity: fill.quantity,
          averageCostCents: fill.priceCents,
        });
      }
      continue;
    }

    if (!existing || existing.quantity < fill.quantity) {
      continue;
    }

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

  return [...positions.entries()].map(([key, state]) => {
    const [ticker, side] = key.split(":") as [string, TradeSide];
    return {
      ticker,
      side,
      quantity: state.quantity,
      averageCostCents: state.averageCostCents,
    };
  });
}

function settlementExitPriceCents(
  side: TradeSide,
  result: SettlementRecord["result"],
): number {
  return side === result ? 100 : 0;
}

function lastReplayStepByTicker(
  replayResults: readonly ReplayStepResult[],
): Map<string, ReplayStepResult> {
  const byTicker = new Map<string, ReplayStepResult>();

  for (const step of replayResults) {
    byTicker.set(step.sourceTicker, step);
  }

  return byTicker;
}

/**
 * Synthesizes settlement sell fills for open positions so closed-trade metrics
 * include hold-to-settlement activity. Does not mutate ledger equity replay.
 */
export function buildSettlementCloseFills(
  replayResults: readonly ReplayStepResult[],
  fills: readonly TradeFill[],
): TradeFill[] {
  if (fills.length === 0 || replayResults.length === 0) {
    return [];
  }

  const openPositions = computeOpenPositionsFromFills(fills);

  if (openPositions.length === 0) {
    return [];
  }

  const lastStepByTicker = lastReplayStepByTicker(replayResults);
  const settlementFills: TradeFill[] = [];

  for (const position of openPositions) {
    const step = lastStepByTicker.get(position.ticker);
    const settlement = step?.sourceSnapshot.settlement;
    if (!settlement) {
      continue;
    }

    settlementFills.push({
      fillId: `settlement-close-${positionKey(position.ticker, position.side)}`,
      ticker: position.ticker,
      side: position.side,
      action: "sell",
      priceCents: settlementExitPriceCents(position.side, settlement.result),
      quantity: position.quantity,
      feeCents: 0,
      spreadSlippageCents: 0,
      occurredAt: settlement.settledAt,
      sourceStepIndex: step.stepIndex,
    });
  }

  return settlementFills.sort((left, right) => {
    const timeCompare = left.occurredAt.localeCompare(right.occurredAt);
    if (timeCompare !== 0) {
      return timeCompare;
    }

    return left.fillId.localeCompare(right.fillId);
  });
}
