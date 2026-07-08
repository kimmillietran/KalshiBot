import type {
  PnlForensicsFamilyVerdict,
  PnlForensicsGateConfig,
  PnlForensicsHypothesisVerdict,
  PnlForensicsMonthlyPnlEntry,
  PnlForensicsSideBreakdownEntry,
} from "@/lib/data/research/pnlForensicsGate/pnlForensicsGateTypes";

export const DERIVED_MONTH_PNL_SENSITIVITY_FILENAME =
  "derived-month-pnl-sensitivity.json";
export const DEFAULT_DERIVED_MONTH_PNL_SENSITIVITY_OUTPUT_PATH =
  "data/research-results/derived-month-pnl-sensitivity.json";
export const DEFAULT_DERIVED_MONTH_PNL_SENSITIVITY_HTML_OUTPUT_PATH =
  "data/reports/derived-month-pnl-sensitivity.html";

export const DerivedMonthPnlSensitivityErrorCode = {
  INVALID_JSON: "invalid-json",
  INVALID_DOCUMENT: "invalid-document",
  MISSING_INPUT: "missing-input",
} as const;

export type DerivedMonthPnlSensitivityErrorCode =
  (typeof DerivedMonthPnlSensitivityErrorCode)[keyof typeof DerivedMonthPnlSensitivityErrorCode];

export class DerivedMonthPnlSensitivityError extends Error {
  readonly code: DerivedMonthPnlSensitivityErrorCode;

  constructor(message: string, code: DerivedMonthPnlSensitivityErrorCode) {
    super(message);
    this.name = "DerivedMonthPnlSensitivityError";
    this.code = code;
  }
}

export const DERIVED_MONTH_PNL_SENSITIVITY_VARIANT_IDS = [
  "full-corpus",
  "excluding-sensitive-month",
  "sensitive-month-only",
  "official-only",
  "derived-only",
] as const;

export type DerivedMonthPnlSensitivityVariantId =
  (typeof DERIVED_MONTH_PNL_SENSITIVITY_VARIANT_IDS)[number];

export const DERIVED_MONTH_PNL_SENSITIVITY_FAMILY_RECOMMENDATIONS = [
  "proceed-to-trade-pnl-oos",
  "pause-family-derived-month-dependent",
  "collect-more-official-months",
  "reject-family-derived-month-artifact",
  "insufficient-data",
] as const;

export type DerivedMonthPnlSensitivityFamilyRecommendation =
  (typeof DERIVED_MONTH_PNL_SENSITIVITY_FAMILY_RECOMMENDATIONS)[number];

export type DerivedMonthPnlSensitivityConfig = {
  sensitiveMonth: string;
  excludeMonth: string;
  topMonthMaxShareAfterExclusion: number;
  minNonSensitivePositiveMonths: number;
  minUniqueTradingDays: number;
  sensitiveMonthExplainsNearlyAllRetentionShare: number;
  hypothesisSignFlipMajorityShare: number;
  forensicsConfig: PnlForensicsGateConfig;
};

export type DerivedMonthPnlSensitivityInputPaths = {
  hypothesisTradeReplayPath: string;
  pnlForensicsGatePath: string;
  hypothesisCandidatesPath: string;
  hypothesisValidationPath: string;
  oosPowerCorrectionPath: string;
  calibrationFadeFamilyVerdictPath: string;
  derivedSettlementSensitivityPath: string;
  regimeTagsPath: string;
  researchResultsDir: string;
};

export type DerivedMonthPnlSensitivityInputStatus = {
  hypothesisTradeReplayPresent: boolean;
  pnlForensicsGatePresent: boolean;
  hypothesisCandidatesPresent: boolean;
  hypothesisValidationPresent: boolean;
  oosPowerCorrectionPresent: boolean;
  calibrationFadeFamilyVerdictPresent: boolean;
  derivedSettlementSensitivityPresent: boolean;
  regimeTagsPresent: boolean;
  derivedMarketKeysDiscovered: boolean;
  usesSensitiveMonthHeuristic: boolean;
};

export type DerivedMonthPnlSensitivityHypothesisEntry = {
  hypothesisId: string;
  netPnlCents: number;
  grossPnlCents: number;
  feeCents: number;
  filledTradeCount: number;
  uniqueMarketCount: number;
  uniqueTradingDayCount: number;
  forensicsVerdict: PnlForensicsHypothesisVerdict;
};

export type DerivedMonthPnlSensitivityVariantMetrics = {
  variantId: DerivedMonthPnlSensitivityVariantId;
  label: string;
  filterDescription: string;
  netPnlCents: number;
  grossPnlCents: number;
  feeCents: number;
  filledTradeCount: number;
  uniqueMarketCount: number;
  uniqueTradingDayCount: number;
  positiveDayCount: number;
  negativeDayCount: number;
  averageDailyPnlCents: number | null;
  medianDailyPnlCents: number | null;
  topDayShare: number | null;
  topMarketShare: number | null;
  topMonthShare: number | null;
  sideBreakdown: readonly PnlForensicsSideBreakdownEntry[];
  hypothesisBreakdown: readonly DerivedMonthPnlSensitivityHypothesisEntry[];
  monthBreakdown: readonly PnlForensicsMonthlyPnlEntry[];
  forensicsVerdict: PnlForensicsFamilyVerdict;
  positiveCalendarMonthCount: number;
  nonSensitivePositiveMonthCount: number | null;
};

export type DerivedMonthPnlSensitivityVariantDelta = {
  netPnlDeltaCents: number;
  netPnlRetentionShare: number | null;
  tradeCountRetentionShare: number | null;
  marketCountRetentionShare: number | null;
  dayCountRetentionShare: number | null;
  hypothesisSignFlips: number;
  sideSignFlips: number;
  flippedHypothesisIds: readonly string[];
  flippedSideBuckets: readonly string[];
};

export type DerivedMonthPnlSensitivityVariantReport =
  DerivedMonthPnlSensitivityVariantMetrics & {
    deltaVsFullCorpus: DerivedMonthPnlSensitivityVariantDelta | null;
  };

export type DerivedMonthPnlSensitivitySummary = {
  sensitiveMonth: string;
  excludeMonth: string;
  fullCorpusNetPnlCents: number;
  excludingSensitiveMonthNetPnlCents: number | null;
  sensitiveMonthOnlyNetPnlCents: number | null;
  netPnlRetentionShare: number | null;
  hypothesisSignFlips: number;
  sideSignFlips: number;
  flippedHypothesisIds: readonly string[];
  topMonthShareAfterExclusion: number | null;
  familyRecommendation: DerivedMonthPnlSensitivityFamilyRecommendation;
  recommendFullM12: boolean;
  usesSensitiveMonthHeuristic: boolean;
  derivedMarketKeysCount: number;
  m11ForensicsVerdict: string | null;
  m11RecommendedNextAction: string | null;
};

export type DerivedMonthPnlSensitivityReport = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  disclaimer: string;
  caveats: readonly string[];
  config: DerivedMonthPnlSensitivityConfig;
  inputPaths: DerivedMonthPnlSensitivityInputPaths;
  inputStatus: DerivedMonthPnlSensitivityInputStatus;
  summary: DerivedMonthPnlSensitivitySummary;
  variants: readonly DerivedMonthPnlSensitivityVariantReport[];
  warnings: readonly string[];
};

export type DerivedMonthPnlSensitivityIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  readdir: (path: string) => readonly string[];
  isDirectory: (path: string) => boolean;
};
