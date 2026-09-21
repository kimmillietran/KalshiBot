/**
 * M16.2 prospective validation collection — types.
 * Outcome-blind: never compute P&L / target-hit / stop-hit / settlement.
 */
import {
  M16_FORBIDDEN_M14_EXCLUDED_RUN_ID,
  M16_FORBIDDEN_M14_VALIDATION_RUN_IDS,
  M16_FORBIDDEN_M15_COST_FLOOR_RUN_ID,
  M16ReversalError,
} from "./m16Types";
import {
  M16_FORBIDDEN_INCIDENCE_RUN_IDS,
  M16_STANDARD_SEGMENT_DURATION_MINUTES,
  M16_VALIDATION_ROLE,
  type M16CollectionStoppingDisposition,
} from "./m16ProspectiveCohortPlan";

export const M16_VALIDATION_PROTOCOL_VERSION =
  "kalshi-kxbtc15m-side-invariant-exhaustion-reversal-validation-collection-v1" as const;

export const M16_VALIDATION_RESERVATION_VERSION =
  "m16-validation-reservation-v1" as const;

/** READY disables further launches; does NOT open outcomes. */
export const M16_COLLECTION_COMPLETE_SEALED_MESSAGE =
  "M16 COLLECTION COMPLETE — OUTCOMES STILL SEALED" as const;

export { M16_VALIDATION_ROLE };

export const M16_VALIDATION_FORBIDDEN_RUN_IDS = [
  ...M16_FORBIDDEN_INCIDENCE_RUN_IDS,
  ...M16_FORBIDDEN_M14_VALIDATION_RUN_IDS,
  M16_FORBIDDEN_M14_EXCLUDED_RUN_ID,
  M16_FORBIDDEN_M15_COST_FLOOR_RUN_ID,
] as const;

export class M16ValidationCollectionError extends M16ReversalError {
  constructor(message: string) {
    super(message);
    this.name = "M16ValidationCollectionError";
  }
}

export type M16ValidationAuthorityBinding = {
  protocolVersion: typeof M16_VALIDATION_PROTOCOL_VERSION;
  familyDefinitionIdentity: string;
  evidenceContractIdentity: string;
  dependencePlanIdentity: string;
  feeContractIdentity: string;
  cohortPlanIdentity: string;
  scientificProtocolIdentity: string;
  /** Recorded per run; NOT part of scientificProtocolIdentity. */
  codeAuthoritySha: string | null;
};

export type M16ValidationReservation = {
  reservationVersion: typeof M16_VALIDATION_RESERVATION_VERSION;
  authority: M16ValidationAuthorityBinding;
  role: typeof M16_VALIDATION_ROLE;
  plannedUtcDay: string;
  plannedStartIso: string;
  plannedEndIso: string;
  requestedDurationMinutes: typeof M16_STANDARD_SEGMENT_DURATION_MINUTES;
  fixedUtcWindow: "18:00-22:00Z";
  createdAt: string;
  replacesReservationIdentity: string | null;
  outcomesOpened: false;
  pnlInspected: false;
  targetHitInspected: false;
  stopHitInspected: false;
  reservationIdentity: string;
};

export type M16EligibleConfirmationUnit = {
  marketTicker: string;
  confirmationTimestampMs: number;
  utcDayKey: string;
  observedInRunId: string;
};

export type M16ValidationBlindIncidence = {
  runId: string;
  captureIdentityHash: string;
  marketsObserved: number;
  prehistoryCompleteMarkets: number;
  leftTruncatedSideEventCount: number;
  downCrossSetupSideEventCount: number;
  preConfirmationWaterfallAbortSideEventCount: number;
  reversalConfirmedEntryCount: number;
  timeGateEligibleCount: number;
  structurallyCompletePostEntryPathCount: number;
  eligibleUnits: readonly M16EligibleConfirmationUnit[];
  eligibleTradeCountRaw: number;
  eligibleUtcDayKeysRaw: readonly string[];
  captureHours: number;
  outcomesOpened: false;
  quarantine: {
    pnlOpened: false;
    targetHitInspected: false;
    stopHitInspected: false;
    settlementDirectionInspected: false;
  };
  blindIncidenceIdentity: string;
};

export type M16ValidationSegmentHealth = {
  passed: boolean;
  verdict: string;
  healthArtifactIdentity: string;
  failureReasons: readonly string[];
};

export type M16ValidationAcceptedSegment = {
  status: "accepted";
  ordinal: number;
  reservationIdentity: string;
  runId: string;
  captureRunDir: string;
  captureIdentityHash: string;
  healthArtifactIdentity: string;
  codeAuthoritySha: string | null;
  role: typeof M16_VALIDATION_ROLE;
  plannedUtcDay: string;
  captureStartIso: string;
  captureEndIso: string;
  acceptedMinutes: number;
  acceptedHours: number;
  utcDaysPhysicallyCovered: readonly string[];
  blindIncidence: M16ValidationBlindIncidence;
  outcomesOpened: false;
  pnlInspected: false;
  targetHitInspected: false;
  stopHitInspected: false;
};

export type M16ValidationExcludedSegment = {
  status: "excluded";
  reservationIdentity: string | null;
  runId: string | null;
  captureIdentityHash: string | null;
  reason: string;
  terminalStatus: string;
  acceptedMinutes: 0;
  acceptedHours: 0;
  permanentlyExcluded: true;
  outcomesOpened: false;
};

export type M16ValidationCaptureLauncherResult = {
  runId: string;
  captureRunDir: string;
  captureIdentityHash: string;
  captureStartIso: string;
  captureEndIso: string;
};

export type M16ValidationAttemptRecord = {
  attemptId: string;
  plannedUtcDay: string;
  reservationIdentity: string | null;
  runId: string | null;
  /** Operational recovery pointers — not scientific authority. */
  captureRunDir?: string | null;
  captureIdentityHash?: string | null;
  healthArtifactIdentity?: string | null;
  status:
    | "reservation-only"
    | "capture-pending"
    | "health-pending"
    | "blind-scan-pending"
    | "registry-pending"
    | "accepted"
    | "excluded"
    | "missed-window"
    | "capture-not-launched";
  createdAt: string;
  updatedAt: string;
  note: string | null;
  outcomesOpened: false;
};

export type M16ValidationRegistry = {
  protocolVersion: typeof M16_VALIDATION_PROTOCOL_VERSION;
  authority: M16ValidationAuthorityBinding;
  planFreezeTimestampIso: string;
  accepted: readonly M16ValidationAcceptedSegment[];
  excluded: readonly M16ValidationExcludedSegment[];
  reservations: readonly M16ValidationReservation[];
  attempts: readonly M16ValidationAttemptRecord[];
  registryIdentity: string;
};

export type M16ValidationProgress = {
  protocolVersion: typeof M16_VALIDATION_PROTOCOL_VERSION;
  authority: M16ValidationAuthorityBinding;
  registryIdentity: string;
  physicalAttempts: number;
  acceptedSegments: number;
  failedExcludedAttempts: number;
  acceptedHours: number;
  maxAcceptedHours: number;
  eligibleTradeCount: number;
  requiredTradeN: number;
  distinctEligibleUtcDayClusters: number;
  minimumUtcDayClusters: number;
  remainingTradeCount: number;
  remainingUtcDayClusterCount: number;
  disposition: M16CollectionStoppingDisposition;
  dispositionRationale: string;
  outcomesOpened: false;
  pnlInspected: false;
  targetHitInspected: false;
  stopHitInspected: false;
  progressIdentity: string;
};
