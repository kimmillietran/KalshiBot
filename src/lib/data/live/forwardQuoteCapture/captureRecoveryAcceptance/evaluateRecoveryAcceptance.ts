import type {
  RecoveryAcceptanceCheck,
  RecoveryAcceptanceEvaluation,
  RecoveryAcceptanceObserved,
} from "./captureRecoveryAcceptanceTypes";

/**
 * Pure acceptance policy for the deterministic recovery scenario. Every
 * check must pass for the capture stack to be considered recovery-proven;
 * any failure makes the acceptance command exit nonzero.
 */
export function evaluateRecoveryAcceptance(
  observed: RecoveryAcceptanceObserved,
): RecoveryAcceptanceEvaluation {
  const checks: RecoveryAcceptanceCheck[] = [];

  function check(id: string, description: string, passed: boolean, detail: string): void {
    checks.push({ id, description, passed, detail });
  }

  check(
    "connection-established",
    "The authenticated WebSocket connection succeeded",
    observed.connected,
    `connected=${observed.connected}`,
  );
  check(
    "subscription-acknowledged-with-sid",
    "The subscribe command was acknowledged with a server sid",
    observed.subscribeAcknowledged && observed.assignedSid !== null,
    `subscribeAcknowledged=${observed.subscribeAcknowledged} assignedSid=${observed.assignedSid}`,
  );
  check(
    "exactly-one-gap-episode",
    "Exactly one distinct sequence-gap episode was recorded",
    observed.gapEpisodeCount === 1,
    `gapEpisodeCount=${observed.gapEpisodeCount}`,
  );
  check(
    "exactly-one-recovery-request",
    "Exactly one snapshot recovery request was sent for the episode",
    observed.recoveryRequestCount === 1 && observed.recoveryRequestSids.length === 1,
    `recoveryRequestCount=${observed.recoveryRequestCount} `
      + `recoveryRequestSids=[${observed.recoveryRequestSids.join(",")}]`,
  );
  check(
    "recovery-used-acknowledged-sid",
    "The recovery request carried the acknowledged server sid",
    observed.assignedSid !== null
      && observed.recoveryRequestSids.length > 0
      && observed.recoveryRequestSids.every((sid) => sid === observed.assignedSid),
    `assignedSid=${observed.assignedSid} `
      + `recoveryRequestSids=[${observed.recoveryRequestSids.join(",")}]`,
  );
  check(
    "pending-deltas-quarantined",
    "Deltas arriving while recovery was pending were quarantined, not applied",
    observed.suppressedWhileResyncingCount >= 1
      && observed.quarantinedSequencesApplied.length === 0,
    `suppressedWhileResyncingCount=${observed.suppressedWhileResyncingCount} `
      + `quarantinedSequencesApplied=[${observed.quarantinedSequencesApplied.join(",")}]`,
  );
  check(
    "suppressed-count-reported-separately",
    "Suppressed resyncing deltas are reported separately from the gap count",
    Number.isFinite(observed.suppressedWhileResyncingCount)
      && observed.sequenceGapCount === observed.gapEpisodeCount,
    `suppressedWhileResyncingCount=${observed.suppressedWhileResyncingCount} `
      + `sequenceGapCount=${observed.sequenceGapCount} gapEpisodeCount=${observed.gapEpisodeCount}`,
  );
  check(
    "fresh-snapshot-restored-validity",
    "The fresh recovery snapshot restored the book to a valid state",
    observed.freshSnapshotRestoredValidBook && observed.recoverySuccessCount === 1,
    `freshSnapshotRestoredValidBook=${observed.freshSnapshotRestoredValidBook} `
      + `recoverySuccessCount=${observed.recoverySuccessCount}`,
  );
  check(
    "post-recovery-deltas-accepted",
    "Deltas after the recovery snapshot were accepted as valid records",
    observed.postRecoveryAcceptedDeltaCount >= 1,
    `postRecoveryAcceptedDeltaCount=${observed.postRecoveryAcceptedDeltaCount}`,
  );
  check(
    "no-runaway-gap-count",
    "sequenceGapCount reflects distinct episodes, not every later delta",
    observed.sequenceGapCount === 1,
    `sequenceGapCount=${observed.sequenceGapCount}`,
  );
  check(
    "unsubscribe-acknowledged",
    "The market unsubscribe was issued and acknowledged",
    observed.unsubscribeRequested && observed.unsubscribeAcknowledged,
    `unsubscribeRequested=${observed.unsubscribeRequested} `
      + `unsubscribeAcknowledged=${observed.unsubscribeAcknowledged}`,
  );
  check(
    "recovery-lifecycle-ordered",
    "Recovery lifecycle events occurred in order: requested, acknowledged, succeeded",
    observed.recoveryLifecycleOrdered,
    `recoveryLifecycleOrdered=${observed.recoveryLifecycleOrdered}`,
  );
  check(
    "no-unresolved-recovery",
    "No recovery or pending command remained unresolved at capture end",
    observed.marketsWithOutstandingRecoveryAtEnd === 0
      && observed.pendingCommandCountAtCaptureEnd === 0
      && observed.recoveryFailureCount === 0,
    `marketsWithOutstandingRecoveryAtEnd=${observed.marketsWithOutstandingRecoveryAtEnd} `
      + `pendingCommandCountAtCaptureEnd=${observed.pendingCommandCountAtCaptureEnd} `
      + `recoveryFailureCount=${observed.recoveryFailureCount}`,
  );
  check(
    "no-command-errors",
    "No command-level WebSocket error responses were received",
    observed.commandErrorsReceived === 0,
    `commandErrorsReceived=${observed.commandErrorsReceived}`,
  );
  check(
    "buffered-writer-path-used",
    "The run used real buffered append streams, never the legacy appendFile shim",
    observed.bufferedStreamsUsed,
    `bufferedStreamsUsed=${observed.bufferedStreamsUsed}`,
  );
  check(
    "backpressure-exercised-and-drained",
    "At least one backpressure event occurred and drained through the buffered writer",
    observed.writerBackpressureCount >= 1 && observed.allStreamsDrained === true,
    `writerBackpressureCount=${observed.writerBackpressureCount} `
      + `allStreamsDrained=${observed.allStreamsDrained}`,
  );
  check(
    "all-streams-drained",
    "All persistence streams drained during writer finalization",
    observed.allStreamsDrained === true && observed.writerFailure === null,
    `allStreamsDrained=${observed.allStreamsDrained} writerFailure=${observed.writerFailure}`,
  );
  check(
    "terminal-status-after-stream-completion",
    "Terminal run status was published only after every append stream finished",
    observed.terminalStatusPublishedAfterStreamsDrained,
    `terminalStatusPublishedAfterStreamsDrained=${observed.terminalStatusPublishedAfterStreamsDrained}`,
  );
  check(
    "terminal-status-completed",
    "The terminal run status is completed with a duration-complete end reason",
    observed.runStatusState === "completed"
      && observed.captureEndReason === "duration-complete",
    `runStatusState=${observed.runStatusState} captureEndReason=${observed.captureEndReason}`,
  );
  check(
    "native-health-success",
    "Native health reports capture-mvp-success with a normal, error-free completion",
    observed.healthVerdict === "capture-mvp-success"
      && observed.healthCompletedNormally
      && observed.healthLiveConnectionSucceeded
      && observed.healthErrors.length === 0,
    `healthVerdict=${observed.healthVerdict} `
      + `healthCompletedNormally=${observed.healthCompletedNormally} `
      + `healthLiveConnectionSucceeded=${observed.healthLiveConnectionSucceeded} `
      + `healthErrors=${observed.healthErrors.length}`,
  );
  check(
    "health-published-atomically",
    "capture-health.json was published atomically (temp-file-plus-rename only)",
    observed.healthPublishedAtomically,
    `healthPublishedAtomically=${observed.healthPublishedAtomically}`,
  );
  check(
    "no-credential-material-in-artifacts",
    "No credential material appears in any capture artifact",
    observed.credentialLeakArtifacts.length === 0,
    `credentialLeakArtifacts=[${observed.credentialLeakArtifacts.join(",")}]`,
  );

  const failures = checks
    .filter((entry) => !entry.passed)
    .map((entry) => `${entry.id}: ${entry.description} (${entry.detail})`);

  return { passed: failures.length === 0, checks, failures };
}
