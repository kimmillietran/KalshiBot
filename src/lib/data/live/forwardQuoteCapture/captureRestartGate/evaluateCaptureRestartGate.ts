import type { CaptureHealthAuditReport } from "@/lib/data/research/captureHealthAudit/captureHealthAuditTypes";

import type { CaptureRunStatusArtifact } from "../captureRunStatus";
import type { CaptureRunStatusIntegrity } from "../selectAuditableCaptureRun";

import {
  DEFAULT_CAPTURE_RESTART_GATE_THRESHOLDS,
  type CaptureRestartGateSummary,
  type CaptureRestartGateThresholds,
} from "./captureRestartGateTypes";

function readRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function basename(path: string): string {
  const normalized = path.replaceAll("\\", "/").replace(/\/+$/, "");
  return normalized.slice(normalized.lastIndexOf("/") + 1);
}

export type CaptureRestartGateInput = {
  generatedAt: string;
  runDir: string;
  runStatus: CaptureRunStatusArtifact | null;
  runStatusIntegrity: CaptureRunStatusIntegrity;
  /** Raw parsed capture-health.json (null when missing or unparseable). */
  nativeHealth: Record<string, unknown> | null;
  /** Strictly validated run-scoped audit report (null when invalid/missing). */
  audit: CaptureHealthAuditReport | null;
  auditErrors: readonly string[];
  auditFingerprintsVerified: boolean;
  auditFreshnessWarnings: readonly string[];
  expectedDurationMinutes: number | null;
  thresholds?: Partial<CaptureRestartGateThresholds>;
};

/**
 * Fields the restart policy requires from the native health artifact. A
 * health file missing any of them is partial and fails the gate closed.
 */
const REQUIRED_ORDERBOOK_COUNTERS = [
  "sequenceGapEpisodeCount",
  "sequenceGapCount",
  "deltasQuarantinedDuringResync",
  "snapshotRecoveryRequestCount",
  "snapshotRecoverySuccessCount",
  "snapshotRecoveryFailureCount",
  "snapshotRecoveryTimeoutCount",
  "snapshotRecoveryExhaustedCount",
  "pendingCommandTimeoutCount",
  "pendingCommandCountAtCaptureEnd",
  "marketsWithOutstandingRecoveryAtEnd",
  "commandErrorsReceived",
] as const;

/** Evaluates the frozen eight-hour restart acceptance criteria for one run. */
export function evaluateCaptureRestartGate(
  input: CaptureRestartGateInput,
): CaptureRestartGateSummary {
  const thresholds: CaptureRestartGateThresholds = {
    ...DEFAULT_CAPTURE_RESTART_GATE_THRESHOLDS,
    ...input.thresholds,
  };
  const failures: string[] = [];
  const dirRunId = basename(input.runDir);

  // --- Terminal run status ---------------------------------------------
  if (input.runStatusIntegrity !== "valid" || input.runStatus === null) {
    failures.push(
      `capture-run-status.json is ${input.runStatusIntegrity}; a strictly valid terminal status is required`,
    );
  } else {
    if (input.runStatus.state !== "completed") {
      failures.push(
        `terminal run status is "${input.runStatus.state}", expected "completed"`,
      );
    }
    if (input.runStatus.runId !== dirRunId) {
      failures.push(
        `run status runId "${input.runStatus.runId}" does not match run directory "${dirRunId}"`,
      );
    }
  }

  // --- Native health completeness (fail closed on partial artifacts) ----
  const health = input.nativeHealth;
  const orderbook = readRecord(health?.orderbook);
  const connection = readRecord(health?.connection);
  const capture = readRecord(health?.capture);
  const writer = readRecord(health?.writer);
  const watchdog = readRecord(health?.watchdog);

  const healthVerdict =
    typeof health?.verdict === "string" ? (health.verdict as string) : null;
  const healthRunId =
    typeof health?.runId === "string" ? (health.runId as string) : null;

  if (health === null) {
    failures.push("capture-health.json is missing or unparseable");
  } else {
    const partialReasons: string[] = [];
    if (healthVerdict === null) {
      partialReasons.push("verdict");
    }
    if (healthRunId === null) {
      partialReasons.push("runId");
    }
    if (connection === null) {
      partialReasons.push("connection");
    }
    if (capture === null) {
      partialReasons.push("capture");
    }
    if (writer === null) {
      partialReasons.push("writer");
    }
    if (orderbook === null) {
      partialReasons.push("orderbook");
    } else {
      for (const field of REQUIRED_ORDERBOOK_COUNTERS) {
        if (readFiniteNumber(orderbook[field]) === null) {
          partialReasons.push(`orderbook.${field}`);
        }
      }
    }
    if (partialReasons.length > 0) {
      failures.push(
        `native health artifact is partial; missing or invalid: ${partialReasons.join(", ")}`,
      );
    }
    if (healthRunId !== null && healthRunId !== dirRunId) {
      failures.push(
        `native health runId "${healthRunId}" does not match run directory "${dirRunId}"`,
      );
    }
  }

  // --- Audit verdict, schema, and freshness ------------------------------
  if (input.audit === null) {
    failures.push(
      `capture health audit is missing or invalid${
        input.auditErrors.length > 0 ? `: ${input.auditErrors.join("; ")}` : ""
      }`,
    );
  } else {
    if (input.audit.summary.verdict !== "capture-research-ready") {
      failures.push(
        `audit verdict is "${input.audit.summary.verdict}", expected "capture-research-ready"`,
      );
    }
    if (input.audit.selectedRunId !== dirRunId) {
      failures.push(
        `audit selectedRunId "${input.audit.selectedRunId}" does not match run directory "${dirRunId}"`,
      );
    }
  }
  if (!input.auditFingerprintsVerified) {
    failures.push(
      `audit artifact freshness could not be positively verified (stale or partial health artifacts are not allowed)${
        input.auditFreshnessWarnings.length > 0
          ? `: ${input.auditFreshnessWarnings.join("; ")}`
          : ""
      }`,
    );
  }

  // --- Quality thresholds -------------------------------------------------
  const durationSeconds = input.audit?.summary.runDurationSeconds ?? null;
  const expectedDurationSeconds =
    input.expectedDurationMinutes !== null
      ? input.expectedDurationMinutes * 60
      : null;
  if (expectedDurationSeconds !== null) {
    const tolerance = Math.max(
      expectedDurationSeconds * thresholds.durationToleranceShare,
      thresholds.durationToleranceFloorSeconds,
    );
    if (durationSeconds === null) {
      failures.push("run duration is unavailable; cannot verify duration tolerance");
    } else if (Math.abs(durationSeconds - expectedDurationSeconds) > tolerance) {
      failures.push(
        `run duration ${durationSeconds}s is outside ${expectedDurationSeconds}s ± ${tolerance}s`,
      );
    }
  }

  const validBookShare = input.audit?.summary.bookState.validBookShare ?? null;
  if (validBookShare === null || validBookShare < thresholds.minValidBookShare) {
    failures.push(
      `valid-book share ${validBookShare ?? "unavailable"} is below ${thresholds.minValidBookShare}`,
    );
  }

  const btcJoinCoverageShare = input.audit?.summary.btcJoin.joinCoverageShare ?? null;
  if (
    btcJoinCoverageShare === null
    || btcJoinCoverageShare < thresholds.minBtcJoinCoverageShare
  ) {
    failures.push(
      `BTC join coverage ${btcJoinCoverageShare ?? "unavailable"} is below ${thresholds.minBtcJoinCoverageShare}`,
    );
  }

  // --- WebSocket / recovery integrity -------------------------------------
  const terminalFailureReason = connection?.terminalFailureReason ?? null;
  if (terminalFailureReason !== null) {
    failures.push(`terminal WebSocket failure: ${String(terminalFailureReason)}`);
  }
  const captureEndReason = connection?.captureEndReason ?? null;
  if (health !== null && captureEndReason !== "duration-complete") {
    failures.push(
      `capture end reason is "${String(captureEndReason)}", expected "duration-complete"`,
    );
  }
  if (watchdog !== null && watchdog.terminalWebSocketFailure === true) {
    failures.push("watchdog recorded a terminal WebSocket failure");
  }

  const gapEpisodeCount = readFiniteNumber(orderbook?.sequenceGapEpisodeCount);
  const sequenceGapCount = readFiniteNumber(orderbook?.sequenceGapCount);
  const recoveryRequestCount = readFiniteNumber(orderbook?.snapshotRecoveryRequestCount);
  const recoverySuccessCount = readFiniteNumber(orderbook?.snapshotRecoverySuccessCount);
  const recoveryFailureCount = readFiniteNumber(orderbook?.snapshotRecoveryFailureCount);
  const recoveryTimeoutCount = readFiniteNumber(orderbook?.snapshotRecoveryTimeoutCount);
  const recoveryExhaustedCount = readFiniteNumber(
    orderbook?.snapshotRecoveryExhaustedCount,
  );
  const suppressedWhileResyncingCount = readFiniteNumber(
    orderbook?.deltasQuarantinedDuringResync,
  );

  if (orderbook !== null) {
    const unresolved: string[] = [];
    if ((readFiniteNumber(orderbook.marketsWithOutstandingRecoveryAtEnd) ?? 1) > 0) {
      unresolved.push("marketsWithOutstandingRecoveryAtEnd");
    }
    if ((recoveryTimeoutCount ?? 1) > 0) {
      unresolved.push("snapshotRecoveryTimeoutCount");
    }
    if ((recoveryExhaustedCount ?? 1) > 0) {
      unresolved.push("snapshotRecoveryExhaustedCount");
    }
    if ((readFiniteNumber(orderbook.pendingCommandCountAtCaptureEnd) ?? 1) > 0) {
      unresolved.push("pendingCommandCountAtCaptureEnd");
    }
    if (unresolved.length > 0) {
      failures.push(`unresolved recovery state remains: ${unresolved.join(", ")}`);
    }

    if ((readFiniteNumber(orderbook.commandErrorsReceived) ?? 1) > 0) {
      failures.push("command-level WebSocket error responses were received");
    }
    if ((readFiniteNumber(orderbook.pendingCommandTimeoutCount) ?? 1) > 0) {
      failures.push("pending WebSocket commands timed out without acknowledgement");
    }

    if (gapEpisodeCount !== null) {
      const outcomes =
        (recoverySuccessCount ?? 0)
        + (recoveryFailureCount ?? 0)
        + (recoveryTimeoutCount ?? 0);
      if (gapEpisodeCount > 0 && outcomes < gapEpisodeCount) {
        failures.push(
          `gap episodes without a recovery outcome: ${gapEpisodeCount} episodes, ${outcomes} outcomes`,
        );
      }
      if (sequenceGapCount !== null && sequenceGapCount !== gapEpisodeCount) {
        failures.push(
          `sequenceGapCount (${sequenceGapCount}) does not reflect distinct episodes (${gapEpisodeCount}); `
            + "suppressed resyncing deltas must be reported separately",
        );
      }
    }
  }

  // --- Persistence streams -------------------------------------------------
  const allStreamsDrained =
    typeof writer?.allStreamsDrained === "boolean"
      ? (writer.allStreamsDrained as boolean)
      : null;
  if (writer !== null) {
    if (allStreamsDrained !== true) {
      failures.push("persistence streams did not all drain during finalization");
    }
    if (writer.failure !== null && writer.failure !== undefined) {
      failures.push("the capture writer recorded a failure");
    }
  }

  return {
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    runId: input.runStatus?.runId ?? healthRunId ?? dirRunId,
    runDir: input.runDir,
    durationSeconds,
    expectedDurationSeconds,
    topOfBookCount: input.audit?.summary.topOfBookCount ?? null,
    btcSpotCount: input.audit?.summary.btcSpotCount ?? null,
    validBookShare,
    btcJoinCoverageShare,
    gapEpisodeCount,
    recoveryRequestCount,
    recoverySuccessCount,
    recoveryFailureCount,
    suppressedWhileResyncingCount,
    writerBackpressureCount: readFiniteNumber(writer?.backpressureEventCount),
    allStreamsDrained,
    nativeHealthStatus: healthVerdict,
    runStatusState: input.runStatus?.state ?? null,
    auditVerdict: input.audit?.summary.verdict ?? null,
    auditFingerprintsVerified: input.auditFingerprintsVerified,
    restartEightHourCaptures: failures.length === 0,
    failureReasons: failures,
  };
}
