export {
  COMPLETED_CANDLE_WINDOW_INTEGRITY_VERSION,
  DEFAULT_COMPLETED_CANDLE_EXPECTED_INTERVAL_MS,
  DEFAULT_STRICT_CONTIGUOUS_1M_CONTRACT,
} from "./completedCandleWindowIntegrityTypes";
export type {
  CandleWindowContiguityAssessment,
  CandleWindowContiguityStatus,
  CandleWindowGapLocation,
  StrictContiguousVolatilityWindowContract,
  StrictContiguousWindowRejectionReason,
} from "./completedCandleWindowIntegrityTypes";

export { assessCandleWindowContiguity } from "./assessCandleWindowContiguity";
export {
  buildStrictContiguousVolatilityWindow,
  requireContiguousCompletedCandleWindow,
} from "./buildStrictContiguousVolatilityWindow";
export type { StrictContiguousVolatilityWindow } from "./buildStrictContiguousVolatilityWindow";
export { diagnoseFrozenV2VolatilityWindowContiguity } from "./diagnoseFrozenV2VolatilityWindowContiguity";
