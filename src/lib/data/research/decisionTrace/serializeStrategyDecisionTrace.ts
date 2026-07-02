import { stableStringify } from "@/lib/trading/config/hashConfig";

import type {
  StrategyDecisionTraceDocument,
  StrategyDecisionTraceEntry,
} from "./strategyDecisionTraceTypes";

function serializeEntry(entry: StrategyDecisionTraceEntry): Record<string, unknown> {
  return {
    timestamp: entry.timestamp,
    candleIndex: entry.candleIndex,
    strategyId: entry.strategyId,
    marketTicker: entry.marketTicker,
    btcPrice: entry.btcPrice,
    yesBid: entry.yesBid,
    yesAsk: entry.yesAsk,
    yesMid: entry.yesMid,
    ...(entry.probabilityUp !== undefined ? { probabilityUp: entry.probabilityUp } : {}),
    action: entry.action,
    reason: entry.reason,
    metadata: entry.metadata,
  };
}

/** Deterministic JSON serialization for strategy decision traces. */
export function serializeStrategyDecisionTrace(
  document: StrategyDecisionTraceDocument,
): string {
  return stableStringify({
    runId: document.runId,
    strategyId: document.strategyId,
    marketTicker: document.marketTicker,
    entries: [...document.entries].map(serializeEntry),
  });
}
