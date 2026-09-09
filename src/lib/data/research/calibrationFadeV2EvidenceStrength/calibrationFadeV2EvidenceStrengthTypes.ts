import type { CalibrationFadeForwardValidationIo } from "../calibrationFadeForwardValidation/calibrationFadeForwardValidationTypes";

export const CALIBRATION_FADE_V2_EVIDENCE_STRENGTH_ANALYSIS_VERSION =
  "calibration-fade-v2-evidence-strength-v1" as const;

export const V2_EVIDENCE_STRENGTH_JSON_ROOT =
  "data/research-results/calibration-fade-v2/evidence-strength" as const;
export const V2_EVIDENCE_STRENGTH_HTML_ROOT =
  "data/reports/calibration-fade-v2/evidence-strength" as const;
export const V2_EVIDENCE_STRENGTH_JSON_FILENAME = "evidence-strength.json" as const;
export const V2_EVIDENCE_STRENGTH_HTML_FILENAME = "evidence-strength.html" as const;

export const V2_EVIDENCE_STRENGTH_DISCLAIMER =
  "Prospective evidence-strength audit is a read-only methodological layer. "
  + "It does not change the frozen v2 classifier, override the governed verdict, "
  + "tune thresholds, alter candidate membership, or authorize trading. "
  + "The sealed confirmatory cross-run classification remains authoritative under its preregistration.";

export class CalibrationFadeV2EvidenceStrengthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalibrationFadeV2EvidenceStrengthError";
  }
}

export type CalibrationFadeV2EvidenceStrengthIo = CalibrationFadeForwardValidationIo;

export type CalibrationDirectionVerdict =
  | "reject"
  | "support-calibration"
  | "inconclusive"
  | "other";

export type EvaluatedMarketInput = {
  marketTicker: string;
  impliedYesProbability: number;
  settledOutcome: "yes" | "no";
  entryTimestamp: string | null;
  selectedRunId: string;
  calibrationGapSigned: number | null;
};

export type FrozenCalibrationThresholds = {
  minimumIndependentCandidateMarkets: number;
  materialRejectionCalibrationGap: number;
  materialSupportCalibrationGap: number;
  calibrationDirection: "over" | "under";
  minimumSettlementCoverageShare: number;
};

export type ReachableSignedGapState = {
  yesCount: number;
  signedCalibrationGap: number;
  calibrationDirectionVerdict: CalibrationDirectionVerdict;
  probabilityUnderCalibratedNull: number;
};

export type ExactCalibratedNullDistribution = {
  method: "exact-poisson-binomial-enumeration";
  candidateMarketCount: number;
  meanImpliedYesProbability: number;
  probabilityOfReject: number;
  probabilityOfSupportCalibration: number;
  probabilityOfInconclusive: number;
  /**
   * Executable support/contradiction require fee-adjusted returns; the
   * calibration-only Bernoulli null does not model those variables.
   */
  probabilityOfSupportExecutable: null;
  probabilityOfOtherClassification: number;
  probabilitiesSum: number;
  observedYesCount: number;
  observedSignedCalibrationGap: number;
  observedCalibrationDirectionVerdict: CalibrationDirectionVerdict;
  governedInterpretationClassification: string;
};

export type VerdictReachability = {
  inconclusiveBandReachable: boolean;
  rejectBandReachable: boolean;
  supportCalibrationBandReachable: boolean;
  reachableSignedGapValues: readonly ReachableSignedGapState[];
  adjacentAttainableMeanGapDistance: number | null;
  note: string;
};

export type UncertaintySummary = {
  observedSignedCalibrationGap: number | null;
  /** Exact null variance of mean(Y) under independent Bernoulli(p_i). */
  calibratedNullStandardError: number | null;
  calibratedNullVarianceOfMeanYesRate: number | null;
  /** Exact central 95% interval for the signed gap under the calibrated null. */
  calibratedNullExactCentralInterval95: { lower: number; upper: number } | null;
  intervalLabel: "exact-calibrated-null-central-95";
  normalApproximationWarning: string;
};

export type PowerAssumptionRow = {
  assumptionId: string;
  description: string;
  targetDetectableCalibrationGap: number;
  alpha: number;
  targetPower: number;
  baselineBernoulliVariance: number;
  requiredN: number | null;
};

export type PowerAnalysisSummary = {
  method: "normal-approximation-one-tailed-mean-gap";
  note: string;
  rows: readonly PowerAssumptionRow[];
};

export type RunConcentrationRow = {
  selectedRunId: string;
  candidateCount: number;
  candidateShare: number | null;
  meanSignedCalibrationGap: number | null;
};

export type UtcHourConcentrationRow = {
  utcHour: string;
  candidateCount: number;
  candidateShare: number | null;
};

export type CandidateIncidenceSummary = {
  selectedRunCount: number;
  totalCaptureDurationSeconds: number | null;
  totalRecordsScanned: number | null;
  totalQualifyingObservations: number | null;
  totalCandidateEpisodes: number | null;
  independentCandidateMarkets: number;
  candidatesPerCaptureHour: number | null;
  candidatesPerMillionScannedRecords: number | null;
  perRun: readonly {
    selectedRunId: string;
    captureDurationSeconds: number | null;
    recordsScanned: number | null;
    qualifyingObservationCount: number | null;
    candidateEpisodeCount: number | null;
    candidateMarketCount: number;
  }[];
  source: string;
};

export type StoppingRuleAssessment = {
  stoppingRuleStatus: "minimum-floor-only" | "explicit-fixed-n" | "explicit-horizon" | "unknown";
  minimumIndependentCandidateMarkets: number;
  optionalStoppingRiskFlag: boolean;
  rationale: string;
};

export type HistoricalLineageContext = {
  observationCount: number;
  uniqueTradingDays: number;
  passes: boolean;
  robustnessScore: number;
  role: string;
  limitations: readonly string[];
  distinction: string;
};

export type LoroAssessment = {
  loroCurrentlyInformative: boolean;
  selectedRunCount: number;
  candidateContributingRunCount: number;
  minimumCandidatesInLeaveOneOutFold: number | null;
  maximumCandidatesInLeaveOneOutFold: number | null;
  frozenMinimumCandidateCount: number;
  reason: string;
};

export type RecommendedResearchAction =
  | "increase-prospective-evidence-before-economic-interpretation"
  | "repair-prospective-evidence-contract-before-next-family"
  | "adequately-powered-result"
  | "backfill-settlements-before-strength-interpretation";

export type CalibrationFadeV2EvidenceStrengthReport = {
  analysisVersion: typeof CALIBRATION_FADE_V2_EVIDENCE_STRENGTH_ANALYSIS_VERSION;
  disclaimer: typeof V2_EVIDENCE_STRENGTH_DISCLAIMER;
  generatedAt: string;
  sourceRunSetHash: string;
  sourceSettlementSnapshotHash: string;
  sourceEvidenceMode: string;
  sourceCrossRunReportPath: string;
  sourceMarketsPath: string;
  governedInterpretationClassification: string;
  governedRecommendedNextAction: string | null;
  candidateMarketCount: number;
  selectedRunCount: number;
  candidateContributingRunCount: number;
  observedSignedCalibrationGap: number | null;
  frozenThresholds: FrozenCalibrationThresholds;
  verdictReachability: VerdictReachability;
  exactCalibratedNullDistribution: ExactCalibratedNullDistribution;
  uncertainty: UncertaintySummary;
  powerAnalysis: PowerAnalysisSummary;
  runConcentration: readonly RunConcentrationRow[];
  utcHourConcentration: readonly UtcHourConcentrationRow[];
  candidateIncidence: CandidateIncidenceSummary;
  stoppingRuleAssessment: StoppingRuleAssessment;
  historicalLineageContext: HistoricalLineageContext;
  loroAssessment: LoroAssessment;
  methodologyWarnings: readonly string[];
  recommendedResearchAction: RecommendedResearchAction;
  outputPath: string;
  htmlOutputPath: string;
};

export type CalibrationFadeV2EvidenceStrengthConfig = {
  crossRunReportPath: string;
  marketsPath: string | null;
  hypothesisConfigPath: string;
  provenancePath: string;
  outputPath: string | null;
  htmlOutputPath: string | null;
};
