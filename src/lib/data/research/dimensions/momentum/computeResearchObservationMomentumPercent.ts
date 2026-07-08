import { computeBtcMomentumPct } from "@/lib/data/strategies/plugin/builtins/strategyDecisionHelpers";
import type { EvaluationCandleSnapshot } from "@/types/domain/trading";

import { DEFAULT_RESEARCH_MOMENTUM_LOOKBACK_BARS } from "./momentumResearchTypes";

/** Canonical research BTC momentum percent (`computeBtcMomentumPct`); see FEATURE_SEMANTICS.md. */
export function computeResearchObservationMomentumPercent(
  candles: readonly EvaluationCandleSnapshot[],
  lookbackBars: number = DEFAULT_RESEARCH_MOMENTUM_LOOKBACK_BARS,
): number | null {
  return computeBtcMomentumPct(candles, lookbackBars);
}
