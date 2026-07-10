export const ORDERBOOK_SEMANTICS_VALIDATION_FILENAME =
  "orderbook-semantics-validation.json";
export const DEFAULT_ORDERBOOK_SEMANTICS_VALIDATION_OUTPUT_PATH =
  "data/research-results/orderbook-semantics-validation.json";
export const DEFAULT_ORDERBOOK_SEMANTICS_VALIDATION_HTML_PATH =
  "data/reports/orderbook-semantics-validation.html";

export const ORDERBOOK_SEMANTICS_VALIDATION_DISCLAIMER =
  "Semantics validation only. No trading decisions are made. No orders are placed. Findings inform capture reconstruction and parity research models only.";

export const ORDERBOOK_SEMANTICS_VALIDATION_CAVEATS = [
  "Conclusions are based on observed capture payloads and local schema/code evidence.",
  "Complement ask derivation is evaluated against replayed bid ladders, not live execution.",
  "Bid-only and synchronized models are research interpretations, not exchange guarantees.",
] as const;

export const RECOMMENDED_NEXT_FIXES = [
  "price-transform-fix",
  "bid-only-parity-model",
  "synchronized-complement-gate",
  "bounded-freshness-gate",
  "rollover-filter",
  "docs-needed",
  "unknown",
] as const;

export type RecommendedNextFix = (typeof RECOMMENDED_NEXT_FIXES)[number];

export const RECOMMENDED_PRICING_MODELS = [
  "complement-derived",
  "bid-only",
  "explicit-ask",
  "synchronized-complement",
] as const;

export type RecommendedPricingModel = (typeof RECOMMENDED_PRICING_MODELS)[number];

export const SEMANTICS_ROOT_CAUSE_CLASSIFICATIONS = [
  "true-arbitrage-like-crossed-binary-book",
  "normal-independent-bid-books",
  "stale-update-artifact",
  "wrong-ask-transform",
  "near-close-rollover-artifact",
  "unknown",
] as const;

export type SemanticsRootCauseClassification =
  (typeof SEMANTICS_ROOT_CAUSE_CLASSIFICATIONS)[number];

export type OrderbookSemanticsValidationConfig = {
  captureRunDir: string;
  marketTicker: string | null;
  maxRawMessages: number;
  sampleLimit: number;
  freshnessWindowMs: number;
};

export const DEFAULT_ORDERBOOK_SEMANTICS_VALIDATION_CONFIG: OrderbookSemanticsValidationConfig =
  {
    captureRunDir: "data/live-capture/forward-quotes",
    marketTicker: null,
    maxRawMessages: Number.POSITIVE_INFINITY,
    sampleLimit: 25,
    freshnessWindowMs: 500,
  };

export type OrderbookSemanticsValidationIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
};

export type RawPayloadFieldSemantics = {
  messagesScanned: number;
  malformedLineCount: number;
  snapshotFieldNames: string[];
  deltaFieldNames: string[];
  priceFieldNames: string[];
  quantityFieldNames: string[];
  sideFieldNames: string[];
  observedSideValues: string[];
  explicitAskFieldsFound: string[];
  explicitBidFieldsFound: string[];
  yesNoBidLadderFieldsFound: string[];
  notes: string[];
};

export type TransformModelId =
  | "complement-derived"
  | "bid-only"
  | "explicit-ask"
  | "synchronized-complement";

export type TransformModelMetrics = {
  modelId: TransformModelId;
  recordsEvaluated: number;
  validRecords: number;
  crossedRecords: number;
  lockedRecords: number;
  missingRecords: number;
  parityUsableRecords: number;
  negativeYesSpreadCount: number;
  negativeNoSpreadCount: number;
  medianYesSignedSpreadCents: number | null;
  medianNoSignedSpreadCents: number | null;
  crossedShare: number | null;
  parityUsableShare: number | null;
};

export type ComplementTransformCheck = {
  recordsWithBothBids: number;
  yesBidPlusNoBidGreaterThan100Count: number;
  yesBidGreaterThanDerivedYesAskCount: number;
  noBidGreaterThanDerivedNoAskCount: number;
  freshDualSideRecordCount: number;
  freshDualSideCrossedCount: number;
  staleOppositeSideCrossedCount: number;
  crossedWhenBothSidesFreshShare: number | null;
  medianOppositeSideGapMs: number | null;
  p90OppositeSideGapMs: number | null;
};

export type EvidenceSummary = {
  localSchemaEvidence: string[];
  codebaseEvidence: string[];
  observedPayloadEvidence: string[];
  documentationEvidence: string[];
  confidence: "high" | "medium" | "low";
};

export type MicrostructureInterpretation = {
  classification: SemanticsRootCauseClassification;
  rationale: string;
};

export type OrderbookSemanticsValidationSummary = {
  captureRunDir: string;
  runId: string | null;
  messagesScanned: number;
  marketsAnalyzed: number;
  explicitAskFieldsFound: boolean;
  yesNoBidLaddersFound: boolean;
  complementTransformSupported: boolean;
  crossedShareComplementModel: number | null;
  crossedShareSynchronizedModel: number | null;
  freshDualSideRecordCount: number;
  freshDualSideCrossedCount: number;
  recommendedPricingModel: RecommendedPricingModel;
  rootCauseClassification: SemanticsRootCauseClassification;
  recommendedNextFix: RecommendedNextFix;
  confidence: EvidenceSummary["confidence"];
};

export type OrderbookSemanticsValidationResult = {
  summary: OrderbookSemanticsValidationSummary;
  rawPayloadSemantics: RawPayloadFieldSemantics;
  transformModels: TransformModelMetrics[];
  complementTransform: ComplementTransformCheck;
  evidence: EvidenceSummary;
  microstructure: MicrostructureInterpretation;
  warnings: string[];
};

export type OrderbookSemanticsValidationReport = OrderbookSemanticsValidationResult & {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  disclaimer: string;
  caveats: readonly string[];
  config: OrderbookSemanticsValidationConfig;
};

export class OrderbookSemanticsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderbookSemanticsValidationError";
  }
}
