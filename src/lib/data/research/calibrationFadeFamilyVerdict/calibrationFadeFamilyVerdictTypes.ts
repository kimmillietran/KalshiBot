export const CALIBRATION_FADE_FAMILY_VERDICT_FILENAME =
  "calibration-fade-family-verdict.json";
export const DEFAULT_CALIBRATION_FADE_FAMILY_VERDICT_OUTPUT_PATH =
  "data/research-results/calibration-fade-family-verdict.json";
export const DEFAULT_CALIBRATION_FADE_FAMILY_VERDICT_HTML_PATH =
  "data/reports/calibration-fade-family-verdict.html";

export const DEFAULT_CALIBRATION_FADE_FAMILY_ID = "calibration-fade";

/** Strategy families included in the calibration-fade research family. */
export const CALIBRATION_FADE_STRATEGY_FAMILIES = [
  "calibration-no-fade",
  "calibration-yes-fade",
] as const;

export type CalibrationFadeStrategyFamily =
  (typeof CALIBRATION_FADE_STRATEGY_FAMILIES)[number];

export const CALIBRATION_FADE_FAMILY_VERDICT_DISCLAIMER =
  "This report is a precommitted research verdict for the calibration-fade family. It does not authorize live trading. A promoted hypothesis is eligible for deeper execution realism and/or paper shadow trading only.";

export const CALIBRATION_FADE_FAMILY_CAVEATS = [
  "Repeated step-level entries inflate trade count; filled trades are not independent bets.",
  "No per-market position cap, queue position, partial-fill, adverse-selection, or latency modeling.",
  "No live or paper trading evidence.",
  "In-sample positive net replay is not final alpha proof.",
  "M11.7 holdout tests calibration edges, not M11.6 trade-replay PnL; evidence layers are related but not identical.",
] as const;

export const CALIBRATION_FADE_FAMILY_VERDICT_THRESHOLDS = {
  minFilledTrades: 10,
  minUniqueMarkets: 3,
  minUniqueTradingDays: 3,
  maxAverageTradesPerMarketWarning: 10,
  maxDerivedObservationShare: 0.5,
  requirePositiveHoldoutNetEdge: true,
  requireCorrectedPass: true,
  requireClearsMde: true,
} as const;

export type CalibrationFadeFamilyVerdictId =
  | "promote-family"
  | "continue-research"
  | "reject-family"
  | "underpowered"
  | "insufficient-data"
  | "blocked-by-missing-artifacts";

export type CalibrationFadeHypothesisVerdictId =
  | "promote"
  | "reject-cost"
  | "reject-oos"
  | "reject-correction"
  | "reject-power"
  | "reject-fillability"
  | "reject-derived-sensitivity"
  | "underpowered"
  | "insufficient-data"
  | "blocked-by-missing-artifacts";

export const CALIBRATION_FADE_RECOMMENDED_NEXT_ACTIONS = [
  "proceed-to-execution-realism",
  "paper-trade-shadow",
  "continue-collecting-data",
  "tighten-position-model",
  "add-trade-pnl-oos-overlay",
  "pivot-cross-strike-no-arb",
  "pivot-spot-kalshi-lead-lag",
  "pivot-microstructure-order-book",
  "pause-calibration-fade-family",
] as const;

export type CalibrationFadeRecommendedNextAction =
  (typeof CALIBRATION_FADE_RECOMMENDED_NEXT_ACTIONS)[number];

export type CalibrationFadeFamilyVerdictInputPaths = {
  familyId: string;
  hypothesisCandidatesPath: string;
  hypothesisValidationPath: string;
  costAwareAtlasPath: string;
  hypothesisTradeReplayPath: string;
  oosPowerCorrectionPath: string;
  derivedSettlementSensitivityPath: string;
  featureCatalogPath: string;
  researchRecommendationsPath: string;
  hypothesisFailureAnalysisPath: string;
};

export const DEFAULT_CALIBRATION_FADE_FAMILY_VERDICT_INPUT_PATHS: CalibrationFadeFamilyVerdictInputPaths =
  {
    familyId: DEFAULT_CALIBRATION_FADE_FAMILY_ID,
    hypothesisCandidatesPath: "data/research-results/hypothesis-candidates.json",
    hypothesisValidationPath: "data/research-results/hypothesis-validation.json",
    costAwareAtlasPath: "data/research-results/cost-aware-atlas.json",
    hypothesisTradeReplayPath: "data/research-results/hypothesis-trade-replay.json",
    oosPowerCorrectionPath: "data/research-results/oos-power-correction.json",
    derivedSettlementSensitivityPath:
      "data/research-results/derived-settlement-sensitivity.json",
    featureCatalogPath: "data/research-results/feature-catalog.json",
    researchRecommendationsPath: "data/research-results/research-recommendations.json",
    hypothesisFailureAnalysisPath:
      "data/research-results/hypothesis-failure-analysis.json",
  };

export const REQUIRED_CALIBRATION_FADE_FAMILY_ARTIFACT_KEYS = [
  "hypothesisCandidates",
  "hypothesisValidation",
  "costAwareAtlas",
  "hypothesisTradeReplay",
  "oosPowerCorrection",
] as const;

export type RequiredCalibrationFadeArtifactKey =
  (typeof REQUIRED_CALIBRATION_FADE_FAMILY_ARTIFACT_KEYS)[number];

export type CalibrationFadeFamilyVerdictInputStatus = Record<
  RequiredCalibrationFadeArtifactKey | "derivedSettlementSensitivity",
  boolean
>;

export type CalibrationFadeEvidenceLayerStatus = "present" | "missing" | "unknown";

export type CalibrationFadeCostAwareAtlasEvidence = {
  status: CalibrationFadeEvidenceLayerStatus;
  bucketId: string | null;
  groupId: string | null;
  tradeability: string | null;
  grossExpectedValueCents: number | null;
  spreadAdjustedExpectedValueCents: number | null;
  feeAdjustedExpectedValueCents: number | null;
};

export type CalibrationFadeTradeReplayEvidence = {
  status: CalibrationFadeEvidenceLayerStatus;
  filledTradeCount: number;
  skippedTradeCount: number;
  uniqueMarketCount: number;
  uniqueTradingDayCount: number;
  averageTradesPerMarket: number | null;
  maxTradesPerMarket: number;
  grossPnlCents: number;
  netPnlCents: number;
  averageNetPnlCents: number | null;
  winRate: number | null;
  averageFeeCents: number | null;
  skipReasonBreakdown: Record<string, number>;
  dependenceWarnings: readonly string[];
  repeatedEntryWarning: string | null;
};

export type CalibrationFadeOosCalibrationEvidence = {
  status: CalibrationFadeEvidenceLayerStatus;
  holdoutObservedNetEdge: number | null;
  holdoutEffectiveSampleSize: number | null;
  holdoutRawObservationCount: number;
  holdoutIndependentMarketCount: number;
  holdoutMarketDayCount: number;
  minimumDetectableEffect: number | null;
  confidenceInterval95: { lower: number; upper: number } | null;
  passesCorrected: boolean;
  clearsMde: boolean;
  isUnderpowered: boolean;
  correctedPValue: number | null;
  qValue: number | null;
  finalStatisticalVerdict: string | null;
};

export type CalibrationFadePowerEvidence = {
  status: CalibrationFadeEvidenceLayerStatus;
  isUnderpowered: boolean;
  clearsMde: boolean;
  underpoweredReason: string | null;
};

export type CalibrationFadeCorrectionEvidence = {
  status: CalibrationFadeEvidenceLayerStatus;
  passesCorrected: boolean;
  correctionMethod: string | null;
  qValue: number | null;
};

export type CalibrationFadeDerivedSensitivityEvidence = {
  status: CalibrationFadeEvidenceLayerStatus;
  recommendation: string | null;
  derivedObservationShare: number | null;
  deltaRobustness: number | null;
  officialOnlyPasses: boolean | null;
  limitationNote: string | null;
};

export type CalibrationFadeHypothesisGateResults = {
  costAwareReplayPass: boolean;
  fillabilityPass: boolean;
  outOfSamplePass: boolean;
  powerPass: boolean;
  correctionPass: boolean;
  derivedSensitivityPass: boolean;
  allPromotionGatesPass: boolean;
};

export type CalibrationFadeHypothesisVerdictEntry = {
  hypothesisId: string;
  hypothesis: string;
  axisGroupId: string | null;
  bucketIds: readonly string[];
  direction: "over" | "under" | null;
  suggestedStrategyFamily: string;
  robustnessScore: number | null;
  validationPasses: boolean | null;
  verdict: CalibrationFadeHypothesisVerdictId;
  primaryFailureReason: string | null;
  secondaryFailureReasons: readonly string[];
  evidenceSummary: string;
  gateResults: CalibrationFadeHypothesisGateResults;
  costAwareAtlasEvidence: CalibrationFadeCostAwareAtlasEvidence;
  tradeReplayEvidence: CalibrationFadeTradeReplayEvidence;
  oosCalibrationEvidence: CalibrationFadeOosCalibrationEvidence;
  powerEvidence: CalibrationFadePowerEvidence;
  correctionEvidence: CalibrationFadeCorrectionEvidence;
  derivedSensitivityEvidence: CalibrationFadeDerivedSensitivityEvidence;
};

export type CalibrationFadeFamilyVerdictSummary = {
  familyId: string;
  familyVerdict: CalibrationFadeFamilyVerdictId;
  hypothesisCount: number;
  promotedHypothesisCount: number;
  rejectedHypothesisCount: number;
  underpoweredHypothesisCount: number;
  blockedHypothesisCount: number;
  positiveInSampleReplayCount: number;
  positiveHoldoutCount: number;
  correctedPassCount: number;
  clearsMdeCount: number;
  primaryFailureReasonHistogram: Record<string, number>;
  recommendedNextAction: CalibrationFadeRecommendedNextAction;
  missingRequiredArtifacts: readonly string[];
};

export type CalibrationFadeFamilyVerdictReport = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  disclaimer: string;
  caveats: readonly string[];
  inputPaths: CalibrationFadeFamilyVerdictInputPaths;
  inputStatus: CalibrationFadeFamilyVerdictInputStatus;
  thresholds: typeof CALIBRATION_FADE_FAMILY_VERDICT_THRESHOLDS;
  summary: CalibrationFadeFamilyVerdictSummary;
  hypotheses: readonly CalibrationFadeHypothesisVerdictEntry[];
};

export type CalibrationFadeFamilyVerdictIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
};

export class CalibrationFadeFamilyVerdictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalibrationFadeFamilyVerdictError";
  }
}
