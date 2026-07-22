import { describe, expect, it } from "vitest";

import type { CaptureHealthAuditReport } from "@/lib/data/research/captureHealthAudit/captureHealthAuditTypes";

import type { CaptureRunStatusArtifact } from "../captureRunStatus";
import type { CaptureRunSelectionEntry } from "../selectAuditableCaptureRun";

import {
  CANONICAL_EIGHT_HOUR_CAPTURE_PROFILE,
  verifyCanonicalCaptureProfile,
} from "./canonicalCaptureProfile";
import {
  parseCaptureRestartGateSummary,
  serializeCaptureRestartGateSummary,
} from "./captureRestartGateSummarySchema";
import {
  evaluateCaptureRestartGate,
  resolveEffectiveRestartThresholds,
} from "./evaluateCaptureRestartGate";
import { findCaptureStartBlockers } from "./findCaptureStartBlockers";
import { DEFAULT_CAPTURE_RESTART_GATE_THRESHOLDS } from "./captureRestartGateTypes";
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

function canonicalSmokeConfig(): Record<string, unknown> {
  return {
    series: CANONICAL_EIGHT_HOUR_CAPTURE_PROFILE.series,
    captureBtcSpot: true,
    topOfBookThrottleMs: CANONICAL_EIGHT_HOUR_CAPTURE_PROFILE.topOfBookThrottleMs,
    maxMarkets: CANONICAL_EIGHT_HOUR_CAPTURE_PROFILE.maxMarkets,
    wsWatchdogEnabled: true,
    priceRepresentation: CANONICAL_EIGHT_HOUR_CAPTURE_PROFILE.priceRepresentation,
    durationMinutes: 20,
  };
}

function healthyNativeHealth(): Record<string, unknown> {
  return {
    runId: RUN_ID,
    verdict: "capture-mvp-success",
    endedAt: "2026-07-20T12:20:00.000Z",
    config: canonicalSmokeConfig(),
    connection: {
      terminalFailureReason: null,
      captureEndReason: "duration-complete",
      completedNormally: true,
      liveConnectionSucceeded: true,
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
    errors: [],
  };
}

function readyAudit(
  overrides: {
    verdict?: string;
    selectedRunId?: string;
    runDurationSeconds?: number;
    validBookShare?: number | null;
    joinCoverageShare?: number | null;
    generatedAt?: string | null;
  } = {},
): CaptureHealthAuditReport {
  return {
    generatedAt:
      overrides.generatedAt === undefined
        ? "2026-07-20T12:25:00.000Z"
        : overrides.generatedAt,
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

describe("canonical eight-hour capture profile", () => {
  it("freezes the eight-hour workload shape", () => {
    expect(CANONICAL_EIGHT_HOUR_CAPTURE_PROFILE.series).toBe("KXBTC15M");
    expect(CANONICAL_EIGHT_HOUR_CAPTURE_PROFILE.captureBtcSpot).toBe(true);
    expect(CANONICAL_EIGHT_HOUR_CAPTURE_PROFILE.topOfBookThrottleMs).toBe(1_000);
    expect(CANONICAL_EIGHT_HOUR_CAPTURE_PROFILE.maxMarkets).toBe(5);
    expect(CANONICAL_EIGHT_HOUR_CAPTURE_PROFILE.wsWatchdogEnabled).toBe(true);
    expect(CANONICAL_EIGHT_HOUR_CAPTURE_PROFILE.priceRepresentation).toBe("legacy-no-leg");
    expect(CANONICAL_EIGHT_HOUR_CAPTURE_PROFILE.eightHourDurationMinutes).toBe(480);
    expect(CANONICAL_EIGHT_HOUR_CAPTURE_PROFILE.smokeDurationMinutesMin).toBe(15);
    expect(CANONICAL_EIGHT_HOUR_CAPTURE_PROFILE.smokeDurationMinutesMax).toBe(30);
  });

  it("accepts the canonical smoke config and fails closed on missing config", () => {
    expect(verifyCanonicalCaptureProfile(canonicalSmokeConfig())).toEqual([]);
    const missing = verifyCanonicalCaptureProfile(null);
    expect(missing).toHaveLength(1);
    expect(missing[0]!.field).toBe("config");
  });

  it("reports every mismatching field", () => {
    const config = canonicalSmokeConfig();
    config.topOfBookThrottleMs = 0;
    config.maxMarkets = 3;
    config.wsWatchdogEnabled = false;
    config.durationMinutes = 480;

    const mismatches = verifyCanonicalCaptureProfile(config);
    const fields = mismatches.map((entry) => entry.field);
    expect(fields).toContain("topOfBookThrottleMs");
    expect(fields).toContain("maxMarkets");
    expect(fields).toContain("wsWatchdogEnabled");
    expect(fields).toContain("durationMinutes");
  });
});

describe("resolveEffectiveRestartThresholds", () => {
  it("ignores attempts to weaken the frozen thresholds", () => {
    const weakened = resolveEffectiveRestartThresholds({
      minValidBookShare: 0,
      minBtcJoinCoverageShare: 0,
      durationToleranceShare: 100,
      durationToleranceFloorSeconds: 100_000,
    });
    expect(weakened).toEqual(DEFAULT_CAPTURE_RESTART_GATE_THRESHOLDS);
  });

  it("accepts strictly stricter overrides", () => {
    const stricter = resolveEffectiveRestartThresholds({
      minValidBookShare: 0.99,
      durationToleranceShare: 0.01,
    });
    expect(stricter.minValidBookShare).toBe(0.99);
    expect(stricter.durationToleranceShare).toBe(0.01);
    expect(stricter.minBtcJoinCoverageShare).toBe(
      DEFAULT_CAPTURE_RESTART_GATE_THRESHOLDS.minBtcJoinCoverageShare,
    );
  });
});

describe("evaluateCaptureRestartGate", () => {
  it("approves restart for a fully healthy completed smoke run", () => {
    const summary = evaluateCaptureRestartGate(passingInput());

    expect(summary.failureReasons).toEqual([]);
    expect(summary.restartEightHourCaptures).toBe(true);
    expect(summary.runId).toBe(RUN_ID);
    expect(summary.durationSeconds).toBe(1_200);
    expect(summary.expectedDurationSeconds).toBe(1_200);
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

  it("refuses restart when ONLY the native verdict degrades (regression)", () => {
    const health = healthyNativeHealth();
    health.verdict = "degraded-capture";

    const summary = evaluateCaptureRestartGate(passingInput({ nativeHealth: health }));

    expect(summary.restartEightHourCaptures).toBe(false);
    expect(summary.failureReasons).toEqual([
      'native health verdict is "degraded-capture", expected "capture-mvp-success"',
    ]);
  });

  it("refuses restart when native errors are present or completion flags are false", () => {
    const withErrors = healthyNativeHealth();
    withErrors.errors = ["Kalshi WS subscribe send failed"];
    const errorsSummary = evaluateCaptureRestartGate(
      passingInput({ nativeHealth: withErrors }),
    );
    expect(errorsSummary.restartEightHourCaptures).toBe(false);
    expect(errorsSummary.failureReasons.join("\n")).toContain(
      "native health recorded 1 error(s)",
    );

    const notNormal = healthyNativeHealth();
    (notNormal.connection as Record<string, unknown>).completedNormally = false;
    const notNormalSummary = evaluateCaptureRestartGate(
      passingInput({ nativeHealth: notNormal }),
    );
    expect(notNormalSummary.restartEightHourCaptures).toBe(false);
    expect(notNormalSummary.failureReasons.join("\n")).toContain("completedNormally");

    const notLive = healthyNativeHealth();
    (notLive.connection as Record<string, unknown>).liveConnectionSucceeded = false;
    const notLiveSummary = evaluateCaptureRestartGate(
      passingInput({ nativeHealth: notLive }),
    );
    expect(notLiveSummary.restartEightHourCaptures).toBe(false);
    expect(notLiveSummary.failureReasons.join("\n")).toContain(
      "liveConnectionSucceeded",
    );
  });

  it("refuses restart when the capture config differs from the canonical profile", () => {
    const health = healthyNativeHealth();
    (health.config as Record<string, unknown>).topOfBookThrottleMs = 0;
    (health.config as Record<string, unknown>).maxMarkets = 3;

    const summary = evaluateCaptureRestartGate(passingInput({ nativeHealth: health }));
    const reasons = summary.failureReasons.join("\n");
    expect(summary.restartEightHourCaptures).toBe(false);
    expect(reasons).toContain("canonical eight-hour profile");
    expect(reasons).toContain("topOfBookThrottleMs expected 1000, got 0");
    expect(reasons).toContain("maxMarkets expected 5, got 3");
  });

  it("refuses restart when the watchdog diagnostics are missing", () => {
    const health = healthyNativeHealth();
    delete health.watchdog;

    const summary = evaluateCaptureRestartGate(passingInput({ nativeHealth: health }));
    expect(summary.restartEightHourCaptures).toBe(false);
    expect(summary.failureReasons.join("\n")).toContain("watchdog diagnostics are missing");
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

  it("refuses restart when the audit was generated before the run ended", () => {
    const summary = evaluateCaptureRestartGate(
      passingInput({
        audit: readyAudit({ generatedAt: "2026-07-20T12:10:00.000Z" }),
      }),
    );
    expect(summary.restartEightHourCaptures).toBe(false);
    expect(summary.failureReasons.join("\n")).toContain(
      "must be created after the run ended",
    );
  });

  it("refuses restart when the audit timestamp is missing or the status chronology is inverted", () => {
    const missingTimestamp = evaluateCaptureRestartGate(
      passingInput({ audit: readyAudit({ generatedAt: null }) }),
    );
    expect(missingTimestamp.restartEightHourCaptures).toBe(false);
    expect(missingTimestamp.failureReasons.join("\n")).toContain(
      "audit generatedAt is missing",
    );

    const invertedStatus = evaluateCaptureRestartGate(
      passingInput({
        runStatus: completedStatus({ startedAt: "2026-07-20T12:30:00.000Z" }),
      }),
    );
    expect(invertedStatus.restartEightHourCaptures).toBe(false);
    expect(invertedStatus.failureReasons.join("\n")).toContain("precedes startedAt");
  });

  it("always validates duration against the capture's own recorded config", () => {
    // Omitting the operator flag does NOT bypass duration validation.
    const shortRun = evaluateCaptureRestartGate(
      passingInput({
        expectedDurationMinutes: null,
        audit: readyAudit({ runDurationSeconds: 300 }),
      }),
    );
    expect(shortRun.restartEightHourCaptures).toBe(false);
    expect(shortRun.failureReasons.join("\n")).toContain("outside 1200s");

    // A config without a recorded duration fails closed.
    const health = healthyNativeHealth();
    delete (health.config as Record<string, unknown>).durationMinutes;
    const noConfigDuration = evaluateCaptureRestartGate(
      passingInput({ expectedDurationMinutes: null, nativeHealth: health }),
    );
    expect(noConfigDuration.restartEightHourCaptures).toBe(false);
    expect(noConfigDuration.failureReasons.join("\n")).toContain(
      "duration validation cannot be bypassed",
    );

    // An operator-declared duration must exactly match the recorded config.
    const mismatch = evaluateCaptureRestartGate(
      passingInput({ expectedDurationMinutes: 25 }),
    );
    expect(mismatch.restartEightHourCaptures).toBe(false);
    expect(mismatch.failureReasons.join("\n")).toContain(
      "does not match the capture's recorded config duration",
    );
  });

  it("ignores threshold injection that would weaken the frozen gate", () => {
    const summary = evaluateCaptureRestartGate(
      passingInput({
        audit: readyAudit({ validBookShare: 0.2, joinCoverageShare: 0.2 }),
        thresholds: {
          minValidBookShare: 0,
          minBtcJoinCoverageShare: 0,
          durationToleranceShare: 100,
        },
      }),
    );
    expect(summary.restartEightHourCaptures).toBe(false);
    const reasons = summary.failureReasons.join("\n");
    expect(reasons).toContain("valid-book share");
    expect(reasons).toContain("BTC join coverage");
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

  it("allows restart after a successful correlated snapshot recovery with clean timeouts", () => {
    const health = healthyNativeHealth();
    const orderbook = health.orderbook as Record<string, unknown>;
    orderbook.sequenceGapEpisodeCount = 1;
    orderbook.sequenceGapCount = 1;
    orderbook.snapshotRecoveryRequestCount = 1;
    orderbook.snapshotRecoverySuccessCount = 1;
    orderbook.snapshotRecoveryFailureCount = 0;
    orderbook.pendingCommandTimeoutCount = 0;
    orderbook.pendingCommandCountAtCaptureEnd = 0;
    orderbook.marketsWithOutstandingRecoveryAtEnd = 0;
    orderbook.commandErrorsReceived = 0;

    const summary = evaluateCaptureRestartGate(passingInput({ nativeHealth: health }));
    expect(summary.restartEightHourCaptures).toBe(true);
    expect(summary.failureReasons).toEqual([]);
  });

  it("still refuses restart for a genuine unacknowledged get_snapshot timeout", () => {
    const health = healthyNativeHealth();
    const orderbook = health.orderbook as Record<string, unknown>;
    orderbook.sequenceGapEpisodeCount = 1;
    orderbook.sequenceGapCount = 1;
    orderbook.snapshotRecoveryRequestCount = 1;
    orderbook.snapshotRecoverySuccessCount = 0;
    orderbook.pendingCommandTimeoutCount = 1;
    orderbook.snapshotAckTimeoutCount = 1;
    health.errors = [
      "Kalshi WS get_snapshot command (id=3) was never acknowledged within 10000ms",
    ];

    const summary = evaluateCaptureRestartGate(passingInput({ nativeHealth: health }));
    expect(summary.restartEightHourCaptures).toBe(false);
    expect(summary.failureReasons.join("\n")).toMatch(/pending|timeout|error|recovery/i);
  });

  it("still refuses restart when pending commands remain at capture end", () => {
    const health = healthyNativeHealth();
    const orderbook = health.orderbook as Record<string, unknown>;
    orderbook.pendingCommandCountAtCaptureEnd = 1;

    const summary = evaluateCaptureRestartGate(passingInput({ nativeHealth: health }));
    expect(summary.restartEightHourCaptures).toBe(false);
    expect(summary.failureReasons.join("\n")).toContain("unresolved recovery");
  });
});

describe("findCaptureStartBlockers", () => {
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

  it("blocks active/finalizing runs and treats corrupt status markers as blockers", () => {
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
    const corrupt = entry("run-corrupt", { statusIntegrity: "invalid" });
    const mismatched = entry("run-mismatched", {
      statusIntegrity: "identity-mismatched",
    });

    const blockers = findCaptureStartBlockers([
      active,
      completed,
      legacy,
      corrupt,
      mismatched,
    ]);

    expect(blockers).toEqual([
      { runId: "run-active", runDir: "root/run-active", reason: "active" },
      { runId: "run-corrupt", runDir: "root/run-corrupt", reason: "invalid-status" },
      {
        runId: "run-mismatched",
        runDir: "root/run-mismatched",
        reason: "identity-mismatched-status",
      },
    ]);
  });

  it("does not block verified terminal or legacy pre-status runs", () => {
    const completed = entry("run-completed", {
      statusIntegrity: "valid",
      status: completedStatus({ runId: "run-completed" }),
    });
    const legacy = entry("run-legacy", { hasCaptureHealth: true });
    expect(findCaptureStartBlockers([completed, legacy])).toEqual([]);
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
