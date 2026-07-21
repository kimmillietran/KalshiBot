import { describe, expect, it } from "vitest";

import { evaluateRecoveryAcceptance } from "./evaluateRecoveryAcceptance";
import { runCaptureRecoveryAcceptance } from "./runCaptureRecoveryAcceptance";
import type { RecoveryAcceptanceObserved } from "./captureRecoveryAcceptanceTypes";

function passingObserved(
  overrides: Partial<RecoveryAcceptanceObserved> = {},
): RecoveryAcceptanceObserved {
  return {
    runId: "run-acceptance",
    runDir: "in-memory/acceptance/forward-quotes/run-acceptance",
    connected: true,
    subscribeAcknowledged: true,
    assignedSid: 1,
    recoveryRequestSids: [1],
    gapEpisodeCount: 1,
    sequenceGapCount: 1,
    recoveryRequestCount: 1,
    recoverySuccessCount: 1,
    recoveryFailureCount: 0,
    suppressedWhileResyncingCount: 2,
    quarantinedSequencesApplied: [],
    freshSnapshotRestoredValidBook: true,
    postRecoveryAcceptedDeltaCount: 2,
    unsubscribeRequested: true,
    unsubscribeAcknowledged: true,
    pendingCommandCountAtCaptureEnd: 0,
    marketsWithOutstandingRecoveryAtEnd: 0,
    commandErrorsReceived: 0,
    allStreamsDrained: true,
    writerFailure: null,
    runStatusState: "completed",
    captureEndReason: "duration-complete",
    healthVerdict: "capture-mvp-success",
    healthPublishedAtomically: true,
    credentialLeakArtifacts: [],
    ...overrides,
  };
}

function failedCheckIds(observed: RecoveryAcceptanceObserved): string[] {
  return evaluateRecoveryAcceptance(observed)
    .checks.filter((check) => !check.passed)
    .map((check) => check.id);
}

describe("runCaptureRecoveryAcceptance (deterministic end-to-end lifecycle)", () => {
  it("proves the entire recovery lifecycle through the production orchestrator", async () => {
    const report = await runCaptureRecoveryAcceptance();

    expect(report.failures).toEqual([]);
    expect(report.passed).toBe(true);

    // Exactly one gap episode, one sid-correct recovery request, and a
    // separately reported quarantine count.
    expect(report.observed.gapEpisodeCount).toBe(1);
    expect(report.observed.sequenceGapCount).toBe(1);
    expect(report.observed.recoveryRequestCount).toBe(1);
    expect(report.observed.recoveryRequestSids).toEqual([report.observed.assignedSid]);
    expect(report.observed.suppressedWhileResyncingCount).toBeGreaterThanOrEqual(2);
    expect(report.observed.quarantinedSequencesApplied).toEqual([]);

    // Fresh snapshot restored validity and post-recovery deltas applied.
    expect(report.observed.freshSnapshotRestoredValidBook).toBe(true);
    expect(report.observed.recoverySuccessCount).toBe(1);
    expect(report.observed.postRecoveryAcceptedDeltaCount).toBe(2);

    // Unsubscribe was issued and acknowledged during rollover.
    expect(report.observed.unsubscribeRequested).toBe(true);
    expect(report.observed.unsubscribeAcknowledged).toBe(true);

    // Persistence and lifecycle guarantees.
    expect(report.observed.allStreamsDrained).toBe(true);
    expect(report.observed.runStatusState).toBe("completed");
    expect(report.observed.captureEndReason).toBe("duration-complete");
    expect(report.observed.healthPublishedAtomically).toBe(true);
    expect(report.observed.credentialLeakArtifacts).toEqual([]);

    // The transcript narrates the full scripted scenario in order.
    const transcript = report.transcript.join("\n");
    expect(transcript).toContain("subscribed ack sid=");
    expect(transcript).toContain("intentional sequence discontinuity");
    expect(transcript).toContain("get_snapshot");
    expect(transcript).toContain("recovery pending; must be quarantined");
    expect(transcript).toContain("fresh recovery snapshot");
    expect(transcript).toContain("unsubscribed ack");
  }, 20_000);

  it("fails acceptance when the server never assigns a sid", async () => {
    const report = await runCaptureRecoveryAcceptance({ scenario: "missing-sid" });

    expect(report.passed).toBe(false);
    const failedIds = report.checks
      .filter((check) => !check.passed)
      .map((check) => check.id);
    expect(failedIds).toContain("subscription-acknowledged-with-sid");
    expect(failedIds).toContain("recovery-used-acknowledged-sid");
    // Without a sid the recovery request can never be sent.
    expect(report.observed.recoveryRequestCount).toBe(0);
  }, 20_000);

  it("fails acceptance when the fresh snapshot never arrives", async () => {
    const report = await runCaptureRecoveryAcceptance({ scenario: "no-fresh-snapshot" });

    expect(report.passed).toBe(false);
    const failedIds = report.checks
      .filter((check) => !check.passed)
      .map((check) => check.id);
    expect(failedIds).toContain("fresh-snapshot-restored-validity");
    expect(report.observed.freshSnapshotRestoredValidBook).toBe(false);
    expect(report.observed.recoverySuccessCount).toBe(0);
  }, 20_000);
});

describe("evaluateRecoveryAcceptance (pure acceptance policy)", () => {
  it("passes a fully conforming observation", () => {
    const evaluation = evaluateRecoveryAcceptance(passingObserved());
    expect(evaluation.failures).toEqual([]);
    expect(evaluation.passed).toBe(true);
  });

  it("fails when recovery is requested more than once for one episode", () => {
    const failed = failedCheckIds(
      passingObserved({ recoveryRequestCount: 2, recoveryRequestSids: [1, 1] }),
    );
    expect(failed).toContain("exactly-one-recovery-request");
  });

  it("fails when a persistence stream does not drain", () => {
    expect(failedCheckIds(passingObserved({ allStreamsDrained: false }))).toContain(
      "all-streams-drained",
    );
    expect(
      failedCheckIds(passingObserved({ writerFailure: "drain timeout" })),
    ).toContain("all-streams-drained");
  });

  it("fails when quarantined deltas leak into applied top-of-book records", () => {
    const failed = failedCheckIds(
      passingObserved({ quarantinedSequencesApplied: [11] }),
    );
    expect(failed).toContain("pending-deltas-quarantined");
  });

  it("fails when the gap count runs away instead of counting episodes", () => {
    const failed = failedCheckIds(
      passingObserved({ sequenceGapCount: 57 }),
    );
    expect(failed).toContain("no-runaway-gap-count");
    expect(failed).toContain("suppressed-count-reported-separately");
  });

  it("fails when the terminal run status is not completed", () => {
    expect(
      failedCheckIds(passingObserved({ runStatusState: "finalizing" })),
    ).toContain("terminal-status-completed");
  });

  it("fails when credential material appears in an artifact", () => {
    expect(
      failedCheckIds(
        passingObserved({ credentialLeakArtifacts: ["capture-health.json"] }),
      ),
    ).toContain("no-credential-material-in-artifacts");
  });

  it("fails when health publication was not atomic", () => {
    expect(
      failedCheckIds(passingObserved({ healthPublishedAtomically: false })),
    ).toContain("health-published-atomically");
  });
});
