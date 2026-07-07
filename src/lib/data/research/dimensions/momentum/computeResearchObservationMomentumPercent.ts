import { computeBtcMomentumPct } from "@/lib/data/strategies/plugin/builtins/strategyDecisionHelpers";
import type { EvaluationCandleSnapshot } from "@/types/domain/trading";

import { DEFAULT_RESEARCH_MOMENTUM_LOOKBACK_BARS } from "./momentumResearchTypes";

/** Reuses trading-layer BTC momentum percent over a 15-minute candle window. */
export function computeResearchObservationMomentumPercent(
  candles: readonly EvaluationCandleSnapshot[],
  lookbackBars: number = DEFAULT_RESEARCH_MOMENTUM_LOOKBACK_BARS,
): number | null {
  return computeBtcMomentumPct(candles, lookbackBars);
}
