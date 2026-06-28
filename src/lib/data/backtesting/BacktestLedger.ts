import { BacktestLedgerError, BacktestLedgerErrorCode } from "./errors";
import type {
  LedgerSnapshot,
  MarkPrice,
  OpenPosition,
  TradeFill,
  TradeFillInput,
  TradeSide,
  UnrealizedPnLResult,
} from "./ledgerTypes";
import { positionKey } from "./ledgerTypes";

function cloneSnapshot(snapshot: LedgerSnapshot): LedgerSnapshot {
  return structuredClone(snapshot);
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

function validateInitialCash(initialCashCents: number): void {
  if (!Number.isFinite(initialCashCents) || initialCashCents < 0) {
    throw new BacktestLedgerError(
      "Initial cash must be a non-negative finite number",
      BacktestLedgerErrorCode.INVALID_INITIAL_CASH,
    );
  }
}

function validateFillInput(fill: TradeFillInput): void {
  if (!fill.ticker.trim()) {
    throw new BacktestLedgerError(
      "Ticker is required",
      BacktestLedgerErrorCode.INVALID_TICKER,
    );
  }

  if (!Number.isInteger(fill.quantity) || fill.quantity <= 0) {
    throw new BacktestLedgerError(
      "Quantity must be a positive integer",
      BacktestLedgerErrorCode.INVALID_QUANTITY,
    );
  }

  if (
    !Number.isInteger(fill.priceCents) ||
    fill.priceCents < 0 ||
    fill.priceCents > 100
  ) {
    throw new BacktestLedgerError(
      "Price cents must be an integer between 0 and 100",
      BacktestLedgerErrorCode.INVALID_PRICE,
    );
  }

  if (!Number.isFinite(fill.feeCents) || fill.feeCents < 0) {
    throw new BacktestLedgerError(
      "Fee cents must be a non-negative finite number",
      BacktestLedgerErrorCode.INVALID_FEE,
    );
  }

  if (!fill.occurredAt.trim() || !Number.isFinite(Date.parse(fill.occurredAt))) {
    throw new BacktestLedgerError(
      "occurredAt must be a valid timestamp",
      BacktestLedgerErrorCode.INVALID_TIMESTAMP,
    );
  }

  if (!Number.isInteger(fill.sourceStepIndex) || fill.sourceStepIndex < 0) {
    throw new BacktestLedgerError(
      "sourceStepIndex must be a non-negative integer",
      BacktestLedgerErrorCode.INVALID_SOURCE_STEP_INDEX,
    );
  }
}

function findPosition(
  positions: readonly OpenPosition[],
  ticker: string,
  side: TradeSide,
): OpenPosition | null {
  return (
    positions.find(
      (position) => position.ticker === ticker && position.side === side,
    ) ?? null
  );
}

function upsertPosition(
  positions: readonly OpenPosition[],
  nextPosition: OpenPosition | null,
  ticker: string,
  side: TradeSide,
): OpenPosition[] {
  const filtered = positions.filter(
    (position) => !(position.ticker === ticker && position.side === side),
  );

  if (nextPosition && nextPosition.quantity > 0) {
    return [...filtered, nextPosition];
  }

  return filtered;
}

/** Deterministic simulated-trade ledger for backtesting replay outputs. */
export class BacktestLedger {
  private readonly snapshotState: LedgerSnapshot;
  private readonly nextFillSequence: number;

  private constructor(snapshot: LedgerSnapshot, nextFillSequence: number) {
    this.snapshotState = snapshot;
    this.nextFillSequence = nextFillSequence;
  }

  static create(initialCashCents: number): BacktestLedger {
    validateInitialCash(initialCashCents);

    return new BacktestLedger(
      {
        initialCashCents,
        cashCents: initialCashCents,
        realizedPnLCents: 0,
        fills: [],
        openPositions: [],
      },
      1,
    );
  }

  snapshot(): LedgerSnapshot {
    return cloneSnapshot(this.snapshotState);
  }

  recordFill(fill: TradeFillInput): BacktestLedger {
    validateFillInput(fill);

    const tradeCostCents = fill.quantity * fill.priceCents;
    const positions = [...this.snapshotState.openPositions];
    const existing = findPosition(positions, fill.ticker, fill.side);

    let cashCents = this.snapshotState.cashCents;
    let realizedPnLCents = this.snapshotState.realizedPnLCents;
    let nextPosition: OpenPosition | null = existing;

    if (fill.action === "buy") {
      const totalDebit = tradeCostCents + fill.feeCents;
      if (cashCents < totalDebit) {
        throw new BacktestLedgerError(
          "Insufficient cash for buy fill",
          BacktestLedgerErrorCode.INSUFFICIENT_CASH,
        );
      }

      cashCents -= totalDebit;

      if (existing) {
        const totalQuantity = existing.quantity + fill.quantity;
        const weightedCost =
          existing.averageCostCents * existing.quantity +
          fill.priceCents * fill.quantity;
        nextPosition = {
          ticker: fill.ticker,
          side: fill.side,
          quantity: totalQuantity,
          averageCostCents: weightedCost / totalQuantity,
        };
      } else {
        nextPosition = {
          ticker: fill.ticker,
          side: fill.side,
          quantity: fill.quantity,
          averageCostCents: fill.priceCents,
        };
      }
    } else {
      if (!existing || existing.quantity < fill.quantity) {
        throw new BacktestLedgerError(
          "Insufficient open position for sell fill",
          BacktestLedgerErrorCode.INSUFFICIENT_POSITION,
        );
      }

      const proceedsCents = tradeCostCents - fill.feeCents;
      cashCents += proceedsCents;
      realizedPnLCents +=
        (fill.priceCents - existing.averageCostCents) * fill.quantity -
        fill.feeCents;

      const remainingQuantity = existing.quantity - fill.quantity;
      nextPosition =
        remainingQuantity > 0
          ? {
              ...existing,
              quantity: remainingQuantity,
            }
          : null;
    }

    const recordedFill: TradeFill = {
      ...fill,
      fillId: `fill-${String(this.nextFillSequence).padStart(6, "0")}`,
    };

    const fills = [...this.snapshotState.fills, recordedFill].sort(compareFills);
    const openPositions = upsertPosition(
      positions,
      nextPosition,
      fill.ticker,
      fill.side,
    );

    return new BacktestLedger(
      {
        ...this.snapshotState,
        cashCents,
        realizedPnLCents,
        fills,
        openPositions,
      },
      this.nextFillSequence + 1,
    );
  }

  computeUnrealizedPnL(marks: readonly MarkPrice[]): UnrealizedPnLResult {
    const marksByPosition: Record<string, number> = {};
    for (const mark of marks) {
      if (
        !Number.isInteger(mark.priceCents) ||
        mark.priceCents < 0 ||
        mark.priceCents > 100
      ) {
        throw new BacktestLedgerError(
          "Mark price cents must be an integer between 0 and 100",
          BacktestLedgerErrorCode.INVALID_PRICE,
        );
      }
      marksByPosition[positionKey(mark.ticker, mark.side)] = mark.priceCents;
    }

    let unrealizedPnLCents = 0;

    for (const position of this.snapshotState.openPositions) {
      const markPriceCents = marksByPosition[positionKey(position.ticker, position.side)];
      if (markPriceCents === undefined) {
        throw new BacktestLedgerError(
          `Missing mark price for ${position.ticker} ${position.side}`,
          BacktestLedgerErrorCode.MISSING_MARK_PRICE,
        );
      }

      unrealizedPnLCents +=
        (markPriceCents - position.averageCostCents) * position.quantity;
    }

    return {
      unrealizedPnLCents,
      marksByPosition,
    };
  }
}
