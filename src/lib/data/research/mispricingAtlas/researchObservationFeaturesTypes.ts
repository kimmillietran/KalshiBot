/** Canonical computed feature bag attached to research observations. */
export type ComputedResearchFeatures = {
  timeRemainingMs: number | null;
  moneynessPercent: number | null;
  annualizedVolatility: number | null;
  /** 15-minute BTC percent change; null when candle history is insufficient. */
  momentumPercent: number | null;
  timestampMs: number | null;
  tradingDayUtc: string | null;
  hourUtc: number | null;
  dayOfWeekUtc: number | null;
  sessionBucketCode: number | null;
  weekendFlag: number | null;
};

/** Alias for downstream modules preferring the observation-centric name. */
export type ResearchObservationFeatures = ComputedResearchFeatures;

export type ResearchObservationEnrichmentContext = {
  spotPrice: number | null;
  strikePrice: number | null;
  timeRemainingMs: number | null;
  candles: readonly import("@/types/domain/trading").EvaluationCandleSnapshot[];
  observationTimestampMs?: number | null;
  volatilityLookbackBars?: number;
};
