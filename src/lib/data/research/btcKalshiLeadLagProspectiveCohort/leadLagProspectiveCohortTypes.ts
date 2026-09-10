import {
  KNOWN_LEAD_LAG_HOLDOUT_RUN_ID,
  KNOWN_LEAD_LAG_TRAIN_RUN_ID,
  KNOWN_LEAD_LAG_VALIDATION_RUN_ID,
} from "../btcKalshiLeadLagEvidenceContract/leadLagEvidenceContractTypes";

export const LEAD_LAG_PROSPECTIVE_COHORT_ANALYSIS_VERSION =
  "btc-kalshi-lead-lag-prospective-cohort-v1" as const;

export const LEAD_LAG_PER_RUN_EVIDENCE_SCHEMA_VERSION =
  "btc-kalshi-lead-lag-prospective-run-evidence-v1" as const;

export const LEAD_LAG_COLLECTION_PROGRESS_SCHEMA_VERSION =
  "btc-kalshi-lead-lag-prospective-collection-progress-v1" as const;

export const DEFAULT_LEAD_LAG_PROSPECTIVE_RUN_JSON_ROOT =
  "data/research-results/btc-kalshi-lead-lag/prospective-runs" as const;
export const DEFAULT_LEAD_LAG_PROSPECTIVE_COHORT_JSON_ROOT =
  "data/research-results/btc-kalshi-lead-lag/prospective-cohorts" as const;
export const DEFAULT_LEAD_LAG_PROSPECTIVE_COHORT_HTML_ROOT =
  "data/reports/btc-kalshi-lead-lag/prospective-cohorts" as const;

export const LEAD_LAG_PROSPECTIVE_COHORT_JSON_FILENAME =
  "lead-lag-prospective-cohort.json" as const;
export const LEAD_LAG_PROSPECTIVE_COHORT_HTML_FILENAME =
  "lead-lag-prospective-cohort.html" as const;
export const LEAD_LAG_PROSPECTIVE_RUN_EVIDENCE_FILENAME =
  "lead-lag-prospective-run-evidence.json" as const;
export const LEAD_LAG_COLLECTION_PROGRESS_FILENAME =
  "lead-lag-collection-progress.json" as const;

export const LEAD_LAG_PROSPECTIVE_COHORT_DISCLAIMER =
  "M12.8e-prep defines prospective multi-run replication cohort infrastructure only. "
  + "It does not decide whether collection is worthwhile (M12.8d), start capture, freeze, "
  + "preregister, promote, retune thresholds, or evaluate final prospective outcomes.";

/** Historical research lineage runs — never eligible as prospective cohort members. */
export const HISTORICAL_LEAD_LAG_LINEAGE_RUN_IDS = [
  KNOWN_LEAD_LAG_TRAIN_RUN_ID,
  KNOWN_LEAD_LAG_VALIDATION_RUN_ID,
  KNOWN_LEAD_LAG_HOLDOUT_RUN_ID,
] as const;

export type LeadLagHistoricalLineageRole =
  | "discovery-train"
  | "validation"
  | "historical-holdout";

export class LeadLagProspectiveCohortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LeadLagProspectiveCohortError";
  }
}

export type LeadLagProspectiveIo = {
  fileExists: (path: string) => boolean;
  readFile: (path: string) => string;
  writeFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options?: { recursive?: boolean }) => void;
  unlinkFile?: (path: string) => void;
  renameFile?: (from: string, to: string) => void;
};

export type LeadLagIndependentUnitRecord = {
  unitKind: "market-day-block" | "btc-trigger";
  unitId: string;
  marketTicker?: string;
  tradingDayUtc?: string;
  btcTriggerId?: string;
  observedInRunId: string;
  captureWindowStartMs: number | null;
  captureWindowEndMs: number | null;
};

export type LeadLagProspectiveRunEvidence = {
  schemaVersion: typeof LEAD_LAG_PER_RUN_EVIDENCE_SCHEMA_VERSION;
  runId: string;
  captureArtifactIdentity: string;
  candidateDefinitionHash: string;
  prospectiveContractIdentity: string;
  replicationDesignIdentity: string;
  captureDurationHours: number | null;
  captureQuality: {
    passed: boolean;
    verdict: string | null;
    validBookShare: number | null;
    btcJoinCoverageShare: number | null;
    failureReasons: readonly string[];
  };
  btcTriggerCount: number;
  eligibleLockedCandidateEvents: number;
  uniqueMarkets: number;
  uniqueMarketDays: number;
  independentUnitRecords: readonly LeadLagIndependentUnitRecord[];
  /** Per-run ESS contribution before cross-run deduplication. */
  essContribution: number;
  /** Diagnostics retained for audit — not used for fixed-N stopping. */
  midpointDiagnosticCents: number | null;
  executableEvidenceCents: number | null;
  executionObservabilityShare: number | null;
  captureWindowStartMs: number | null;
  captureWindowEndMs: number | null;
  processingMode: "streaming-bounded-memory";
  artifactContentHash: string;
};

export type LeadLagProspectiveCohortManifest = {
  analysisVersion: typeof LEAD_LAG_PROSPECTIVE_COHORT_ANALYSIS_VERSION;
  candidateDefinitionHash: string;
  prospectiveContractIdentity: string;
  replicationDesignIdentity: string;
  memberRunIds: readonly string[];
  memberRunArtifactIdentities: readonly string[];
  cohortCreationSemantics: string;
  statisticalUnitSemantics: string;
  stoppingRuleIdentity: string;
  captureQualityRequirements: readonly string[];
  prospectiveFreezeIdentity: string | null;
  prospectiveFreezeTimestampIso: string | null;
};

export type LeadLagFixedNProgress = {
  stoppingKind: "fixed-n";
  requiredEffectiveN: number;
  currentEffectiveN: number;
  remainingEffectiveN: number;
  fractionComplete: number;
  completed: boolean;
  /** Explicitly excludes effect/p-value driven stopping. */
  effectPeekingForbidden: true;
  pValueStoppingForbidden: true;
};

export type LeadLagCollectionProgressArtifact = {
  schemaVersion: typeof LEAD_LAG_COLLECTION_PROGRESS_SCHEMA_VERSION;
  cohortIdentityHash: string;
  memberRunIds: readonly string[];
  captureHoursCollected: number | null;
  eligibleIncidenceTotal: number;
  rawPerRunEssSum: number;
  deduplicatedCohortEss: number;
  duplicateOrDependentUnitsRemoved: number;
  fixedNProgress: LeadLagFixedNProgress;
  /** Intentionally omits cumulative effect / p-value for operational blinding. */
  effectFieldsPresent: false;
  pValueFieldsPresent: false;
};

export type LeadLagCohortDedupResult = {
  rawPerRunEssSum: number;
  deduplicatedCohortEss: number;
  duplicateOrDependentUnitsRemoved: number;
  retainedMarketDayUnitIds: readonly string[];
  retainedBtcTriggerUnitIds: readonly string[];
  removedUnitIds: readonly string[];
  overlappingTimeRangePairs: readonly {
    leftRunId: string;
    rightRunId: string;
  }[];
};

export type LeadLagProspectiveCohortReport = {
  analysisVersion: typeof LEAD_LAG_PROSPECTIVE_COHORT_ANALYSIS_VERSION;
  disclaimer: typeof LEAD_LAG_PROSPECTIVE_COHORT_DISCLAIMER;
  generatedAt: string;
  cohortIdentityHash: string;
  manifest: LeadLagProspectiveCohortManifest;
  admittedRuns: readonly LeadLagProspectiveRunEvidence[];
  rejectedAdmissions: readonly {
    runId: string | null;
    reason: string;
  }[];
  dedup: LeadLagCohortDedupResult;
  collectionProgress: LeadLagCollectionProgressArtifact;
  finalEvaluationBoundary: {
    status: "not-evaluated";
    note: string;
  };
  quarantine: {
    promotionArtifactCreated: false;
    preregistrationArtifactCreated: false;
    prospectiveFreezeCreated: false;
    captureStarted: false;
    liveOrdersExecuted: false;
    historicalRunsAdmittedAsProspective: false;
    thresholdsRetuned: false;
    candidateChanged: false;
  };
  outputPath: string;
  htmlOutputPath: string;
  progressOutputPath: string;
};

export type LeadLagProspectiveCohortConfig = {
  candidateDefinitionHash: string;
  prospectiveContractIdentity: string;
  replicationDesignIdentity: string;
  stoppingRuleIdentity: string;
  requiredEffectiveN: number;
  /** Synthetic/generic freeze binding — null means no freeze yet (pre-freeze runs rejected). */
  prospectiveFreezeIdentity: string | null;
  prospectiveFreezeTimestampIso: string | null;
  memberEvidencePaths: readonly string[];
  outputPath: string | null;
  htmlOutputPath: string | null;
  progressOutputPath: string | null;
};
