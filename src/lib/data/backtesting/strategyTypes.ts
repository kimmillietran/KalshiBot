import type { ReplayStepResult } from "@/lib/data/replay/replaySessionTypes";
import type { StrategyDecisionTraceEntry } from "@/lib/data/research/decisionTrace";

import type { BacktestLedger } from "./BacktestLedger";
import type { FillCostBreakdown, ResearchCostModelConfig } from "./costModel";
import type { BacktestIntentRejectionCode } from "./errors";
import type { LedgerSnapshot, OpenPosition, TradeAction, TradeSide } from "./ledgerTypes";

export type BacktestFillSimulationConfig = {
  feeCentsPerContract: number;
  allowPartialFills: false;
  priceSource: "engine-input-pricing";
};

export const DEFAULT_BACKTEST_FILL_SIMULATION_CONFIG: BacktestFillSimulationConfig = {
  feeCentsPerContract: 0,
  allowPartialFills: false,
  priceSource: "engine-input-pricing",
};

export type BacktestStrategyContext = {
  stepIndex: number;
  ledgerSnapshot: LedgerSnapshot;
  openPositions: readonly OpenPosition[];
  cashCents: number;
};

export type TradeIntent = {
  ticker: string;
  side: TradeSide;
  action: TradeAction;
  quantity: number;
  limitPriceCents: number;
  reason: string;
};

export type SimulatedFill = {
  fillId: string;
  intentId: string;
  ticker: string;
  side: TradeSide;
  action: TradeAction;
  /** Gross execution price before fees and spread/slippage. */
  priceCents: number;
  quantity: number;
  feeCents: number;
  spreadSlippageCents: number;
  executionCost: FillCostBreakdown;
  occurredAt: string;
  sourceStepIndex: number;
  reason: string;
};

export type RejectedTradeIntent = {
  intentId: string;
  intent: TradeIntent;
  code: BacktestIntentRejectionCode;
  reason: string;
};

export interface BacktestStrategy {
  strategyId: string;
  decide(
    step: ReplayStepResult,
    context: BacktestStrategyContext,
  ): TradeIntent[];
}

export type BacktestStepRunnerResult = {
  stepIndex: number;
  intents: readonly TradeIntent[];
  acceptedFills: readonly SimulatedFill[];
  rejectedIntents: readonly RejectedTradeIntent[];
};

export type BacktestStrategyRunInput = {
  initialCashCents: number;
  steps: readonly ReplayStepResult[];
  strategy: BacktestStrategy;
  fillConfig?: BacktestFillSimulationConfig;
  costModelConfig?: ResearchCostModelConfig;
};

export type BacktestStrategyRunResult = {
  strategyId: string;
  ledger: BacktestLedger;
  steps: readonly BacktestStepRunnerResult[];
  decisionTrace: readonly StrategyDecisionTraceEntry[];
};
