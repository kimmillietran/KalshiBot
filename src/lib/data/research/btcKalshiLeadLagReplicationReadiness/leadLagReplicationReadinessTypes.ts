import type { LeadLagDiscoveryIo } from "../btcKalshiLeadLagDiscovery/leadLagDiscoveryTypes";
import type { LeadLagStoppingRule } from "../btcKalshiLeadLagEvidenceContract/leadLagEvidenceContractTypes";
import type { LeadLagFrozenCandidateDefinition } from "../btcKalshiLeadLagValidation/leadLagValidationTypes";

export const LEAD_LAG_REPLICATION_READINESS_ANALYSIS_VERSION =
  "btc-kalshi-lead-lag-replication-readiness-v1" as const;

export const LEAD_LAG_REPLICATION_READINESS_PLANNING_METHODOLOGY_VERSION =
  "lead-lag-ess-arrival-rate-v1" as const;

export const LEAD_LAG_REPLICATION_READINESS_DISCLAIMER =
  "M12.8d BTC/Kalshi lead-lag prospective replication readiness is a planning/readiness audit only. "
  + "It does not promote, preregister, freeze, collect new capture, evaluate alternate candidates, "
  + "retune power thresholds, or alter the historical holdout verdict. Historical Runs 1–3 are "
  + "outcome-inspected design/incidence data only; fresh prospective replication N starts at 0.";

export const DEFAULT_LEAD_LAG_REPLICATION_READINESS_JSON_ROOT =
  "data/research-results/btc-kalshi-lead-lag/replication-readiness" as const;
export const DEFAULT_LEAD_LAG_REPLICATION_READINESS_HTML_ROOT =
  "data/reports/btc-kalshi-lead-lag/replication-readiness" as const;
export const LEAD_LAG_REPLICATION_READINESS_JSON_FILENAME =
  "lead-lag-replication-readiness.json" as const;
export const LEAD_LAG_REPLICATION_READINESS_HTML_FILENAME =
  "lead-lag-replication-readiness.html" as const;

export const DEFAULT_CAPTURE_HOUR_SCENARIOS = [24, 48, 72, 96, 120] as const;

export class LeadLagReplicationReadinessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LeadLagReplicationReadinessError";
  }
}

export type LeadLagReplicationReadinessIo = LeadLagDiscoveryIo;

export type LeadLagReplicationReadinessVerdict =
  | "ready-to-freeze"
  | "technically-ready-but-operationally-costly"
  | "blocked";

export type LeadLagReplicationDecisionRequired =
  | "none"
  | "capture-budget-approval"
  | "lineage-repair";

export type LeadLagReplicationRecommendedNextAction =
  | "proceed-to-m12.8e-freeze-after-budget-approval"
  | "repair-lineage-before-freeze"
  | "do-not-proceed-blocked";

export type LeadLagHistoricalRunRole =
  | "train-discovery-design"
  | "validation-narrowing-design"
  | "historical-holdout-design";

export type LeadLagHistoricalIncidenceByRun = {
  runLabel: "run-1-train" | "run-2-validation" | "run-3-holdout";
  runId: string;
  role: LeadLagHistoricalRunRole;
  captureHours: number;
  eligibleCandidateEvents: number;
  uniqueMarkets: number;
  uniqueMarketDays: number;
  uniqueBtcTriggers: number;
  /** ESS under evidence-contract unit semantics — NOT raw quote count. */
  effectiveSampleSize: number;
  eventsPerHour: number;
  marketsPerHour: number;
  essPerHour: number;
  /** Observed primary estimand cents when available (holdout only); planning context. */
  observedPrimaryEffectCents: number | null;
  countsTowardFreshProspectiveN: false;
};

export type LeadLagIncidenceRateScenario = {
  scenarioId: "low-historical-observed-rate" | "pooled-observed-rate" | "high-historical-observed-rate";
  rationale: string;
  essPerHour: number | null;
};

export type LeadLagProjectedHoursToRequiredN = {
  requiredFreshEffectiveN: number;
  lowRate: LeadLagProjectionDetail;
  pooledRate: LeadLagProjectionDetail;
  highRate: LeadLagProjectionDetail;
};

export type LeadLagProjectionDetail = {
  essPerHour: number | null;
  projectedCaptureHours: number | null;
  projectedFourHourRuns: number | null;
  projectedEightHourRuns: number | null;
  unavailableReason: string | null;
};

export type LeadLagCaptureHourScenario = {
  captureHours: number;
  expectedEssLow: number | null;
  expectedEssPooled: number | null;
  expectedEssHigh: number | null;
};

export type LeadLagStorageEstimate = {
  observedBytesByRun: readonly {
    runId: string;
    captureHours: number;
    observedBytes: number | null;
    bytesPerHour: number | null;
    source: "du-metadata" | "unavailable";
  }[];
  pooledBytesPerHour: number | null;
  projectedBytesToRequiredN: {
    lowRate: number | null;
    pooledRate: number | null;
    highRate: number | null;
  };
  extrapolationNote: string;
};

export type LeadLagTechnicalCaptureReadiness = {
  multiRunCaptureIdentity: "available-via-runId-dirs";
  runAggregationPattern: "identity-addressed-cohort-hash-required-at-freeze";
  captureHealthAudit: "available";
  candidateEvaluationMachinery: "available-locked-candidate-only";
  exactRunSetIdentityPrecedent: "calibrationFadeV2CrossRunValidation.runSetHash";
  restartGate: "available";
  settlementRequiredForPrimaryEstimand: false;
  settlementNote: string;
  boundedMemoryProcessing: "streaming-jsonl-analysis-available";
  ready: true;
};

export type LeadLagOperationalBurden = {
  projectedCaptureHoursPooled: number | null;
  projectedEightHourRunsPooled: number | null;
  projectedStorageGiBPooled: number | null;
  processingNote: string;
  burdenClass: "material-multi-session-capture";
};

export type LeadLagPriorHoldoutContext = {
  holdoutIdentity: string;
  holdoutStatisticalVerdict: "underpowered";
  holdoutOverallStatus: "holdout-underpowered";
  recommendedNextActionFromHoldout: "insufficient-holdout-evidence";
  observedPrimaryEffectCents: number;
  executableAskEffectCents: number;
  effectiveSampleSize: number;
  interpretation:
    "historical-evidence-inconclusive-underpowered-with-unfavorable-tiny-sample-point-estimate";
  relabeledAsReject: false;
  relabeledAsSupport: false;
};

export type LeadLagReplicationReadinessReport = {
  generatedAt: string;
  analysisVersion: typeof LEAD_LAG_REPLICATION_READINESS_ANALYSIS_VERSION;
  planningMethodologyVersion: string;
  disclaimer: typeof LEAD_LAG_REPLICATION_READINESS_DISCLAIMER;
  readinessIdentityHash: string;
  lineage: {
    discoveryIdentity: string;
    validationIdentity: string;
    holdoutIdentity: string;
    evidenceContractIdentity: string;
    candidateId: string;
    lockedCandidateDefinitionHash: string;
    splitManifestHash: string;
  };
  lockedCandidate: LeadLagFrozenCandidateDefinition;
  currentStatus: "holdout-underpowered";
  powerContract: {
    alpha: number;
    targetPower: number;
    materialEffectThresholdCents: number;
    outcomeStandardDeviationCents: number;
    requiredEffectiveN: number;
    contractSource: "holdout-bound-evidence-contract";
    mdeRelaxed: false;
    alphaRelaxed: false;
    powerTargetRelaxed: false;
  };
  requiredFreshEffectiveN: number;
  freshProspectiveEffectiveNStartsAt: 0;
  confirmatoryReuseForbiddenForHistoricalRuns: true;
  historicalIncidenceByRun: readonly LeadLagHistoricalIncidenceByRun[];
  pooledIncidence: {
    totalCaptureHours: number;
    totalEffectiveSampleSize: number;
    pooledEssPerHour: number | null;
    totalEligibleEvents: number;
    note: string;
  };
  incidenceVariability: {
    essPerHourByRun: readonly number[];
    minEssPerHour: number | null;
    maxEssPerHour: number | null;
    rangeEssPerHour: number | null;
    heterogeneous: boolean;
    assessment: string;
    forbiddenOptimization:
      "sampling-only-where-signal-historically-looked-profitable";
    allowedOptimization:
      "sampling-where-markets-or-triggers-exist-if-rule-independent-of-outcome-sign";
  };
  incidenceRateScenarios: readonly LeadLagIncidenceRateScenario[];
  captureHourScenarios: readonly LeadLagCaptureHourScenario[];
  projectedHoursToRequiredN: LeadLagProjectedHoursToRequiredN;
  estimatedStorageRequirement: LeadLagStorageEstimate;
  recommendedStoppingRule: LeadLagStoppingRule;
  optionalStoppingRejected: true;
  priorHoldoutContext: LeadLagPriorHoldoutContext;
  technicalCaptureReadiness: LeadLagTechnicalCaptureReadiness;
  operationalBurden: LeadLagOperationalBurden;
  replicationReadiness: LeadLagReplicationReadinessVerdict;
  decisionRequired: LeadLagReplicationDecisionRequired;
  recommendedNextAction: LeadLagReplicationRecommendedNextAction;
  quarantine: {
    promotionArtifactCreated: false;
    preregistrationArtifactCreated: false;
    frozenHypothesisCreated: false;
    captureStarted: false;
    liveOrdersExecuted: false;
    alternateCandidateEvaluated: false;
    historicalVerdictAltered: false;
    historicalNCountedAsFreshEvidence: false;
  };
  outputPaths: {
    outputPath: string;
    htmlOutputPath: string;
  };
  warnings: readonly string[];
};

export type LeadLagReplicationReadinessConfig = {
  discoveryIdentityHash: string;
  discoveryReportPath: string | null;
  validationIdentityHash: string;
  validationReportPath: string | null;
  holdoutIdentityHash: string;
  holdoutReportPath: string | null;
  expectedEvidenceContractIdentity: string | null;
  captureRunRoots: readonly string[];
  outputPath: string | null;
  htmlOutputPath: string | null;
};
