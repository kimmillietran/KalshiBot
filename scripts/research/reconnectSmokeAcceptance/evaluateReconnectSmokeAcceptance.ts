import {
  evaluateControlledReconnectLifecycle,
  parseCaptureLifecycleJsonl,
} from "./evaluateControlledReconnectLifecycle";
import type {
  ReconnectSmokeAcceptanceInput,
  ReconnectSmokeAcceptanceSummary,
  ReconnectSmokeAuditObserved,
  ReconnectSmokeHealthObserved,
  ReconnectSmokeStatusObserved,
} from "./reconnectSmokeAcceptanceTypes";
import { RECONNECT_SMOKE_ACCEPTANCE_SCHEMA_VERSION } from "./reconnectSmokeAcceptanceTypes";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNullableBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asNonNegativeInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    return null;
  }
  if (value < 0) {
    return null;
  }
  return value;
}

function isParseableTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return false;
  }
  return Number.isFinite(Date.parse(value));
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

function basename(path: string): string {
  const normalized = normalizePath(path);
  const parts = normalized.split("/");
  return parts[parts.length - 1] ?? "";
}

function readAuditVerdict(audit: ReconnectSmokeAuditObserved | null): string | null {
  if (audit === null) {
    return null;
  }
  const nested = audit.summary?.verdict;
  if (typeof nested === "string") {
    return nested;
  }
  if (typeof audit.verdict === "string") {
    return audit.verdict;
  }
  return null;
}

function readAuditSelectedRunId(audit: ReconnectSmokeAuditObserved | null): string | null {
  if (audit === null) {
    return null;
  }
  if (typeof audit.selectedRunId === "string") {
    return audit.selectedRunId;
  }
  return null;
}

function readNativeErrorCount(health: ReconnectSmokeHealthObserved | null): number | null {
  if (health === null || !Array.isArray(health.errors)) {
    return null;
  }
  return health.errors.length;
}

function writerFailurePresent(
  writer: ReconnectSmokeHealthObserved["writer"],
): boolean | null {
  if (writer === null || writer === undefined) {
    return null;
  }
  if (!("failure" in writer)) {
    return null;
  }
  return writer.failure !== null && writer.failure !== undefined;
}

/**
 * Fail-closed reconnect-smoke acceptance. Missing or wrong-typed fields deny.
 */
export function evaluateReconnectSmokeAcceptance(
  input: ReconnectSmokeAcceptanceInput,
): ReconnectSmokeAcceptanceSummary {
  const failedChecks: string[] = [];

  if (input.schemaVersion !== RECONNECT_SMOKE_ACCEPTANCE_SCHEMA_VERSION) {
    failedChecks.push(`schemaVersion=${String(input.schemaVersion)}`);
  }
  if (input.mode !== "reconnect-smoke") {
    failedChecks.push(`mode=${String(input.mode)}`);
  }
  if (typeof input.runId !== "string" || input.runId.length === 0) {
    failedChecks.push("runId-missing");
  }
  if (typeof input.runDir !== "string" || input.runDir.length === 0) {
    failedChecks.push("runDir-missing");
  } else if (basename(input.runDir) !== input.runId) {
    failedChecks.push(
      `runDir-basename-mismatch (${basename(input.runDir)} != ${input.runId})`,
    );
  }

  if (input.captureExitCode !== 0) {
    failedChecks.push(`capture-exit (${input.captureExitCode})`);
  }
  if (input.auditExitCode !== 0) {
    failedChecks.push(`capture-health-audit (${input.auditExitCode})`);
  }
  if (input.restartGateExitCode !== 0) {
    failedChecks.push(`restart-gate (${input.restartGateExitCode})`);
  }
  if (input.postRunPreflightExitCode !== 0) {
    failedChecks.push(`post-run-preflight (${input.postRunPreflightExitCode})`);
  }
  if (input.lockPresent !== false) {
    failedChecks.push("capture.lock-present");
  }

  const status = input.status;
  const health = input.health;
  const auditVerdict = readAuditVerdict(input.audit);
  const auditSelectedRunId = readAuditSelectedRunId(input.audit);

  if (auditVerdict !== "capture-research-ready") {
    failedChecks.push(`auditVerdict=${auditVerdict ?? "missing"}`);
  }
  if (auditSelectedRunId === null) {
    failedChecks.push("audit.selectedRunId-missing");
  } else if (auditSelectedRunId !== input.runId) {
    failedChecks.push(
      `audit.selectedRunId-mismatch (${auditSelectedRunId} != ${input.runId})`,
    );
  }

  evaluateStatus(input.runId, status, failedChecks);
  evaluateHealth(input.runId, health, failedChecks);

  if (
    status
    && health?.connection
    && status.captureEndReason !== health.connection.captureEndReason
  ) {
    failedChecks.push(
      `status/health-captureEndReason-mismatch (${String(status.captureEndReason)} != ${String(health.connection.captureEndReason)})`,
    );
  }

  const lifecycleRaw = input.lifecycleJsonl;
  let controlledProof = evaluateControlledReconnectLifecycle([]);
  if (typeof lifecycleRaw !== "string") {
    failedChecks.push("lifecycle-missing");
  } else {
    const parsed = parseCaptureLifecycleJsonl(lifecycleRaw, input.runId);
    failedChecks.push(...parsed.failedChecks);
    controlledProof = evaluateControlledReconnectLifecycle(parsed.events);
    failedChecks.push(...controlledProof.failedChecks);
  }
  if (!controlledProof.controlledReconnectProven) {
    if (!failedChecks.includes("controlledReconnectProven=false")) {
      // already covered by lifecycle failedChecks; keep explicit invariant
      failedChecks.push("controlledReconnectProven=false");
    }
  }

  const connection = health?.connection ?? null;
  const watchdog = health?.watchdog ?? null;
  const writer = health?.writer ?? null;
  const nativeErrorCount = readNativeErrorCount(health);
  const restartEightHourCaptures = input.restartGateExitCode === 0;

  return {
    schemaVersion: RECONNECT_SMOKE_ACCEPTANCE_SCHEMA_VERSION,
    mode: "reconnect-smoke",
    runId: input.runId,
    runDir: input.runDir,
    durationMinutes: input.durationMinutes,
    captureExitCode: input.captureExitCode,
    auditExitCode: input.auditExitCode,
    auditVerdict,
    auditSelectedRunId,
    nativeVerdict: asNullableString(health?.verdict),
    nativeErrorCount,
    runStatusState: asNullableString(status?.state),
    captureEndReason:
      asNullableString(status?.captureEndReason)
      ?? asNullableString(connection?.captureEndReason),
    completedNormally: asNullableBoolean(connection?.completedNormally),
    liveConnectionSucceeded: asNullableBoolean(connection?.liveConnectionSucceeded),
    reconnectCount: asNonNegativeInteger(connection?.reconnectCount),
    connectionAttemptCount: asNonNegativeInteger(connection?.connectionAttemptCount),
    authHeaderGenerationCount: asNonNegativeInteger(
      connection?.authHeaderGenerationCount,
    ),
    wsRecoverySuccessCount: asNonNegativeInteger(watchdog?.wsRecoverySuccessCount),
    wsRecoveryFailureCount: asNonNegativeInteger(watchdog?.wsRecoveryFailureCount),
    terminalWebSocketFailure: asNullableBoolean(watchdog?.terminalWebSocketFailure),
    allStreamsDrained: asNullableBoolean(writer?.allStreamsDrained),
    writerFailurePresent: writerFailurePresent(writer),
    restartGateExitCode: input.restartGateExitCode,
    restartEightHourCaptures,
    postRunPreflightExitCode: input.postRunPreflightExitCode,
    lockPresent: input.lockPresent,
    controlledReconnectRequestCount: controlledProof.controlledReconnectRequestCount,
    controlledReconnectRecoveryCycleId: controlledProof.controlledReconnectRecoveryCycleId,
    controlledReconnectRecoveryReason: controlledProof.controlledReconnectRecoveryReason,
    controlledReconnectAttemptCount: controlledProof.controlledReconnectAttemptCount,
    controlledReconnectSuccessCount: controlledProof.controlledReconnectSuccessCount,
    controlledReconnectFailureCount: controlledProof.controlledReconnectFailureCount,
    controlledReconnectProven: controlledProof.controlledReconnectProven,
    passed: failedChecks.length === 0,
    failedChecks,
  };
}

function evaluateStatus(
  expectedRunId: string,
  status: ReconnectSmokeStatusObserved | null,
  failedChecks: string[],
): void {
  if (status === null) {
    failedChecks.push("status-missing");
    return;
  }
  if (status.schemaVersion !== 1) {
    failedChecks.push(`status.schemaVersion=${String(status.schemaVersion)}`);
  }
  if (status.runId !== expectedRunId) {
    failedChecks.push(
      `status.runId-mismatch (${String(status.runId)} != ${expectedRunId})`,
    );
  }
  if (status.state !== "completed") {
    failedChecks.push(`status.state=${String(status.state)}`);
  }
  if (!isParseableTimestamp(status.startedAt)) {
    failedChecks.push("status.startedAt-invalid");
  }
  if (!isParseableTimestamp(status.endedAt)) {
    failedChecks.push("status.endedAt-invalid");
  } else if (
    isParseableTimestamp(status.startedAt)
    && Date.parse(status.endedAt) < Date.parse(status.startedAt)
  ) {
    failedChecks.push("status.endedAt-before-startedAt");
  }
  if (status.captureEndReason !== "duration-complete") {
    failedChecks.push(`status.captureEndReason=${String(status.captureEndReason)}`);
  }
  if (status.failureReason !== null) {
    failedChecks.push(`status.failureReason=${String(status.failureReason)}`);
  }
}

function evaluateHealth(
  expectedRunId: string,
  health: ReconnectSmokeHealthObserved | null,
  failedChecks: string[],
): void {
  if (health === null) {
    failedChecks.push("health-missing");
    return;
  }

  if (health.runId === undefined || health.runId === null) {
    failedChecks.push("health.runId-missing");
  } else if (health.runId !== expectedRunId) {
    failedChecks.push(
      `health.runId-mismatch (${String(health.runId)} != ${expectedRunId})`,
    );
  }
  if (health.verdict !== "capture-mvp-success") {
    failedChecks.push(`nativeVerdict=${String(health.verdict)}`);
  }
  if (!Array.isArray(health.errors)) {
    failedChecks.push("native-errors-missing");
  } else if (health.errors.length !== 0) {
    failedChecks.push(`native-errors-nonempty (${health.errors.length})`);
  }

  const connection = health.connection;
  if (connection === null || !isRecord(connection)) {
    failedChecks.push("health.connection-missing");
  } else {
    if (connection.completedNormally !== true) {
      failedChecks.push(`completedNormally=${String(connection.completedNormally)}`);
    }
    if (connection.liveConnectionSucceeded !== true) {
      failedChecks.push(
        `liveConnectionSucceeded=${String(connection.liveConnectionSucceeded)}`,
      );
    }
    if (connection.captureEndReason !== "duration-complete") {
      failedChecks.push(
        `health.captureEndReason=${String(connection.captureEndReason)}`,
      );
    }
    if (connection.terminalFailureReason !== null) {
      failedChecks.push(
        `terminalFailureReason=${String(connection.terminalFailureReason)}`,
      );
    }
    const reconnectCount = asNonNegativeInteger(connection.reconnectCount);
    if (reconnectCount === null || reconnectCount < 1) {
      failedChecks.push(`reconnectCount=${String(connection.reconnectCount)}`);
    }
    const connectionAttemptCount = asNonNegativeInteger(
      connection.connectionAttemptCount,
    );
    if (connectionAttemptCount === null || connectionAttemptCount < 2) {
      failedChecks.push(
        `connectionAttemptCount=${String(connection.connectionAttemptCount)}`,
      );
    }
    const authHeaderGenerationCount = asNonNegativeInteger(
      connection.authHeaderGenerationCount,
    );
    if (authHeaderGenerationCount === null || authHeaderGenerationCount < 2) {
      failedChecks.push(
        `authHeaderGenerationCount=${String(connection.authHeaderGenerationCount)}`,
      );
    }
  }

  const watchdog = health.watchdog;
  if (watchdog === null || !isRecord(watchdog)) {
    failedChecks.push("health.watchdog-missing");
  } else {
    const success = asNonNegativeInteger(watchdog.wsRecoverySuccessCount);
    if (success === null || success < 1) {
      failedChecks.push(
        `wsRecoverySuccessCount=${String(watchdog.wsRecoverySuccessCount)}`,
      );
    }
    if (watchdog.wsRecoveryFailureCount !== 0) {
      failedChecks.push(
        `wsRecoveryFailureCount=${String(watchdog.wsRecoveryFailureCount)}`,
      );
    }
    if (watchdog.terminalWebSocketFailure !== false) {
      failedChecks.push(
        `terminalWebSocketFailure=${String(watchdog.terminalWebSocketFailure)}`,
      );
    }
  }

  const writer = health.writer;
  if (writer === null || !isRecord(writer)) {
    failedChecks.push("health.writer-missing");
  } else {
    if (writer.allStreamsDrained !== true) {
      failedChecks.push(`allStreamsDrained=${String(writer.allStreamsDrained)}`);
    }
    if (!("failure" in writer)) {
      failedChecks.push("writer.failure-missing");
    } else if (writer.failure !== null && writer.failure !== undefined) {
      failedChecks.push("writer.failure-present");
    }
  }
}

export function parseReconnectSmokeJsonRecord(
  raw: string,
  label: string,
): Record<string, unknown> {
  const trimmed = raw.replace(/^\uFEFF/, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    throw new Error(`${label} is malformed JSON`);
  }
  if (!isRecord(parsed)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return parsed;
}
