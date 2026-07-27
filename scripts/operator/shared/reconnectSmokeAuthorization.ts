/**
 * Authoritative reconnect-smoke authorization evidence for gated eight-hour starts.
 *
 * Written only by the reconnect-smoke evaluator from actual orchestration values.
 * Eight-hour startup verifies this artifact fail-closed and never fabricates codes.
 */
import {
  closeSync,
  existsSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

import type { ReconnectSmokeAcceptanceSummary } from "../../research/reconnectSmokeAcceptance/reconnectSmokeAcceptanceTypes";

export const RECONNECT_SMOKE_AUTHORIZATION_SCHEMA_VERSION = 1 as const;
export const RECONNECT_SMOKE_AUTHORIZATION_FILENAME =
  "reconnect-smoke-authorization.json";

export type ReconnectSmokeAuthorizationSummary = {
  schemaVersion: typeof RECONNECT_SMOKE_AUTHORIZATION_SCHEMA_VERSION;
  mode: "reconnect-smoke-authorization";
  generatedAt: string;
  runId: string;
  runDir: string;
  durationMinutes: number;
  captureExitCode: number;
  auditExitCode: number;
  restartGateExitCode: number;
  postRunPreflightExitCode: number;
  lockPresent: boolean;
  gateExitCode: number;
  passed: boolean;
  controlledReconnectProven: boolean;
  auditSelectedRunId: string | null;
  nativeVerdict: string | null;
  nativeErrorCount: number | null;
  runStatusState: string | null;
  captureEndReason: string | null;
  completedNormally: boolean | null;
  liveConnectionSucceeded: boolean | null;
  reconnectCount: number | null;
  connectionAttemptCount: number | null;
  authHeaderGenerationCount: number | null;
  wsRecoveryFailureCount: number | null;
  terminalWebSocketFailure: boolean | null;
  allStreamsDrained: boolean | null;
  writerFailurePresent: boolean | null;
};

export function reconnectSmokeAuthorizationPath(runDir: string): string {
  return join(runDir, RECONNECT_SMOKE_AUTHORIZATION_FILENAME);
}

export function normalizeRunDir(runDir: string): string {
  return resolve(runDir).replaceAll("\\", "/").replace(/\/+$/, "");
}

export function buildReconnectSmokeAuthorizationSummary(options: {
  acceptance: ReconnectSmokeAcceptanceSummary;
  gateExitCode: number;
  generatedAt?: string;
}): ReconnectSmokeAuthorizationSummary {
  const { acceptance, gateExitCode } = options;
  return {
    schemaVersion: RECONNECT_SMOKE_AUTHORIZATION_SCHEMA_VERSION,
    mode: "reconnect-smoke-authorization",
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    runId: acceptance.runId,
    runDir: normalizeRunDir(acceptance.runDir),
    durationMinutes: acceptance.durationMinutes,
    captureExitCode: acceptance.captureExitCode,
    auditExitCode: acceptance.auditExitCode,
    restartGateExitCode: acceptance.restartGateExitCode,
    postRunPreflightExitCode: acceptance.postRunPreflightExitCode,
    lockPresent: acceptance.lockPresent,
    gateExitCode,
    passed: acceptance.passed && gateExitCode === 0,
    controlledReconnectProven: acceptance.controlledReconnectProven,
    auditSelectedRunId: acceptance.auditSelectedRunId,
    nativeVerdict: acceptance.nativeVerdict,
    nativeErrorCount: acceptance.nativeErrorCount,
    runStatusState: acceptance.runStatusState,
    captureEndReason: acceptance.captureEndReason,
    completedNormally: acceptance.completedNormally,
    liveConnectionSucceeded: acceptance.liveConnectionSucceeded,
    reconnectCount: acceptance.reconnectCount,
    connectionAttemptCount: acceptance.connectionAttemptCount,
    authHeaderGenerationCount: acceptance.authHeaderGenerationCount,
    wsRecoveryFailureCount: acceptance.wsRecoveryFailureCount,
    terminalWebSocketFailure: acceptance.terminalWebSocketFailure,
    allStreamsDrained: acceptance.allStreamsDrained,
    writerFailurePresent: acceptance.writerFailurePresent,
  };
}

/**
 * Atomically write the authorization summary via temp-file + fsync + rename.
 */
export function writeReconnectSmokeAuthorizationSummary(
  runDir: string,
  summary: ReconnectSmokeAuthorizationSummary,
): string {
  const targetPath = reconnectSmokeAuthorizationPath(runDir);
  const tempPath = `${targetPath}.${process.pid}.tmp`;
  const payload = `${JSON.stringify(summary)}\n`;

  try {
    writeFileSync(tempPath, payload, "utf8");
    const fd = openSync(tempPath, "r");
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(tempPath, targetPath);
    return targetPath;
  } catch (error) {
    try {
      if (existsSync(tempPath)) {
        unlinkSync(tempPath);
      }
    } catch {
      // Best-effort temp cleanup.
    }
    throw error;
  }
}

function requireBoolean(record: Record<string, unknown>, key: string): boolean {
  const value = record[key];
  if (typeof value !== "boolean") {
    throw new Error(`reconnect-smoke-authorization.json missing boolean ${key}`);
  }
  return value;
}

function requireInteger(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`reconnect-smoke-authorization.json missing integer ${key}`);
  }
  return value;
}

function requireString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`reconnect-smoke-authorization.json missing string ${key}`);
  }
  return value;
}

function requireNullableString(
  record: Record<string, unknown>,
  key: string,
): string | null {
  const value = record[key];
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error(
      `reconnect-smoke-authorization.json ${key} must be string or null`,
    );
  }
  return value;
}

function requireNullableNumber(
  record: Record<string, unknown>,
  key: string,
): number | null {
  const value = record[key];
  if (value === null) {
    return null;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(
      `reconnect-smoke-authorization.json ${key} must be number or null`,
    );
  }
  return value;
}

function requireNullableBoolean(
  record: Record<string, unknown>,
  key: string,
): boolean | null {
  const value = record[key];
  if (value === null) {
    return null;
  }
  if (typeof value !== "boolean") {
    throw new Error(
      `reconnect-smoke-authorization.json ${key} must be boolean or null`,
    );
  }
  return value;
}

export function parseReconnectSmokeAuthorizationSummary(
  text: string,
): ReconnectSmokeAuthorizationSummary {
  let parsed: unknown;
  try {
    const normalized = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    parsed = JSON.parse(normalized);
  } catch {
    throw new Error("reconnect-smoke-authorization.json is malformed JSON");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("reconnect-smoke-authorization.json must be a JSON object");
  }
  const record = parsed as Record<string, unknown>;

  if (record.schemaVersion !== RECONNECT_SMOKE_AUTHORIZATION_SCHEMA_VERSION) {
    throw new Error(
      `reconnect-smoke-authorization.json unsupported schemaVersion `
        + `(expected ${RECONNECT_SMOKE_AUTHORIZATION_SCHEMA_VERSION})`,
    );
  }
  if (record.mode !== "reconnect-smoke-authorization") {
    throw new Error(
      "reconnect-smoke-authorization.json mode must be reconnect-smoke-authorization",
    );
  }

  return {
    schemaVersion: RECONNECT_SMOKE_AUTHORIZATION_SCHEMA_VERSION,
    mode: "reconnect-smoke-authorization",
    generatedAt: requireString(record, "generatedAt"),
    runId: requireString(record, "runId"),
    runDir: requireString(record, "runDir"),
    durationMinutes: requireInteger(record, "durationMinutes"),
    captureExitCode: requireInteger(record, "captureExitCode"),
    auditExitCode: requireInteger(record, "auditExitCode"),
    restartGateExitCode: requireInteger(record, "restartGateExitCode"),
    postRunPreflightExitCode: requireInteger(record, "postRunPreflightExitCode"),
    lockPresent: requireBoolean(record, "lockPresent"),
    gateExitCode: requireInteger(record, "gateExitCode"),
    passed: requireBoolean(record, "passed"),
    controlledReconnectProven: requireBoolean(record, "controlledReconnectProven"),
    auditSelectedRunId: requireNullableString(record, "auditSelectedRunId"),
    nativeVerdict: requireNullableString(record, "nativeVerdict"),
    nativeErrorCount: requireNullableNumber(record, "nativeErrorCount"),
    runStatusState: requireNullableString(record, "runStatusState"),
    captureEndReason: requireNullableString(record, "captureEndReason"),
    completedNormally: requireNullableBoolean(record, "completedNormally"),
    liveConnectionSucceeded: requireNullableBoolean(
      record,
      "liveConnectionSucceeded",
    ),
    reconnectCount: requireNullableNumber(record, "reconnectCount"),
    connectionAttemptCount: requireNullableNumber(
      record,
      "connectionAttemptCount",
    ),
    authHeaderGenerationCount: requireNullableNumber(
      record,
      "authHeaderGenerationCount",
    ),
    wsRecoveryFailureCount: requireNullableNumber(
      record,
      "wsRecoveryFailureCount",
    ),
    terminalWebSocketFailure: requireNullableBoolean(
      record,
      "terminalWebSocketFailure",
    ),
    allStreamsDrained: requireNullableBoolean(record, "allStreamsDrained"),
    writerFailurePresent: requireNullableBoolean(record, "writerFailurePresent"),
  };
}

export function readReconnectSmokeAuthorizationSummary(
  runDir: string,
): ReconnectSmokeAuthorizationSummary {
  const path = reconnectSmokeAuthorizationPath(runDir);
  if (!existsSync(path)) {
    throw new Error(
      `reconnect-smoke-authorization.json missing for run directory ${runDir}`,
    );
  }
  return parseReconnectSmokeAuthorizationSummary(readFileSync(path, "utf8"));
}

export type ReconnectAuthorizationDenial = {
  ok: false;
  reasons: string[];
};

export type ReconnectAuthorizationAcceptance = {
  ok: true;
  summary: ReconnectSmokeAuthorizationSummary;
};

/**
 * Fail-closed verification of a persisted reconnect-smoke authorization summary.
 * Does not fabricate orchestration values and does not select "latest".
 */
export function verifyPersistedReconnectSmokeAuthorization(options: {
  expectedRunDir: string;
  summary: ReconnectSmokeAuthorizationSummary;
}): ReconnectAuthorizationAcceptance | ReconnectAuthorizationDenial {
  const reasons: string[] = [];
  const expectedRunDir = normalizeRunDir(options.expectedRunDir);
  const expectedRunId = expectedRunDir.split("/").at(-1) ?? "";
  const summary = options.summary;

  if (summary.runId !== expectedRunId) {
    reasons.push(
      `runId mismatch (summary=${summary.runId}, expected=${expectedRunId})`,
    );
  }
  if (normalizeRunDir(summary.runDir) !== expectedRunDir) {
    reasons.push(
      `runDir mismatch (summary=${summary.runDir}, expected=${expectedRunDir})`,
    );
  }
  if (summary.passed !== true) {
    reasons.push("authorization summary passed=false");
  }
  if (summary.gateExitCode !== 0) {
    reasons.push(`gateExitCode=${summary.gateExitCode}`);
  }
  if (summary.captureExitCode !== 0) {
    reasons.push(`captureExitCode=${summary.captureExitCode}`);
  }
  if (summary.auditExitCode !== 0) {
    reasons.push(`auditExitCode=${summary.auditExitCode}`);
  }
  if (summary.restartGateExitCode !== 0) {
    reasons.push(`restartGateExitCode=${summary.restartGateExitCode}`);
  }
  if (summary.postRunPreflightExitCode !== 0) {
    reasons.push(
      `postRunPreflightExitCode=${summary.postRunPreflightExitCode}`,
    );
  }
  if (summary.lockPresent !== false) {
    reasons.push("lockPresent must be false in authorization summary");
  }
  if (summary.controlledReconnectProven !== true) {
    reasons.push("controlledReconnectProven must be true");
  }
  if (summary.nativeErrorCount !== 0) {
    reasons.push(`nativeErrorCount=${String(summary.nativeErrorCount)}`);
  }
  if (summary.writerFailurePresent !== false) {
    reasons.push("writerFailurePresent must be false");
  }
  if (summary.allStreamsDrained !== true) {
    reasons.push("allStreamsDrained must be true");
  }
  if (summary.terminalWebSocketFailure !== false) {
    reasons.push("terminalWebSocketFailure must be false");
  }
  if (summary.wsRecoveryFailureCount !== 0) {
    reasons.push(
      `wsRecoveryFailureCount=${String(summary.wsRecoveryFailureCount)}`,
    );
  }

  if (reasons.length > 0) {
    return { ok: false, reasons };
  }
  return { ok: true, summary };
}
