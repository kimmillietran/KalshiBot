export type StrategyDecisionTraceMetadata = Record<string, unknown>;

export type StrategyDecisionTraceEntry = {
  timestamp: string;
  candleIndex: number;
  strategyId: string;
  marketTicker: string;
  btcPrice: number | null;
  yesBid: number | null;
  yesAsk: number | null;
  yesMid: number | null;
  probabilityUp?: number;
  action: string;
  reason: string;
  metadata: StrategyDecisionTraceMetadata;
};

export type StrategyDecisionTraceDocument = {
  runId: string;
  strategyId: string;
  marketTicker: string;
  entries: readonly StrategyDecisionTraceEntry[];
};

export const STRATEGY_DECISION_TRACE_FILENAME = "decision-trace.json";
