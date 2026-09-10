import type { HistoricalReplicaVolatilityWindow } from "../calibrationFadeV2ForwardValidation/calibrationFadeV2ForwardValidationTypes";
import {
  V2_CANDLE_GRANULARITY_MS,
  V2_REQUIRED_CLOSE_COUNT,
} from "../calibrationFadeV2ForwardValidation/calibrationFadeV2ForwardValidationTypes";
import { assessCandleWindowContiguity } from "./assessCandleWindowContiguity";
import type { CandleWindowContiguityAssessment } from "./completedCandleWindowIntegrityTypes";

/**
 * Read-only contiguity diagnostic for a frozen v2 historical-replica window.
 *
 * Uses selectedOpenTimeMs (exchange open times). Does not recompute volatility,
 * eligibility, candidate membership, or classification. The assessment is
 * explicitly informationalOnly.
 */
export function diagnoseFrozenV2VolatilityWindowContiguity(
  window: Pick<HistoricalReplicaVolatilityWindow, "selectedOpenTimeMs" | "available">,
  options?: { expectedIntervalMs?: number },
): CandleWindowContiguityAssessment {
  return assessCandleWindowContiguity({
    timestampsMs: window.selectedOpenTimeMs,
    expectedIntervalMs: options?.expectedIntervalMs ?? V2_CANDLE_GRANULARITY_MS,
    timestampKind: "open-time",
    minimumCandleCount: window.available ? V2_REQUIRED_CLOSE_COUNT : 2,
  });
}
