import { describe, expect, it } from "vitest";

import type { CaptureHealthAuditReport } from "@/lib/data/research/captureHealthAudit/captureHealthAuditTypes";

import type { CaptureRunStatusArtifact } from "../captureRunStatus";
import type { CaptureRunSelectionEntry } from "../selectAuditableCaptureRun";

import {
  parseCaptureRestartGateSummary,
  serializeCaptureRestartGateSummary,
} from "./captureRestartGateSummarySchema";
import { evaluateCaptureRestartGate } from "./evaluateCaptureRestartGate";
import { findActiveCaptureRuns } from "./findActiveCaptureRuns";
import type { CaptureRestartGateInput } from "./evaluateCaptureRestartGate";

const RUN_ID = "2026-07-20T12-00-00-000Z";
const RUN_DIR = `data/live-capture/forward-quotes/${RUN_ID}`;

function completedStatus(
  overrides: Partial<CaptureRunStatusArtifact> = {},
): CaptureRunStatusArtifact {
  return {
    schemaVersion: 1,
    runId: RUN_ID,
    state: "completed",
    startedAt: "2026-07-20T12:00:00.000Z",
    updatedAt: "2026-07-20T12:20:00.000Z",
    endedAt: "2026-07-20T12:20:00.000Z",
    captureEndReason: "duration-complete",
    failureReason: null,
    ...overrides,
  };
}

function healthyNativeHealth(): Record<string, unknown> {
  return {
    runId: RUN_ID,
    verdict: "capture-mvp-success",
    connection: {
      terminalFailureReason: null,
      captureEndReason: "duration-complete",
      completedNormally: true,
    },
    capture: { topOfBookRecordCount: 4_000, btcSpotRecordCount: 240 },
    orderbook: {
      sequenceGapEpisodeCount: 0,
      sequenceGapCount: 0,
      deltasQuarantinedDuringResync: 0,
      snapshotRecoveryRequestCount: 0,
      snapshotRecoverySuccessCount: 0,
      snapshotRecoveryFailureCount: 0,
      snapshotRecoveryTimeoutCount: 0,
      snapshotRecoveryExhaustedCount: 0,
      pendingCommandTimeoutCount: 0,
      pendingCommandCountAtCaptureEnd: 0,
      marketsWithOutstandingRecoveryAtEnd: 0,
      commandErrorsReceived: 0,
    },
    writer: {
      allStreamsDrained: true,
      backpressureEventCount: 1,
      failure: null,
    },
    watchdog: { terminalWebSocketFailure: false },
  };
}

function readyAudit(
  overrides: {
    verdict?: string;
    selectedRunId?: string;
    runDurationSeconds?: number;
    validBookShare?: number | null;
    joinCoverageShare?: number | null;
  } = {},
): CaptureHealthAuditReport {
  return {
    selectedRunId: overrides.selectedRunId ?? RUN_ID,
    captureRunDir: RUN_DIR,
    summary: {
      verdict: overrides.verdict ?? "capture-research-ready",
      recommendedNextAction: "proceed-offline-microstructure-research",
      runDurationSeconds: overrides.runDurationSeconds ?? 1_200,
      topOfBookCount: 4_000,
      btcSpotCount: 240,
      bookState: {
        validBookShare:
          overrides.validBookShare === undefined ? 0.97 : overrides.validBookShare,
        sequenceGapCount: 0,
        reconnectCount: 0,
      },
      btcJoin: {
        joinCoverageShare:
          overrides.joinCoverageShare === undefined
            ? 0.95
            : overrides.joinCoverageShare,
      },
      continuity: { p90TopOfBookGapMs: 800 },
    },
  } as unknown as CaptureHealthAuditReport;
}

function passingInput(
  overrides: Partial<CaptureRestartGateInput> = {},
): CaptureRestartGateInput {
  return {
    generatedAt: "2026-07-20T12:30:00.000Z",
    runDir: RUN_DIR,
    runStatus: completedStatus(),
    runStatusIntegrity: "valid",
    nativeHealth: healthyNativeHealth(),
    audit: readyAudit(),
    auditErrors: [],
    auditFingerprintsVerified: true,
    auditFreshnessWarnings: [],
    expectedDurationMinutes: 20,
    ...overrides,
  };
}

describe("evaluateCaptureRestartGate", () => {
  it("approves restart for a fully healthy completed smoke run", () => {
    const summary = evaluateCaptureRestartGate(passingInput());

    expect(summary.failureReasons).toEqual([]);
    expect(summary.restartEightHourCaptures).toBe(true);
    expect(summary.runId).toBe(RUN_ID);
    expect(summary.durationSeconds).toBe(1_200);
    expect(summary.topOfBookCount).toBe(4_000);
    expect(summary.btcSpotCount).toBe(240);
    expect(summary.validBookShare).toBe(0.97);
    expect(summary.btcJoinCoverageShare).toBe(0.95);
    expect(summary.gapEpisodeCount).toBe(0);
    expect(summary.suppressedWhileResyncingCount).toBe(0);
    expect(summary.writerBackpressureCount).toBe(1);
    expect(summary.allStreamsDrained).toBe(true);
    expect(summary.nativeHealthStatus).toBe("capture-mvp-success");
    expect(summary.runStatusState).toBe("completed");
    expect(summary.auditVerdict).toBe("capture-research-ready");
  });

  it("refuses restart when the audit verdict is capture-gappy", () => {
    const summary = evaluateCaptureRestartGate(
      passingInput({ audit: readyAudit({ verdict: "capture-gappy" }) }),
    );

    expect(summary.restartEightHourCaptures).toBe(false);
    expect(summary.failureReasons.join("\n")).toContain("capture-gappy");
  });

  it("refuses restart when native health is partial", () => {
    const partialHealth = healthyNativeHealth();
    delete partialHealth.writer;
    const orderbook = partialHealth.orderbook as Record<string, unknown>;
    delete orderbook.deltasQuarantinedDuringResync;

    const summary = evaluateCaptureRestartGate(
      passingInput({ nativeHealth: partialHealth }),
    );

    expect(summary.restartEightHourCaptures).toBe(false);
    const reasons = summary.failureReasons.join("\n");
    expect(reasons).toContain("native health artifact is partial");
    expect(reasons).toContain("writer");
    expect(reasons).toContain("orderbook.deltasQuarantinedDuringResync");
  });

  it("refuses restart when the terminal run status is not completed", () => {
    const summary = evaluateCaptureRestartGate(
      passingInput({
        runStatus: completedStatus({ state: "failed", captureEndReason: "writer-failure" }),
      }),
    );
    expect(summary.restartEightHourCaptures).toBe(false);
    expect(summary.failureReasons.join("\n")).toContain('"failed"');
  });

  it("refuses restart when the status file is invalid or identity-mismatched", () => {
    for (const integrity of ["invalid", "identity-mismatched", "absent"] as const) {
      const summary = evaluateCaptureRestartGate(
        passingInput({ runStatus: null, runStatusIntegrity: integrity }),
      );
      expect(summary.restartEightHourCaptures).toBe(false);
      expect(summary.failureReasons.join("\n")).toContain(integrity);
    }
  });

  it("refuses restart when audit freshness could not be positively verified", () => {
    const summary = evaluateCaptureRestartGate(
      passingInput({
        auditFingerprintsVerified: false,
        auditFreshnessWarnings: ["top-of-book size changed"],
      }),
    );
    expect(summary.restartEightHourCaptures).toBe(false);
    expect(summary.failureReasons.join("\n")).toContain("stale or partial");
  });

  it("refuses restart when the duration is outside tolerance", () => {
    const summary = evaluateCaptureRestartGate(
      passingInput({ audit: readyAudit({ runDurationSeconds: 300 }) }),
    );
    expect(summary.restartEightHourCaptures).toBe(false);
    expect(summary.failureReasons.join("\n")).toContain("duration");
  });

  it("refuses restart when coverage thresholds fail or are unavailable", () => {
    const lowJoin = evaluateCaptureRestartGate(
      passingInput({ audit: readyAudit({ joinCoverageShare: 0.5 }) }),
    );
    expect(lowJoin.restartEightHourCaptures).toBe(false);
    expect(lowJoin.failureReasons.join("\n")).toContain("BTC join coverage");

    const nullShare = evaluateCaptureRestartGate(
      passingInput({ audit: readyAudit({ validBookShare: null }) }),
    );
    expect(nullShare.restartEightHourCaptures).toBe(false);
    expect(nullShare.failureReasons.join("\n")).toContain("valid-book share");
  });

  it("refuses restart on terminal WebSocket failures and unresolved recovery", () => {
    const health = healthyNativeHealth();
    (health.connection as Record<string, unknown>).terminalFailureReason =
      "kalshi-websocket-recovery-exhausted";
    const orderbook = health.orderbook as Record<string, unknown>;
    orderbook.marketsWithOutstandingRecoveryAtEnd = 1;
    orderbook.commandErrorsReceived = 2;

    const summary = evaluateCaptureRestartGate(passingInput({ nativeHealth: health }));
    const reasons = summary.failureReasons.join("\n");
    expect(summary.restartEightHourCaptures).toBe(false);
    expect(reasons).toContain("terminal WebSocket failure");
    expect(reasons).toContain("unresolved recovery");
    expect(reasons).toContain("command-level WebSocket error");
  });

  it("refuses restart when a gap episode lacks a recovery outcome or counts run away", () => {
    const health = healthyNativeHealth();
    const orderbook = health.orderbook as Record<string, unknown>;
    orderbook.sequenceGapEpisodeCount = 2;
    orderbook.sequenceGapCount = 40;
    orderbook.snapshotRecoverySuccessCount = 1;

    const summary = evaluateCaptureRestartGate(passingInput({ nativeHealth: health }));
    const reasons = summary.failureReasons.join("\n");
    expect(summary.restartEightHourCaptures).toBe(false);
    expect(reasons).toContain("gap episodes without a recovery outcome");
    expect(reasons).toContain("does not reflect distinct episodes");
  });

  it("refuses restart when persistence streams did not drain", () => {
    const health = healthyNativeHealth();
    (health.writer as Record<string, unknown>).allStreamsDrained = false;

    const summary = evaluateCaptureRestartGate(passingInput({ nativeHealth: health }));
    expect(summary.restartEightHourCaptures).toBe(false);
    expect(summary.failureReasons.join("\n")).toContain(
      "persistence streams did not all drain",
    );
  });
});

describe("findActiveCaptureRuns", () => {
  function entry(
    runId: string,
    overrides: Partial<CaptureRunSelectionEntry> = {},
  ): CaptureRunSelectionEntry {
    return {
      runDir: `root/${runId}`,
      runId,
      status: null,
      statusIntegrity: "absent",
      hasCaptureHealth: false,
      completedAtMs: null,
      ...overrides,
    };
  }

  it("flags only strictly valid active/finalizing runs", () => {
    const active = entry("run-active", {
      statusIntegrity: "valid",
      status: {
        schemaVersion: 1,
        runId: "run-active",
        state: "active",
        startedAt: "2026-07-20T12:00:00.000Z",
        updatedAt: "2026-07-20T12:00:00.000Z",
        endedAt: null,
        captureEndReason: null,
        failureReason: null,
      },
    });
    const completed = entry("run-completed", {
      statusIntegrity: "valid",
      status: completedStatus({ runId: "run-completed" }),
    });
    const legacy = entry("run-legacy");

    expect(findActiveCaptureRuns([active, completed, legacy])).toEqual([
      { runId: "run-active", runDir: "root/run-active", state: "active" },
    ]);
  });
});

describe("capture restart gate summary schema", () => {
  it("serializes deterministically and round-trips through the strict parser", () => {
    const summary = evaluateCaptureRestartGate(passingInput());
    const serialized = serializeCaptureRestartGateSummary(summary);

    // Deterministic output: identical input yields byte-identical output.
    expect(serializeCaptureRestartGateSummary(summary)).toBe(serialized);

    const parsed = parseCaptureRestartGateSummary(serialized);
    expect(parsed).not.toBeNull();
    expect(parsed).toEqual(summary);
  });

  it("rejects partial, mistyped, or incoherent summaries", () => {
    const summary = evaluateCaptureRestartGate(passingInput());
    const base = JSON.parse(
      serializeCaptureRestartGateSummary(summary),
    ) as Record<string, unknown>;

    expect(parseCaptureRestartGateSummary("not json")).toBeNull();
    expect(parseCaptureRestartGateSummary("[1]")).toBeNull();
    expect(
      parseCaptureRestartGateSummary(JSON.stringify({ ...base, schemaVersion: 2 })),
    ).toBeNull();
    expect(
      parseCaptureRestartGateSummary(
        JSON.stringify({ ...base, restartEightHourCaptures: "yes" }),
      ),
    ).toBeNull();
    expect(
      parseCaptureRestartGateSummary(
        JSON.stringify({ ...base, validBookShare: "0.97" }),
      ),
    ).toBeNull();
    expect(
      parseCaptureRestartGateSummary(JSON.stringify({ ...base, failureReasons: [1] })),
    ).toBeNull();

    // A summary claiming readiness while carrying failures is incoherent.
    expect(
      parseCaptureRestartGateSummary(
        JSON.stringify({
          ...base,
          restartEightHourCaptures: true,
          failureReasons: ["some failure"],
        }),
      ),
    ).toBeNull();

    const missingField = { ...base } as Record<string, unknown>;
    delete missingField.auditVerdict;
    expect(parseCaptureRestartGateSummary(JSON.stringify(missingField))).toBeNull();
  });
});
