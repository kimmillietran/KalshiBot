export const ReplayPricingDiagnosticWarningCode = {
  ALL_ZERO_DECISION_PRICES: "all-zero-decision-prices",
  SOURCE_NONZERO_DECISIONS_ZERO: "source-nonzero-decisions-zero",
  SINGLE_DECISION_MULTIPLE_SOURCE_CANDLES: "single-decision-multiple-source-candles",
  SYNTHESIZED_ZERO_DECISION_FROM_SOURCE: "synthesized-zero-decision-from-source",
  MISSING_PRICE_IN_DECISIONS: "missing-price-in-decisions",
  LEGITIMATE_TERMINAL_ZERO_PRICE: "legitimate-terminal-zero-price",
} as const;

export type ReplayPricingDiagnosticWarningCode =
  (typeof ReplayPricingDiagnosticWarningCode)[keyof typeof ReplayPricingDiagnosticWarningCode];

export type ReplayPricingDiagnosticWarning = {
  code: ReplayPricingDiagnosticWarningCode;
  message: string;
  severity: "warning" | "info";
};

export type DecisionPriceSnapshot = {
  yesBidCents: number;
  yesAskCents: number;
  yesMidCents: number;
};

export type ObservedYesPriceRange = {
  minYesBidCents: number | null;
  maxYesBidCents: number | null;
  minYesAskCents: number | null;
  maxYesAskCents: number | null;
  minYesMidCents: number | null;
  maxYesMidCents: number | null;
};

export type SourceKalshiCandlePriceClassification = {
  missingPriceCandleCount: number;
  synthesizedZeroPriceCandleCount: number;
  legitimateZeroPriceCandleCount: number;
  nonZeroPriceCandleCount: number;
};

export type ReplayPricingDiagnostics = {
  decisionCount: number;
  zeroPriceDecisionCount: number;
  nonZeroPriceDecisionCount: number;
  percentZeroPriceDecisions: number;
  firstDecisionPrice: DecisionPriceSnapshot | null;
  lastDecisionPrice: DecisionPriceSnapshot | null;
  observedYesPriceRange: ObservedYesPriceRange;
  sourceSnapshotYesPriceRange: ObservedYesPriceRange;
  sourceKalshiCandleCount: number;
  currentCandleCount: number | null;
  sourceKalshiCandleClassification: SourceKalshiCandlePriceClassification;
  warnings: readonly ReplayPricingDiagnosticWarning[];
};

export type ReplayPricingDiagnosticsRunSummary = {
  decisionCount: number;
  zeroPriceDecisionCount: number;
  nonZeroPriceDecisionCount: number;
  percentZeroPriceDecisions: number;
  warningCount: number;
  warningCodes: readonly ReplayPricingDiagnosticWarningCode[];
};

export type ComputeReplayPricingDiagnosticsInput = {
  replaySteps: readonly import("@/lib/data/replay/replaySessionTypes").ReplayStepResult[];
  bronzeRecords: readonly import("@/lib/data/types").RawHistoricalRecord[];
};
