import type { CalibrationFadeForwardValidationIo } from "../calibrationFadeForwardValidation/calibrationFadeForwardValidationTypes";

export const NEXT_FAMILY_READINESS_ANALYSIS_VERSION =
  "next-family-readiness-v3" as const;

export const NEXT_FAMILY_READINESS_JSON_ROOT =
  "data/research-results/next-family-readiness" as const;
export const NEXT_FAMILY_READINESS_HTML_ROOT =
  "data/reports/next-family-readiness" as const;
export const NEXT_FAMILY_READINESS_JSON_FILENAME = "next-family-readiness.json" as const;
export const NEXT_FAMILY_READINESS_HTML_FILENAME = "next-family-readiness.html" as const;

export const NEXT_FAMILY_READINESS_DISCLAIMER =
  "Next-family readiness v3 records completed lead-lag disposition and the TOB-imbalance-v1 "
  + "TRAIN discovery stop (no eligible shortlist), then reassesses research-family priority. "
  + "It does not promote, preregister, freeze, declare alpha, authorize trading, start capture, "
  + "reopen spent lineages, flip imbalance signs, or run new raw historical outcome analyses. "
  + "Exploratory captures remain design data only.";

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
  | "prepare-family-definition"
  | "prepare-new-independent-subfamily-definition"
  | "prepare-data-infrastructure"
  | "defer-and-collect-prospective-lead-lag"
  | "no-family-ready"
  | "insufficient-evidence";

export type RecommendedNextAction =
  | "start-new-family-discovery"
  | "prepare-family-definition"
  | "prepare-new-independent-subfamily-definition"
  | "prepare-data-infrastructure"
  | "defer-and-collect-prospective-lead-lag"
  | "no-action-ready";

export type IndependenceFromCalibrationFade =
  | "high"
  | "medium"
  | "low"
  | "not-established";

export type FamilyMaturity =
  | "mature"
  | "partial"
  | "needs-definition"
  | "not-established"
  | "empirically-investigated";

export type LeadLagLineageDisposition =
  | "deferred-for-prospective-replication"
  | "not-applicable";

export type TobImbalanceLineageDisposition =
  | "stopped-after-train-no-eligible-candidates"
  | "not-applicable";

export type ProspectiveReplicationStatus =
  | "available-but-not-authorized"
  | "not-applicable"
  | "not-established";

export type MicrostructureDataSupportStatus =
  | "available"
  | "partial"
  | "unavailable"
  | "derivable-not-frozen";

export type MicrostructureDataSupportRow = {
  feature:
    | "spread"
    | "bid-ask-depth"
    | "bid-ask-size"
    | "imbalance"
    | "quote-changes"
    | "liquidity-withdrawal"
    | "short-horizon-repricing"
    | "market-state-time-remaining";
  status: MicrostructureDataSupportStatus;
  note: string;
};

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
  /** Present for microstructure readiness inventory (no hypotheses invented). */
  microstructureDataSupport?: readonly MicrostructureDataSupportRow[];
  /** Present when lead-lag M12.8 lineage is bound. */
  empiricalLineageNotes?: readonly string[];
  /**
   * When true, tob-size-imbalance-short-horizon-repricing-v1 TRAIN discovery stopped
   * with zero eligible shortlist. Broad microstructure family is NOT globally disproven.
   */
  tobImbalanceV1StoppedAfterTrain?: boolean;
  /** Broad family may still host future independent subfamilies. */
  broadFamilyNotExhausted?: boolean;
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

export type CompletedLeadLagLineageSummary = {
  family: "btc-kalshi-lead-lag";
  candidateId: string;
  discoveryIdentity: string;
  validationIdentity: string;
  evidenceContractIdentity: string;
  holdoutIdentity: string;
  readinessIdentity: string;
  discoveryHypothesisCount: 9600;
  validationShortlistSize: 5;
  validationSurvivorCount: number;
  lockedCandidateCount: 1;
  holdoutEffectiveSampleSize: number;
  holdoutStatisticalVerdict: "underpowered";
  holdoutOverallStatus: "holdout-underpowered";
  holdoutRecommendedNextAction: "insufficient-holdout-evidence";
  trainLockedEffectCents: number | null;
  validationLockedEffectCents: number | null;
  holdoutLockedEffectCents: number | null;
  prospectiveRequiredFreshEss: number;
  projectedCaptureHoursPooled: number | null;
  projectedEightHourRunsPooled: number | null;
  projectedStorageGiBPooled: number | null;
  burdenClass: string;
  replicationReadiness: string;
  decisionRequired: string;
  lineageSummary: string;
  descriptiveEffectsNote: string;
};

export type CompletedTobImbalanceTrainLineageSummary = {
  family: "spread-liquidity-microstructure";
  subfamily: "tob-size-imbalance-short-horizon-repricing-v1";
  disposition: "stopped-after-train-no-eligible-candidates";
  familyDefinitionIdentity: string;
  evidenceContractIdentity: string;
  splitManifestIdentity: string;
  discoveryIdentity: string;
  trainRunId: string;
  discoveryHypothesisCount: 12;
  directionCount: 1;
  shortlistCount: 0;
  discoveryStatus: "no-candidates-eligible";
  discoveryIsolationStatus: "train-only-discovery";
  reasonNoCandidateAdvanced: string;
  validationAuthorized: false;
  holdoutAuthorized: false;
  promotionAuthorized: false;
  prospectiveFreezeAuthorized: false;
  statisticalRejectClaimed: false;
  broadFamilyGloballyDisproven: false;
  reverseDirectionResurrectionForbidden: true;
  gridMutationForbidden: true;
  lineageSummary: string;
};

export type MicrostructureContaminationReusePolicy = {
  trainRunId: string;
  outcomeConsumedForSubfamily: "tob-size-imbalance-short-horizon-repricing-v1";
  schemaOrFieldAvailabilityReuse: "permitted";
  signFlippedImbalanceAsUntouchedTrain: "forbidden";
  relatedImbalanceDerivedAsUntouchedValidationOrHoldout: "forbidden";
  unrelatedFamilyReuse: string;
  failConservativeWhenAmbiguous: true;
  antiShoppingNote: string;
};

export type NextFamilyReadinessReport = {
  analysisVersion: typeof NEXT_FAMILY_READINESS_ANALYSIS_VERSION;
  disclaimer: typeof NEXT_FAMILY_READINESS_DISCLAIMER;
  generatedAt: string;
  reportIdentityHash: string;
  completedLineage: CompletedLeadLagLineageSummary | null;
  completedTobImbalanceTrainLineage: CompletedTobImbalanceTrainLineageSummary | null;
  historicalVerdict: "underpowered" | null;
  prospectiveReplicationStatus: ProspectiveReplicationStatus;
  prospectiveRequiredFreshEss: number | null;
  operationalBurden: {
    projectedCaptureHoursPooled: number | null;
    projectedEightHourRunsPooled: number | null;
    projectedStorageGiBPooled: number | null;
    burdenClass: string | null;
  } | null;
  lineageDisposition: LeadLagLineageDisposition;
  tobImbalanceLineageDisposition: TobImbalanceLineageDisposition;
  microstructureContaminationReusePolicy: MicrostructureContaminationReusePolicy | null;
  candidateShoppingForbidden: true;
  promotionForbidden: true;
  freezeForbidden: true;
  prospectiveCaptureStarted: false;
  liveTradingImplemented: false;
  familiesEvaluated: readonly ResearchFamilyId[];
  familyReadiness: readonly FamilyReadiness[];
  recommendedFamily: ResearchFamilyId | null;
  recommendedSubfamily: string | null;
  requiresFreshOutcomeIsolation: boolean;
  selectionStatus: SelectionStatus;
  recommendedNextAction: RecommendedNextAction;
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

export type LeadLagLineageBindingConfig = {
  discoveryIdentityHash: string;
  discoveryReportPath: string | null;
  validationIdentityHash: string;
  validationReportPath: string | null;
  holdoutIdentityHash: string;
  holdoutReportPath: string | null;
  readinessIdentityHash: string;
  readinessReportPath: string | null;
};

export type TobImbalanceLineageBindingConfig = {
  discoveryIdentityHash: string;
  discoveryReportPath: string | null;
};

export type NextFamilyReadinessConfig = {
  exploratoryCaptureRunDirs: readonly string[];
  fadeConfirmatoryReportPaths: readonly string[];
  /** Test/diagnostic only — ignored by selection ranking. */
  exploratoryHistoricalReturnProxies: Readonly<Partial<Record<ResearchFamilyId, number>>>;
  /** When set, bind completed M12.8 lineage and record disposition. */
  leadLagLineage: LeadLagLineageBindingConfig | null;
  /** When set, bind completed M13.0b TOB-imbalance TRAIN discovery disposition. */
  tobImbalanceLineage: TobImbalanceLineageBindingConfig | null;
  outputPath: string | null;
  htmlOutputPath: string | null;
};
