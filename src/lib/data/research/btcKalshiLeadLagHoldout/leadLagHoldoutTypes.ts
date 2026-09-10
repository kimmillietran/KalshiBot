import type { LeadLagEventRecord } from "../btcKalshiLeadLagAnalysis/btcKalshiLeadLagAnalysisTypes";
import type { LeadLagResearchSplitManifest } from "../btcKalshiLeadLagDiscovery/leadLagDiscoveryTypes";
import type {
  LeadLagExecutionSemantics,
  LeadLagHoldoutEvidenceContract,
  LeadLagMultiplicityDesign,
} from "../btcKalshiLeadLagEvidenceContract/leadLagEvidenceContractTypes";
import type {
  LeadLagFrozenCandidateDefinition,
  LeadLagLockedHoldoutCandidate,
} from "../btcKalshiLeadLagValidation/leadLagValidationTypes";
import type { LeadLagDiscoveryIo } from "../btcKalshiLeadLagDiscovery/leadLagDiscoveryTypes";

export const LEAD_LAG_HOLDOUT_ANALYSIS_VERSION =
  "btc-kalshi-lead-lag-holdout-v1" as const;

export const DEFAULT_LEAD_LAG_HOLDOUT_JSON_ROOT =
  "data/research-results/btc-kalshi-lead-lag/holdout" as const;
export const DEFAULT_LEAD_LAG_HOLDOUT_HTML_ROOT =
  "data/reports/btc-kalshi-lead-lag/holdout" as const;
export const LEAD_LAG_HOLDOUT_JSON_FILENAME = "lead-lag-holdout.json" as const;
export const LEAD_LAG_HOLDOUT_HTML_FILENAME = "lead-lag-holdout.html" as const;
export const LEAD_LAG_HOLDOUT_EVENTS_FILENAME = "holdout-lead-lag-events.jsonl" as const;
export const LEAD_LAG_HOLDOUT_ANALYSIS_FILENAME =
  "holdout-selected-run-lead-lag-analysis.json" as const;

export const LEAD_LAG_HOLDOUT_DISCLAIMER =
  "M12.8c BTC/Kalshi lead-lag holdout evaluates exactly one validation-locked candidate on the "
  + "untouched HOLDOUT capture under the predeclared M12.8c-prep evidence contract. "
  + "It does not retune parameters, evaluate other validation survivors, rerun the discovery grid, "
  + "promote, preregister, freeze, or start capture.";

export type LeadLagHoldoutStatisticalVerdict =
  | "support"
  | "reject"
  | "inconclusive"
  | "underpowered"
  | "insufficient-incidence"
  | "invalid-evidence"
  | "capture-quality-failure";

export type LeadLagHoldoutOverallStatus =
  | "holdout-support"
  | "holdout-reject"
  | "holdout-inconclusive"
  | "holdout-underpowered"
  | "holdout-insufficient-incidence"
  | "holdout-invalid-evidence"
  | "holdout-capture-quality-failure";

export type LeadLagHoldoutRecommendedNextAction =
  | "proceed-to-promotion-evaluation"
  | "reject-lead-lag-candidate"
  | "insufficient-holdout-evidence"
  | "invalid-holdout-evidence";

export class LeadLagHoldoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LeadLagHoldoutError";
  }
}

export type LeadLagHoldoutIo = LeadLagDiscoveryIo;

export type LeadLagHoldoutLineage = {
  discoveryHypothesisCount: 9600;
  validationShortlistSize: 5;
  lockedCandidateCount: 1;
  holdoutTestCount: 1;
  lineageSummary: "9600 → 5 → 1 → 1";
};

export type LeadLagHoldoutCaptureQuality = {
  captureHealthVerdict: string | null;
  researchAuditVerdict: string | null;
  durationHours: number | null;
  runDurationSeconds: number | null;
  recordsScanned: number;
  btcRecordsScanned: number;
  validBookShare: number | null;
  btcJoinCoverageShare: number | null;
  bidSizeCoverageShare: number | null;
  reconnectCount: number | null;
  sequenceGapCount: number | null;
  captureHealthSource: string;
  qualityFloors: {
    minValidBookShare: number;
    minBtcJoinCoverageShare: number;
  };
  qualityPassed: boolean;
  failureReasons: readonly string[];
};

export type LeadLagHoldoutPowerResult = {
  alpha: number;
  targetPower: number;
  materialEffectThresholdCents: number;
  outcomeStandardDeviationCents: number;
  requiredEvidence: number | null;
  effectiveSampleSize: number;
  minimumDetectableEffect: number | null;
  clearsMde: boolean;
  isUnderpowered: boolean;
  observedPrimaryEffectCents: number | null;
};

export type LeadLagHoldoutCandidateMetrics = {
  lockedCandidateId: string;
  lockedCandidateDefinitionHash: string;
  exactDefinition: LeadLagFrozenCandidateDefinition;
  rawEligibleEventCount: number;
  uniqueBtcTriggerCount: number;
  independentMarketCount: number;
  independentMarketDayCount: number;
  effectiveSampleSize: number;
  diagnosticMidpointEffectCents: number | null;
  meanMidpointEffectCents: number | null;
  primaryEstimand: "signed-yes-mid-response-cents";
  holdoutEffectCents: number | null;
  executableAskEffectCents: number | null;
  executableObservabilityShare: number | null;
  directionalResponseShare: number | null;
  executionObservabilitySatisfied: boolean;
  midpointDistinctFromExecutablePnl: true;
};

export type LeadLagHoldoutReport = {
  generatedAt: string;
  analysisVersion: typeof LEAD_LAG_HOLDOUT_ANALYSIS_VERSION;
  disclaimer: typeof LEAD_LAG_HOLDOUT_DISCLAIMER;
  discoveryIdentity: string;
  validationIdentity: string;
  evidenceContractIdentity: string;
  evidenceContractVersion: string;
  splitManifestHash: string;
  validationContractHash: string;
  lockedCandidateId: string;
  lockedCandidateDefinitionHash: string;
  lockedCandidate: LeadLagLockedHoldoutCandidate;
  holdoutRunId: string;
  holdoutCaptureRunDir: string;
  holdoutArtifactIdentity: string;
  holdoutIdentityHash: string;
  lineage: LeadLagHoldoutLineage;
  splitManifest: LeadLagResearchSplitManifest;
  evidenceContract: LeadLagHoldoutEvidenceContract;
  executionSemantics: LeadLagExecutionSemantics;
  multiplicityDesign: LeadLagMultiplicityDesign;
  captureQuality: LeadLagHoldoutCaptureQuality;
  candidateMetrics: LeadLagHoldoutCandidateMetrics;
  power: LeadLagHoldoutPowerResult;
  feeAssumptions: string;
  holdoutStatisticalVerdict: LeadLagHoldoutStatisticalVerdict;
  holdoutOverallStatus: LeadLagHoldoutOverallStatus;
  recommendedNextAction: LeadLagHoldoutRecommendedNextAction;
  promotionEligibilityNote: string;
  candidatesEvaluatedCount: 1;
  otherValidationSurvivorsInspectedOnHoldout: false;
  searchGridRerun: false;
  parameterRetuningOccurred: false;
  quarantine: {
    promotionArtifactCreated: false;
    preregistrationArtifactCreated: false;
    frozenHypothesisCreated: false;
    captureStarted: false;
    liveOrdersExecuted: false;
  };
  outputPaths: {
    outputPath: string;
    htmlOutputPath: string;
    holdoutAnalysisOutputPath: string;
    holdoutEventsOutputPath: string;
  };
  warnings: readonly string[];
};

export type LeadLagHoldoutConfig = {
  discoveryIdentityHash: string;
  discoveryReportPath: string | null;
  validationIdentityHash: string;
  validationReportPath: string | null;
  expectedSplitManifestHash: string | null;
  expectedValidationContractHash: string | null;
  holdoutCaptureRunDir: string | null;
  /** Optional override — normally derived from validation lock + evidence defaults. */
  outcomeStandardDeviationCents: number | null;
  outputPath: string | null;
  htmlOutputPath: string | null;
};

/** Internal accumulator exported for tests. */
export type LeadLagHoldoutEventStreamStats = {
  events: readonly LeadLagEventRecord[];
};
