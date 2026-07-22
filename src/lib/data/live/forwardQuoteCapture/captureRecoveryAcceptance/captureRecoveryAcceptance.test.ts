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
    recoveryLifecycleOrdered: true,
    recoverySuccessCommandId: null,
    pendingCommandCountAtCaptureEnd: 0,
    marketsWithOutstandingRecoveryAtEnd: 0,
    commandErrorsReceived: 0,
    pendingCommandTimeoutCount: 0,
    snapshotAckTimeoutCount: 0,
    bufferedStreamsUsed: true,
    writerBackpressureCount: 1,
    allStreamsDrained: true,
    writerFailure: null,
    terminalStatusPublishedAfterStreamsDrained: true,
    runStatusState: "completed",
    captureEndReason: "duration-complete",
    healthVerdict: "capture-mvp-success",
    healthCompletedNormally: true,
    healthLiveConnectionSucceeded: true,
    healthErrors: [],
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

    // Unsubscribe was issued and acknowledged during rollover, and the
    // asynchronous recovery lifecycle held its order.
    expect(report.observed.unsubscribeRequested).toBe(true);
    expect(report.observed.unsubscribeAcknowledged).toBe(true);
    expect(report.observed.recoveryLifecycleOrdered).toBe(true);

    // Persistence guarantees through the REAL buffered writer path: buffered
    // streams (never the appendFile shim), at least one backpressure event
    // that drained, asynchronous stream completion awaited, and terminal
    // status published only after every stream finished.
    expect(report.observed.bufferedStreamsUsed).toBe(true);
    expect(report.observed.writerBackpressureCount).toBeGreaterThanOrEqual(1);
    expect(report.observed.allStreamsDrained).toBe(true);
    expect(report.observed.terminalStatusPublishedAfterStreamsDrained).toBe(true);
    expect(report.observed.runStatusState).toBe("completed");
    expect(report.observed.captureEndReason).toBe("duration-complete");
    expect(report.observed.healthPublishedAtomically).toBe(true);
    expect(report.observed.credentialLeakArtifacts).toEqual([]);

    // Native health reported a clean success end-to-end.
    expect(report.observed.healthVerdict).toBe("capture-mvp-success");
    expect(report.observed.healthCompletedNormally).toBe(true);
    expect(report.observed.healthLiveConnectionSucceeded).toBe(true);
    expect(report.observed.healthErrors).toEqual([]);
    expect(report.observed.pendingCommandTimeoutCount).toBe(0);
    expect(report.observed.snapshotAckTimeoutCount).toBe(0);

    // The transcript narrates the full scripted scenario in order.
    const transcript = report.transcript.join("\n");
    expect(transcript).toContain("subscribed ack sid=");
    expect(transcript).toContain("intentional sequence discontinuity");
    expect(transcript).toContain("get_snapshot");
    expect(transcript).toContain("recovery pending; must be quarantined");
    expect(transcript).toContain("fresh recovery snapshot");
    expect(transcript).toContain("unsubscribed ack");
    expect(transcript).toContain("writer backpressure");
  }, 20_000);

  it("proves the live-observed id-bearing snapshot response form (Form 2)", async () => {
    const report = await runCaptureRecoveryAcceptance({
      scenario: "snapshot-as-response",
    });

    expect(report.failures).toEqual([]);
    expect(report.passed).toBe(true);
    expect(report.observed.recoveryLifecycleOrdered).toBe(true);
    expect(report.observed.recoverySuccessCount).toBe(1);
    expect(report.observed.recoverySuccessCommandId).not.toBeNull();
    expect(report.observed.pendingCommandCountAtCaptureEnd).toBe(0);
    expect(report.observed.pendingCommandTimeoutCount).toBe(0);
    expect(report.observed.snapshotAckTimeoutCount).toBe(0);
    expect(report.observed.healthErrors).toEqual([]);
    expect(report.observed.healthVerdict).toBe("capture-mvp-success");

    const transcript = report.transcript.join("\n");
    expect(transcript).toContain("direct snapshot response; no standalone ok");
    expect(transcript).toContain(
      "advanced monotonic clock past 10s command-ack timeout for pending-command sweep",
    );
    expect(transcript).not.toContain("ok ack for get_snapshot");
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

  it("fails acceptance through the real harness when a stream never drains", async () => {
    const report = await runCaptureRecoveryAcceptance({ scenario: "writer-no-drain" });

    expect(report.passed).toBe(false);
    const failedIds = report.checks
      .filter((check) => !check.passed)
      .map((check) => check.id);
    expect(failedIds).toContain("all-streams-drained");
    // The failing stream must surface as a writer failure from the actual
    // buffered writer path, not from a fabricated observation.
    expect(report.observed.bufferedStreamsUsed).toBe(true);
    expect(report.observed.allStreamsDrained).toBe(false);
    expect(report.observed.writerFailure).not.toBeNull();
    // A capture whose persistence path failed must not finish "completed".
    expect(report.observed.runStatusState).not.toBe("completed");
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

  it("denies acceptance when the only changed field is a degraded native verdict", () => {
    const failed = failedCheckIds(passingObserved({ healthVerdict: "degraded-capture" }));
    expect(failed).toEqual(["native-health-success"]);
  });

  it("fails when the native health report carries errors", () => {
    expect(
      failedCheckIds(passingObserved({ healthErrors: ["ws stall detected"] })),
    ).toContain("native-health-success");
  });

  it("fails when the capture did not complete normally or never connected", () => {
    expect(
      failedCheckIds(passingObserved({ healthCompletedNormally: false })),
    ).toContain("native-health-success");
    expect(
      failedCheckIds(passingObserved({ healthLiveConnectionSucceeded: false })),
    ).toContain("native-health-success");
  });

  it("fails when the buffered writer path was bypassed", () => {
    expect(
      failedCheckIds(passingObserved({ bufferedStreamsUsed: false })),
    ).toContain("buffered-writer-path-used");
  });

  it("fails when no backpressure was exercised", () => {
    expect(
      failedCheckIds(passingObserved({ writerBackpressureCount: 0 })),
    ).toContain("backpressure-exercised-and-drained");
  });

  it("fails when terminal status was published before streams finished", () => {
    expect(
      failedCheckIds(
        passingObserved({ terminalStatusPublishedAfterStreamsDrained: false }),
      ),
    ).toContain("terminal-status-after-stream-completion");
  });

  it("fails when the recovery lifecycle order was violated", () => {
    expect(
      failedCheckIds(passingObserved({ recoveryLifecycleOrdered: false })),
    ).toContain("recovery-lifecycle-ordered");
  });
});
