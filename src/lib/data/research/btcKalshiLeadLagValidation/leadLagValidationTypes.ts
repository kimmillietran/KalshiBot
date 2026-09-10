import type { LeadLagDiscoveryCandidate, LeadLagDiscoveryIo, LeadLagGovernedDiscoveryReport, LeadLagResponseDirection, LeadLagResearchSplitManifest } from "../btcKalshiLeadLagDiscovery/leadLagDiscoveryTypes";

export const LEAD_LAG_VALIDATION_ANALYSIS_VERSION =
  "btc-kalshi-lead-lag-validation-v1" as const;
export const LEAD_LAG_VALIDATION_CONTRACT_VERSION =
  "m12.8b-lead-lag-validation-contract-v1" as const;
export const LEAD_LAG_VALIDATION_TIE_BREAK_VERSION =
  "m12.8b-lead-lag-validation-tie-break-v1" as const;

export const DEFAULT_LEAD_LAG_VALIDATION_JSON_ROOT =
  "data/research-results/btc-kalshi-lead-lag/validation";
export const DEFAULT_LEAD_LAG_VALIDATION_HTML_ROOT =
  "data/reports/btc-kalshi-lead-lag/validation";
export const LEAD_LAG_VALIDATION_JSON_FILENAME = "lead-lag-validation.json";
export const LEAD_LAG_VALIDATION_HTML_FILENAME = "lead-lag-validation.html";
export const LEAD_LAG_VALIDATION_EVENTS_FILENAME = "validation-lead-lag-events.jsonl";
export const LEAD_LAG_VALIDATION_ANALYSIS_FILENAME =
  "validation-selected-run-lead-lag-analysis.json";

export const LEAD_LAG_VALIDATION_DISCLAIMER =
  "M12.8b BTC/Kalshi lead-lag validation is candidate narrowing only. "
  + "It analyzes the reserved VALIDATION capture against the exact M12.8a discovery shortlist. "
  + "It does not retune parameters, read HOLDOUT lead-lag outcomes, claim final OOS significance, "
  + "promote, preregister, freeze, or start capture. All captures remain exploratory-design-data-not-confirmatory.";

export type LeadLagValidationCandidateStatus =
  | "validated"
  | "validation-failed"
  | "underpowered-for-validation"
  | "insufficient-validation-incidence"
  | "invalid-evidence";

export type LeadLagValidationOverallStatus =
  | "one-candidate-locked-for-holdout"
  | "no-candidate-survived"
  | "invalid-validation-run";

export class LeadLagValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LeadLagValidationError";
  }
}

/**
 * Fixed BEFORE reading validation outcomes.
 *
 * Rationale:
 * - minEligibleMarketTriggers=8: below typical train shortlist n (~17–24) but enough to observe sign;
 *   does not pretend TRAIN effect size is truth.
 * - minIndependentMarkets=2: reject single-market flukes.
 * - minIndependentMarketDays=1: this validation capture is one calendar day by design.
 * - minAbsMedianMidResponseCents=0.5: non-trivial vs ~0 noise; not a TRAIN-magnitude clone requirement.
 * - minExecutableObservabilityShare=0.05: require some executable-side visibility without P&L claims.
 * - requireSameSignAsTrain: directional replication of the discovery-declared direction.
 * - Validation pass is NOT p<0.05; HOLDOUT remains reserved for final OOS statistics (#67).
 */
export type LeadLagValidationContract = {
  contractVersion: typeof LEAD_LAG_VALIDATION_CONTRACT_VERSION;
  tieBreakVersion: typeof LEAD_LAG_VALIDATION_TIE_BREAK_VERSION;
  minEligibleMarketTriggers: number;
  minIndependentMarkets: number;
  minIndependentMarketDays: number;
  minAbsMedianMidResponseCents: number;
  minExecutableObservabilityShare: number;
  requireSameSignAsTrain: true;
  requireExactDiscoveryDefinitions: true;
  maxLockedCandidates: 1;
  minValidBookShare: number;
  minBtcJoinCoverageShare: number;
  rationale: readonly string[];
};

export const DEFAULT_LEAD_LAG_VALIDATION_CONTRACT: LeadLagValidationContract = {
  contractVersion: LEAD_LAG_VALIDATION_CONTRACT_VERSION,
  tieBreakVersion: LEAD_LAG_VALIDATION_TIE_BREAK_VERSION,
  minEligibleMarketTriggers: 8,
  minIndependentMarkets: 2,
  minIndependentMarketDays: 1,
  minAbsMedianMidResponseCents: 0.5,
  minExecutableObservabilityShare: 0.05,
  requireSameSignAsTrain: true,
  requireExactDiscoveryDefinitions: true,
  maxLockedCandidates: 1,
  minValidBookShare: 0.9,
  minBtcJoinCoverageShare: 0.9,
  rationale: [
    "Contract fixed before validation outcome access.",
    "Same directional sign as TRAIN is required; TRAIN magnitude is not required to reproduce.",
    "Adequate independent sample support is required; underpowered is distinct from directional failure.",
    "Executable observability is required separately from midpoint diagnostics.",
    "Pass is candidate narrowing, not BY-FDR / final OOS / promotion.",
    "At most one candidate is locked for holdout via predeclared tie-break (not max observed effect).",
  ],
};

export type LeadLagValidationIo = LeadLagDiscoveryIo;

export type LeadLagFrozenCandidateDefinition = {
  candidateId: string;
  hypothesisId: string;
  discoveryRank: number;
  direction: LeadLagResponseDirection;
  btcMoveHorizonMs: number;
  responseWindowMs: number;
  btcMagnitudeBin: string;
  timeRemainingBin: string;
  impliedProbabilityBin: string;
  trainEligibleMarketTriggerCount: number;
  trainIndependentMarketCount: number;
  trainIndependentMarketDayCount: number;
  trainMedianSignedMidResponseCents: number | null;
  trainExecutableObservabilityShare: number | null;
  trainUniqueBtcTriggerCount: number;
};

export type LeadLagValidationCandidateResult = {
  candidateId: string;
  hypothesisId: string;
  exactDefinition: LeadLagFrozenCandidateDefinition;
  trainSummaryReference: {
    discoveryIdentityHash: string;
    discoveryRank: number;
    trainEligibleMarketTriggerCount: number;
    trainMedianSignedMidResponseCents: number | null;
  };
  validationEventCount: number;
  uniqueBtcTriggerCount: number;
  independentMarketCount: number;
  independentMarketDayCount: number;
  midpointResponseCents: number | null;
  meanMidpointResponseCents: number | null;
  directionalResponseShare: number | null;
  executableObservabilityShare: number | null;
  executableAskResponseCents: number | null;
  trainEffectSign: -1 | 0 | 1 | null;
  validationEffectSign: -1 | 0 | 1 | null;
  directionalConsistency: "same-sign" | "opposite-sign" | "zero-or-undefined" | "not-evaluable";
  validationStatus: LeadLagValidationCandidateStatus;
  rationale: readonly string[];
};

export type LeadLagLockedHoldoutCandidate = {
  candidateId: string;
  hypothesisId: string;
  exactDefinition: LeadLagFrozenCandidateDefinition;
  lockReason: readonly string[];
  tieBreakScoreComponents: Record<string, number | string>;
};

export type LeadLagValidationReport = {
  generatedAt: string;
  analysisVersion: typeof LEAD_LAG_VALIDATION_ANALYSIS_VERSION;
  disclaimer: typeof LEAD_LAG_VALIDATION_DISCLAIMER;
  discoveryIdentity: string;
  discoveryAnalysisVersion: string;
  discoveryIsolationStatus: string;
  discoveryHypothesisCount: number;
  discoveryMultiplicityDeclaration: string;
  splitManifestHash: string;
  splitManifest: LeadLagResearchSplitManifest;
  validationContract: LeadLagValidationContract;
  validationContractHash: string;
  validationIdentityHash: string;
  validationRunId: string;
  validationCaptureRunDir: string;
  validationArtifactIdentity: {
    captureRunId: string;
    identityHash: string | null;
    nativeCaptureVerdict: string | null;
    researchAuditVerdict: string | null;
    validBookShare: number | null;
    btcJoinCoverageShare: number | null;
    bidSizeCoverageShare: number | null;
    runDurationSeconds: number | null;
    reconnectCount: number | null;
    sequenceGapCount: number | null;
    captureHealthSource: string;
  };
  holdoutRunId: string;
  holdoutRole: "holdout";
  holdoutOutcomeAccessed: false;
  incidence: {
    validationCaptureHours: number | null;
    recordsScanned: number;
    btcRecordsScanned: number;
    btcTriggerCount: number;
    eligibleMarketTriggerCount: number;
    uniqueMarketCount: number;
    independentMarketDayCount: number;
  };
  candidateResults: readonly LeadLagValidationCandidateResult[];
  survivingCandidateCount: number;
  lockedHoldoutCandidate: LeadLagLockedHoldoutCandidate | null;
  validationOverallStatus: LeadLagValidationOverallStatus;
  quarantine: {
    holdoutOutcomesAnalyzed: false;
    parameterRetuningOccurred: false;
    promotionArtifactCreated: false;
    preregistrationArtifactCreated: false;
    frozenHypothesisCreated: false;
    captureStarted: false;
    finalOosClaimCreated: false;
  };
  outputPaths: {
    outputPath: string;
    htmlOutputPath: string;
    validationAnalysisOutputPath: string;
    validationEventsOutputPath: string;
  };
  warnings: readonly string[];
};

export type { LeadLagDiscoveryCandidate, LeadLagGovernedDiscoveryReport };
