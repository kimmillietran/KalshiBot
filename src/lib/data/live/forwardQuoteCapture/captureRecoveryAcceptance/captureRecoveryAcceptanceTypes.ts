/**
 * Deterministic capture recovery acceptance harness (M12.1F).
 *
 * The harness drives the full production capture orchestrator through a
 * scripted WebSocket transport and in-memory IO, then proves — from the
 * artifacts and diagnostics the run actually produced — that the recovery
 * lifecycle behaves exactly as specified before eight-hour captures restart.
 */

export const RECOVERY_ACCEPTANCE_SCENARIOS = [
  /** Full happy path: one gap, one recovery, unsubscribe, clean completion. */
  "happy",
  /** Server acknowledges the subscription without a sid; recovery must be impossible. */
  "missing-sid",
  /** Recovery is acknowledged but the fresh snapshot never arrives. */
  "no-fresh-snapshot",
] as const;

export type RecoveryAcceptanceScenario =
  (typeof RECOVERY_ACCEPTANCE_SCENARIOS)[number];

/** Everything the harness observed from the run's artifacts and diagnostics. */
export type RecoveryAcceptanceObserved = {
  runId: string;
  runDir: string;
  connected: boolean;
  subscribeAcknowledged: boolean;
  /** Server sid assigned to the primary market's subscription (null if never acknowledged). */
  assignedSid: number | null;
  /** sids carried by every get_snapshot recovery command actually sent. */
  recoveryRequestSids: readonly number[];
  gapEpisodeCount: number;
  sequenceGapCount: number;
  recoveryRequestCount: number;
  recoverySuccessCount: number;
  recoveryFailureCount: number;
  suppressedWhileResyncingCount: number;
  /** Sequences of quarantined deltas that leaked into top-of-book as applied records. */
  quarantinedSequencesApplied: readonly number[];
  /** The post-recovery snapshot produced a top-of-book record with a valid book. */
  freshSnapshotRestoredValidBook: boolean;
  /** Deltas applied as valid top-of-book records after the recovery snapshot. */
  postRecoveryAcceptedDeltaCount: number;
  unsubscribeRequested: boolean;
  unsubscribeAcknowledged: boolean;
  pendingCommandCountAtCaptureEnd: number;
  marketsWithOutstandingRecoveryAtEnd: number;
  commandErrorsReceived: number;
  allStreamsDrained: boolean | null;
  writerFailure: string | null;
  runStatusState: string | null;
  captureEndReason: string | null;
  healthVerdict: string;
  /** capture-health.json only ever appeared via temp-file-plus-rename publication. */
  healthPublishedAtomically: boolean;
  /** Artifact paths containing credential material (must be empty). */
  credentialLeakArtifacts: readonly string[];
};

export type RecoveryAcceptanceCheck = {
  id: string;
  description: string;
  passed: boolean;
  detail: string;
};

export type RecoveryAcceptanceEvaluation = {
  passed: boolean;
  checks: readonly RecoveryAcceptanceCheck[];
  failures: readonly string[];
};

export type RecoveryAcceptanceReport = {
  schemaVersion: 1;
  generatedAt: string;
  scenario: RecoveryAcceptanceScenario;
  passed: boolean;
  observed: RecoveryAcceptanceObserved;
  checks: readonly RecoveryAcceptanceCheck[];
  failures: readonly string[];
  /** Ordered wire-level transcript of the deterministic scenario. */
  transcript: readonly string[];
};
