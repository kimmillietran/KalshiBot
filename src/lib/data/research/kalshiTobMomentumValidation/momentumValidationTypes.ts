import type { MomentumDiscoveryIo } from "../kalshiTobMomentumDiscovery/momentumDiscoveryTypes";
import type {
  MomentumCandidateDefinition,
  MomentumValidationStatus,
} from "../momentumEvidenceContract";
import type {
  MomentumValidationAcceptedSegment,
  MomentumValidationCohortRegistry,
  MomentumValidationCohortStatus,
} from "../kalshiTobMomentumValidationCohort";
import {
  KNOWN_M140A_EVIDENCE_CONTRACT_IDENTITY,
  KNOWN_M140A_FAMILY_DEFINITION_IDENTITY,
  KNOWN_M140B_DISCOVERY_IDENTITY,
  LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID,
  MOMENTUM_VALIDATION_TARGET_ESS,
} from "../kalshiTobMomentumValidationCohort";

/**
 * M14.0c — Governed momentum validation executor.
 * Opens validation outcomes only after cohort status is exactly ready-for-outcome-open.
 * Default path uses synthetic injected outcomes; live capture streaming is fail-closed gated.
 */

export const MOMENTUM_VALIDATION_ANALYSIS_VERSION =
  "kalshi-tob-momentum-validation-v1" as const;

export const MOMENTUM_VALIDATION_DISCLAIMER =
  "M14.0c evaluates the single locked TRAIN shortlist candidate on a prospective "
  + "validation cohort only after outcome-blind stopping reaches ready-for-outcome-open. "
  + "It does not retune W/X/H, open holdout outcomes, promote, preregister, freeze, "
  + "or place live orders. Midpoint continuation is diagnostic only; direction uses "
  + "median signed gross executable one-contract P&L > 0.";

export const DEFAULT_MOMENTUM_VALIDATION_JSON_ROOT =
  "data/research-results/momentum/validation" as const;
export const DEFAULT_MOMENTUM_VALIDATION_HTML_ROOT =
  "data/reports/momentum/validation" as const;
export const MOMENTUM_VALIDATION_JSON_FILENAME =
  "kalshi-tob-momentum-validation.json" as const;
export const MOMENTUM_VALIDATION_HTML_FILENAME =
  "kalshi-tob-momentum-validation.html" as const;

/** Sealed validation observability floor (matches evidence-contract synthetic design). */
export const MOMENTUM_VALIDATION_MIN_EXECUTABLE_OBSERVABILITY_SHARE = 0.5 as const;

export const MOMENTUM_VALIDATION_MIN_ESS = MOMENTUM_VALIDATION_TARGET_ESS;

export {
  KNOWN_M140A_FAMILY_DEFINITION_IDENTITY,
  KNOWN_M140A_EVIDENCE_CONTRACT_IDENTITY,
  KNOWN_M140B_DISCOVERY_IDENTITY,
  LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID,
  MOMENTUM_VALIDATION_TARGET_ESS,
};

export class MomentumValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MomentumValidationError";
  }
}

export type MomentumValidationIo = MomentumDiscoveryIo;

export type MomentumValidationOverallStatus =
  | "validated"
  | "validation-failed"
  | "underpowered-for-validation"
  | "blocked-awaiting-cohort"
  | "invalid-evidence";

export type MomentumValidationNextAction =
  | "holdout-eligible-lock-only"
  | "stop-lineage"
  | "continue-cohort-collection"
  | "none";

export type SyntheticValidationEpisode = {
  marketTicker: string;
  tradingDayUtc: string;
  signedExecutablePnlCents: number | null;
  signedMidpointContinuationCents: number | null;
  responseObservable: boolean;
  executableObservable: boolean;
  candidateId?: string;
};

export type MomentumValidationOutcomeMetrics = {
  independentValidationEss: number;
  signedExecutableMedianCents: number | null;
  signedExecutableMeanCents: number | null;
  signedMidpointMedianCents: number | null;
  signedMidpointMeanCents: number | null;
  executableObservabilityShare: number;
  responseObservableShare: number;
  distinctMarkets: number;
  distinctMarketDays: number;
  retainedUnitCount: number;
  duplicateUnitsRemoved: number;
  midpointOnly: boolean;
};

export type MomentumValidationBoundAuthorities = {
  familyDefinitionIdentity: typeof KNOWN_M140A_FAMILY_DEFINITION_IDENTITY;
  evidenceContractIdentity: typeof KNOWN_M140A_EVIDENCE_CONTRACT_IDENTITY;
  discoveryIdentity: typeof KNOWN_M140B_DISCOVERY_IDENTITY;
  planIdentity: string;
  lockedCandidateId: typeof LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID;
  lockedCandidate: MomentumCandidateDefinition;
  minEssForValidation: typeof MOMENTUM_VALIDATION_TARGET_ESS;
  minExecutableObservabilityShare: typeof MOMENTUM_VALIDATION_MIN_EXECUTABLE_OBSERVABILITY_SHARE;
};

export type MomentumValidationCohortAuthorityInput = {
  familyDefinitionIdentity: string;
  evidenceContractIdentity: string;
  discoveryIdentity: string;
  planIdentity: string;
  lockedCandidateId: string;
  lockedCandidate?: MomentumCandidateDefinition;
  registry: MomentumValidationCohortRegistry;
  cohortStatus: MomentumValidationCohortStatus;
  /** If omitted, recomputed via cross-segment dedup of accepted units. */
  cumulativeBlindEss?: number;
  acceptedSegments?: readonly MomentumValidationAcceptedSegment[];
};

export type MomentumValidationOutcomeAccessAuthorization =
  | {
      authorized: true;
      disposition: "ready-for-outcome-open";
      cumulativeBlindEss: number;
      acceptedSegmentCount: number;
      planIdentity: string;
      lockedCandidateId: typeof LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID;
    }
  | {
      authorized: false;
      reason: string;
      disposition: "blocked" | "underpowered-no-peek" | "invalid-evidence";
      cumulativeBlindEss: number;
      acceptedSegmentCount: number;
      cohortStatus: MomentumValidationCohortStatus | "malformed";
    };

export type MomentumValidationCandidateEvaluation = {
  candidateId: string;
  status: MomentumValidationStatus;
  rationale: readonly string[];
  candidate: MomentumCandidateDefinition;
  directionalConsistency:
    | "continuation-consistent"
    | "not-continuation-consistent"
    | "undefined";
  outcomeMetrics: MomentumValidationOutcomeMetrics;
  feeContractStatus: string;
  netEdgeClaimAuthorized: false;
};

export type MomentumValidationHoldoutLockEligibility = {
  eligible: true;
  candidateId: typeof LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID;
  candidate: MomentumCandidateDefinition;
  holdoutOpened: false;
  holdoutOutcomesRead: false;
  isolationAttested: true;
  note: string;
};

export type MomentumValidationReport = {
  generatedAt: string;
  analysisVersion: typeof MOMENTUM_VALIDATION_ANALYSIS_VERSION;
  disclaimer: typeof MOMENTUM_VALIDATION_DISCLAIMER;
  validationIdentityHash: string;
  familyDefinitionIdentity: string;
  evidenceContractIdentity: string;
  discoveryIdentity: string;
  planIdentity: string;
  lockedCandidateId: typeof LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID;
  lockedCandidate: MomentumCandidateDefinition;
  cohortStatusAtGate: MomentumValidationCohortStatus | "malformed";
  outcomesOpened: boolean;
  cumulativeBlindEss: number;
  acceptedSegmentCount: number;
  minEssForValidation: typeof MOMENTUM_VALIDATION_TARGET_ESS;
  minExecutableObservabilityShare: typeof MOMENTUM_VALIDATION_MIN_EXECUTABLE_OBSERVABILITY_SHARE;
  overallStatus: MomentumValidationOverallStatus;
  nextAction: MomentumValidationNextAction;
  candidateEvaluation: MomentumValidationCandidateEvaluation | null;
  holdoutLockEligibility: MomentumValidationHoldoutLockEligibility | null;
  outcomeMetrics: MomentumValidationOutcomeMetrics | null;
  quarantine: {
    holdoutOutcomesRead: false;
    holdoutOpened: false;
    liveOrders: false;
    liveOrdersExecuted: false;
    parameterRetuningOccurred: false;
    promotionArtifactCreated: false;
    preregistrationArtifactCreated: false;
    frozenHypothesisCreated: false;
    realCaptureStreamed: false;
  };
  warnings: readonly string[];
};
