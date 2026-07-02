import type { FillCostBreakdown } from "./costModel";

export type TradeSide = "yes" | "no";

export type TradeAction = "buy" | "sell";

/** Caller-supplied simulated fill before ledger assignment of fillId. */
export type TradeFillInput = {
  ticker: string;
  side: TradeSide;
  action: TradeAction;
  priceCents: number;
  quantity: number;
  feeCents: number;
  spreadSlippageCents?: number;
  executionCost?: FillCostBreakdown;
  occurredAt: string;
  sourceStepIndex: number;
};

/** Immutable recorded fill with deterministic ledger-assigned id. */
export type TradeFill = TradeFillInput & {
  fillId: string;
};

export type OpenPosition = {
  ticker: string;
  side: TradeSide;
  quantity: number;
  averageCostCents: number;
};

export type MarkPrice = {
  ticker: string;
  side: TradeSide;
  priceCents: number;
};

export type LedgerSnapshot = {
  initialCashCents: number;
  cashCents: number;
  realizedPnLCents: number;
  fills: readonly TradeFill[];
  openPositions: readonly OpenPosition[];
};

export type UnrealizedPnLResult = {
  unrealizedPnLCents: number;
  marksByPosition: Readonly<Record<string, number>>;
};

export function positionKey(ticker: string, side: TradeSide): string {
  return `${ticker}:${side}`;
}
