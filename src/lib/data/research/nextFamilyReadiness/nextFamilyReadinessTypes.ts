import type { CalibrationFadeForwardValidationIo } from "../calibrationFadeForwardValidation/calibrationFadeForwardValidationTypes";

export const NEXT_FAMILY_READINESS_ANALYSIS_VERSION =
  "next-family-readiness-v1" as const;

export const NEXT_FAMILY_READINESS_JSON_ROOT =
  "data/research-results/next-family-readiness" as const;
export const NEXT_FAMILY_READINESS_HTML_ROOT =
  "data/reports/next-family-readiness" as const;
export const NEXT_FAMILY_READINESS_JSON_FILENAME = "next-family-readiness.json" as const;
export const NEXT_FAMILY_READINESS_HTML_FILENAME = "next-family-readiness.html" as const;

export const NEXT_FAMILY_READINESS_DISCLAIMER =
  "Next-family readiness is an exploratory roadmap audit only. "
  + "It does not promote, preregister, freeze, declare alpha, or authorize trading. "
  + "Any inspected completed captures are exploratory/design data and must NOT be reused "
  + "as prospective confirmatory evidence for a future family.";

export class NextFamilyReadinessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NextFamilyReadinessError";
  }
}

export type NextFamilyReadinessIo = CalibrationFadeForwardValidationIo;

export type ResearchFamilyId =
  | "btc-kalshi-lead-lag"
  | "spread-liquidity-microstructure"
  | "momentum";

export type ReadinessStatus =
  | "ready"
  | "needs-work"
  | "insufficient-evidence"
  | "blocked"
  | "not-established"
  | "needs-definition";

export type SelectionStatus =
  | "recommended-for-discovery"
  | "no-family-ready"
  | "insufficient-evidence";

export type IndependenceFromCalibrationFade =
  | "high"
  | "medium"
  | "low"
  | "not-established";

export type FamilyMaturity =
  | "mature"
  | "partial"
  | "needs-definition"
  | "not-established";

export type ReadinessDimensionId =
  | "familyDefinitionAvailable"
  | "causalFeatureSemanticsEstablished"
  | "historicalDataCoverage"
  | "independentSampleAvailability"
  | "prospectiveCandidateIncidence"
  | "executionObservability"
  | "settlementDependency"
  | "multipleTestingBurden"
  | "trueOosFeasibility"
  | "powerFeasibility"
  | "captureFeasibility"
  | "dataIntegrityDependencies"
  | "existingArtifactProvenance"
  | "implementationMaturity";

export type DimensionAssessment = {
  dimension: ReadinessDimensionId;
  status: ReadinessStatus;
  rationale: string;
};

export type MultiplicityBurden = {
  status: ReadinessStatus;
  returnHorizonCount: number | null;
  responseWindowCount: number | null;
  magnitudeBinCount: number | null;
  timeRemainingBinCount: number | null;
  impliedProbabilityBinCount: number | null;
  atlasAxisGroupCount: number | null;
  momentumBucketCount: number | null;
  note: string;
};

export type CandidateIncidenceAssessment = {
  status: ReadinessStatus;
  source: string;
  exploratoryOnly: true;
  confirmatoryReuseForbidden: true;
  captureHoursObserved: number | null;
  fadeIndependentMarketsPerEightHours: number | null;
  estimatedEligibleObservationsPerCaptureHour: number | null;
  estimatedIndependentMarketsPerDay: number | null;
  expectedCaptureHoursForPlausiblePower: number | null;
  powerAssumptions: string | null;
  note: string;
};

export type ExploratoryCaptureIdentity = {
  runId: string;
  captureRunDir: string;
  role: "exploratory-design-data-not-confirmatory";
  fieldsObserved: readonly string[];
  captureHealthVerdict: string | null;
  durationHours: number | null;
  note: string;
};

export type FamilyInventory = {
  familyId: ResearchFamilyId;
  displayName: string;
  maturity: FamilyMaturity;
  independenceFromCalibrationFade: IndependenceFromCalibrationFade;
  conceptualThesis: string;
  modulePathsPresent: readonly string[];
  modulePathsMissing: readonly string[];
  npmScriptsPresent: readonly string[];
  familyDefinitionAvailable: boolean;
  causalSemanticsNotes: readonly string[];
  executableInputNotes: readonly string[];
  multiplicity: MultiplicityBurden;
  overlapsWithCalibrationFade: readonly string[];
  volatilityContiguityDependency: ReadinessStatus;
  volatilityContiguityNote: string;
};

export type FamilyReadiness = {
  familyId: ResearchFamilyId;
  displayName: string;
  overallStatus: ReadinessStatus;
  maturity: FamilyMaturity;
  independenceFromCalibrationFade: IndependenceFromCalibrationFade;
  dimensions: readonly DimensionAssessment[];
  multiplicity: MultiplicityBurden;
  candidateIncidence: CandidateIncidenceAssessment;
  blockingRequirements: readonly string[];
  inventory: FamilyInventory;
  /**
   * Optional exploratory P&L / return proxy for tests and diagnostics only.
   * Selection MUST NOT rank by this field.
   */
  exploratoryHistoricalReturnProxy: number | null;
};

export type NextFamilyReadinessReport = {
  analysisVersion: typeof NEXT_FAMILY_READINESS_ANALYSIS_VERSION;
  disclaimer: typeof NEXT_FAMILY_READINESS_DISCLAIMER;
  generatedAt: string;
  reportIdentityHash: string;
  familiesEvaluated: readonly ResearchFamilyId[];
  familyReadiness: readonly FamilyReadiness[];
  recommendedFamily: ResearchFamilyId | null;
  selectionStatus: SelectionStatus;
  recommendationRationale: readonly string[];
  blockingRequirements: readonly string[];
  exploratoryDataIdentities: readonly ExploratoryCaptureIdentity[];
  confirmatoryReuseForbidden: true;
  confirmatoryReuseWarning: string;
  whatMustBeFrozenBeforeNewCapture: readonly string[];
  governancePipelineExpectations: readonly string[];
  outputPath: string;
  htmlOutputPath: string;
};

export type NextFamilyReadinessConfig = {
  exploratoryCaptureRunDirs: readonly string[];
  fadeConfirmatoryReportPaths: readonly string[];
  /** Test/diagnostic only — ignored by selection ranking. */
  exploratoryHistoricalReturnProxies: Readonly<Partial<Record<ResearchFamilyId, number>>>;
  /** Test override: force inventory maturity/presence via IO only; kept for config identity. */
  outputPath: string | null;
  htmlOutputPath: string | null;
};
