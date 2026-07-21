import type {
  CalibrationFadeCalibrationMetrics,
  CalibrationFadeExecutableMetrics,
  CalibrationFadeForwardValidationIo,
  CalibrationFadeForwardValidationReport,
  CalibrationFadeMarketRecord,
  CalibrationFadeSettlementCoverage,
  FrozenHypothesisSpec,
  HistoricalHypothesisBenchmark,
} from "@/lib/data/research/calibrationFadeForwardValidation/calibrationFadeForwardValidationTypes";

export const CALIBRATION_FADE_CROSS_RUN_VALIDATION_VERSION =
  "calibration-fade-cross-run-validation-v1";

export const DEFAULT_CALIBRATION_FADE_CROSS_RUN_VALIDATION_OUTPUT_PATH =
  "data/research-results/calibration-fade-cross-run-validation.json";
export const DEFAULT_CALIBRATION_FADE_CROSS_RUN_VALIDATION_HTML_PATH =
  "data/reports/calibration-fade-cross-run-validation.html";
export const DEFAULT_CALIBRATION_FADE_CROSS_RUN_MARKETS_PATH =
  "data/research-results/calibration-fade-cross-run-markets.jsonl";
export const DEFAULT_CALIBRATION_FADE_CROSS_RUN_RUNS_PATH =
  "data/research-results/calibration-fade-cross-run-runs.jsonl";
export const DEFAULT_CALIBRATION_FADE_CROSS_RUN_APPEARANCES_PATH =
  "data/research-results/calibration-fade-cross-run-appearances.jsonl";

export const CALIBRATION_FADE_CROSS_RUN_DISCLAIMER =
  "Cross-run frozen calibration-fade validation is offline research only. It aggregates explicitly selected clean forward captures under an unchanged hypothesis. It does not place orders, optimize thresholds, scan parameters, cherry-pick runs, or emit trade recommendations.";

export const CALIBRATION_FADE_CROSS_RUN_CLASSIFICATIONS = [
  "hypothesis-provenance-unavailable",
  "run-set-incompatible",
  "observation-quality-inconclusive",
  "insufficient-forward-events",
  "settlement-coverage-incomplete",
  "cross-run-rejects-hypothesis",
  "cross-run-inconclusive",
  "cross-run-supports-calibration-effect",
  "cross-run-supports-executable-fade",
  "cross-run-contradicts-executability",
] as const;

export type CalibrationFadeCrossRunClassification =
  (typeof CALIBRATION_FADE_CROSS_RUN_CLASSIFICATIONS)[number];

export const CALIBRATION_FADE_CROSS_RUN_RECOMMENDED_ACTIONS = [
  "repair-historical-hypothesis-provenance",
  "repair-run-set-hypothesis-identity",
  "repair-or-replace-invalid-forward-runs",
  "collect-additional-clean-forward-captures",
  "backfill-missing-candidate-settlements",
  "deprioritize-calibration-fade-family",
  "continue-frozen-forward-validation",
  "build-executable-calibration-fade-candidate-dataset",
  "build-paper-execution-harness",
  "retain-calibration-research-but-deprioritize-trading-rule",
] as const;

export type CalibrationFadeCrossRunRecommendedNextAction =
  (typeof CALIBRATION_FADE_CROSS_RUN_RECOMMENDED_ACTIONS)[number];

export class CalibrationFadeCrossRunValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalibrationFadeCrossRunValidationError";
  }
}

export type CalibrationFadeCrossRunValidationIo = CalibrationFadeForwardValidationIo;

export type CalibrationFadeCrossRunValidationConfig = {
  captureRunDirs: readonly string[];
  operatorProvidedRunOrder: readonly string[];
  hypothesisConfigPath: string;
  importsDir: string;
  maximumBtcJoinAgeMs: number;
  marketsOutputPath: string;
  runsOutputPath: string;
  appearancesOutputPath: string;
};

export type CandidateMarketAppearance = CalibrationFadeMarketRecord & {
  selectedRunId: string;
  selectedRunDirectory: string;
  hypothesisConfigurationHash: string;
  targetOutcomeSide: "yes" | "no";
  suppressed: boolean;
  suppressionReason: string | null;
  conflicting: boolean;
  conflictReasons: readonly string[];
};

export type UniqueCandidateMarket = {
  marketTicker: string;
  selectedCanonicalEntry: CandidateMarketAppearance;
  appearances: readonly CandidateMarketAppearance[];
  appearanceCount: number;
  sourceRunIds: readonly string[];
  conflicting: boolean;
  conflictReasons: readonly string[];
  evaluated: boolean;
};

export type CrossRunRunSummary = {
  selectedRunId: string;
  selectedRunDirectory: string;
  captureHealthSource: string | null;
  captureVerdict: string | null;
  /** True only when the run carries a verified capture-research-ready verdict. */
  researchReady: boolean;
  /** Why the run failed the research-ready health gate; null when it passed. */
  failedHealthReason: string | null;
  /** Whether the run contributed any candidate market appearances. */
  contributedCandidates: boolean;
  /** Whether the run's canonical candidates were excluded from outcome evaluation. */
  excludedFromOutcomeEvaluation: boolean;
  /** Malformed candidate/market JSONL rows attributed to this run. */
  candidateParsingErrorCount: number;
  runDurationSeconds: number | null;
  recordsScanned: number;
  btcRecordsScanned: number;
  qualifyingObservationCount: number;
  candidateEpisodeCount: number;
  rawCandidateMarketAppearanceCount: number;
  uniqueCandidateMarketsIntroduced: number;
  duplicateCandidateAppearanceCount: number;
  executableEntryAvailableCount: number;
  settlementJoinedCount: number;
  evaluatedExecutableCandidateCount: number;
  grossReturnCents: number | null;
  feeAdjustedReturnCents: number | null;
  interpretationClassification: string;
  recommendedNextAction: string;
  warnings: readonly string[];
  hypothesisConfigurationHash: string;
};

export type LeaveOneRunOutSensitivity = {
  applicable: boolean;
  folds: readonly {
    excludedRunId: string;
    uniqueCandidateMarketCount: number;
    marketLevelSignedCalibrationGap: number | null;
    feeAdjustedReturnCents: number | null;
    classification: CalibrationFadeCrossRunClassification;
  }[];
};

export type CalibrationFadeCrossRunValidationReport = {
  analysisVersion: string;
  analysisScope: "explicit-cross-run";
  artifactGeneratedAt: string;
  hypothesisId: string;
  hypothesisVersion: string;
  hypothesisConfigurationHash: string;
  runSetHash: string;
  selectedRunIds: readonly string[];
  selectedRunDirectories: readonly string[];
  operatorProvidedRunOrder: readonly string[];
  selectedRunCount: number;
  researchReadyRunCount: number;
  totalCaptureDurationSeconds: number | null;
  totalRecordsScanned: number;
  totalBtcRecordsScanned: number;
  totalQualifyingObservationCount: number;
  totalCandidateEpisodeCount: number;
  rawCandidateMarketAppearanceCount: number;
  duplicateCandidateAppearanceCount: number;
  uniqueCandidateMarketCount: number;
  conflictingCandidateMarketCount: number;
  executableEntryAvailableCount: number;
  settlementJoinedCount: number;
  evaluatedExecutableCandidateCount: number;
  /** Alias of evaluatedExecutableCandidateCount for M13.2A compatibility. */
  executableCandidateCount: number;
  unavailableExecutablePriceCount: number;
  settlementCoverageShare: number | null;
  /** Total malformed candidate/market JSONL rows across all selected runs. */
  candidateParsingErrorCount: number;
  /** Selected runs that failed the research-ready health gate but remain in the ledger. */
  invalidSelectedRuns: readonly {
    selectedRunId: string;
    failedHealthReason: string;
    contributedCandidates: boolean;
    excludedFromOutcomeEvaluation: boolean;
  }[];
  warnings: readonly string[];
  classification: CalibrationFadeCrossRunClassification;
  /** Alias of classification for M13.2 summary naming compatibility. */
  interpretationClassification: CalibrationFadeCrossRunClassification;
  recommendedNextAction: CalibrationFadeCrossRunRecommendedNextAction;
  rationale: string;
  inputArtifactIdentities: readonly Record<string, unknown>[];
  historicalBenchmark: HistoricalHypothesisBenchmark;
  frozenHypothesis: Pick<
    FrozenHypothesisSpec,
    | "hypothesisId"
    | "hypothesisVersion"
    | "description"
    | "configurationHash"
    | "targetOutcomeSide"
    | "calibrationDirection"
    | "eligibilityRules"
    | "minimumEvidenceRequirements"
  >;
  perRunSummaries: readonly CrossRunRunSummary[];
  uniqueMarkets: readonly UniqueCandidateMarket[];
  appearances: readonly CandidateMarketAppearance[];
  calibration: CalibrationFadeCalibrationMetrics;
  executable: CalibrationFadeExecutableMetrics;
  settlementCoverage: CalibrationFadeSettlementCoverage;
  runFunnel: readonly { stageId: string; label: string; count: number }[];
  candidateFunnel: readonly { stageId: string; label: string; count: number }[];
  runContributions: readonly {
    selectedRunId: string;
    shareOfCandidates: number | null;
    shareOfFeeAdjustedReturn: number | null;
    candidatesPerCaptureHour: number | null;
    candidatesPerThousandObservations: number | null;
  }[];
  leaveOneRunOut: LeaveOneRunOutSensitivity;
  missingSettlementMarkets: readonly { marketTicker: string; selectedRunId: string }[];
  recommendedBackfillRunIds: readonly string[];
  outputPath: string;
  htmlOutputPath: string;
  marketsOutputPath: string;
  runsOutputPath: string;
  appearancesOutputPath: string;
  disclaimer: string;
};

export type PerRunAnalysisResult = {
  report: CalibrationFadeForwardValidationReport;
  marketRecords: readonly CalibrationFadeMarketRecord[];
};
