/**
 * Authoritative reconnect-smoke authorization evidence for gated eight-hour starts.
 *
 * Issued only by the reconnect-smoke operator wrapper via
 * issueReconnectSmokeAuthorization from real orchestration values.
 * The public evaluateReconnectSmokeGate CLI is evaluation-only and cannot mint
 * this artifact. Eight-hour startup verifies fail-closed and never fabricates codes.
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
 * Prefer issueReconnectSmokeAuthorization — this low-level writer does not
 * enforce the trust boundary (existence check / passed-only).
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
    // Prefer an fsync when practical. Opening read-only and calling fsync can
    // raise EPERM on Windows; use r+ and treat EPERM as best-effort skip.
    const fd = openSync(tempPath, "r+");
    try {
      try {
        fsyncSync(fd);
      } catch (error) {
        const code =
          error && typeof error === "object" && "code" in error
            ? String((error as { code?: unknown }).code)
            : "";
        if (code !== "EPERM" && code !== "EACCES") {
          throw error;
        }
      }
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

/**
 * Wrapper-internal authorization issuance. Not exposed via any public CLI.
 *
 * Fail-closed:
 * - only when acceptance.passed === true and orchestration is clean;
 * - refuses to overwrite an existing reconnect-smoke-authorization.json;
 * - writes atomically (temp + fsync + rename).
 */
export function issueReconnectSmokeAuthorization(options: {
  runDir: string;
  acceptance: ReconnectSmokeAcceptanceSummary;
  generatedAt?: string;
  exists?: (path: string) => boolean;
  writeSummary?: (
    runDir: string,
    summary: ReconnectSmokeAuthorizationSummary,
  ) => string;
}): string {
  const acceptance = options.acceptance;
  const runDir = options.runDir;
  const exists = options.exists ?? existsSync;
  const writeSummary =
    options.writeSummary ?? writeReconnectSmokeAuthorizationSummary;
  const targetPath = reconnectSmokeAuthorizationPath(runDir);

  if (acceptance.passed !== true) {
    throw new Error(
      "Refusing to issue reconnect-smoke authorization: acceptance.passed=false",
    );
  }
  if (acceptance.captureExitCode !== 0) {
    throw new Error(
      `Refusing to issue reconnect-smoke authorization: captureExitCode=${acceptance.captureExitCode}`,
    );
  }
  if (acceptance.auditExitCode !== 0) {
    throw new Error(
      `Refusing to issue reconnect-smoke authorization: auditExitCode=${acceptance.auditExitCode}`,
    );
  }
  if (acceptance.restartGateExitCode !== 0) {
    throw new Error(
      `Refusing to issue reconnect-smoke authorization: restartGateExitCode=${acceptance.restartGateExitCode}`,
    );
  }
  if (acceptance.postRunPreflightExitCode !== 0) {
    throw new Error(
      `Refusing to issue reconnect-smoke authorization: postRunPreflightExitCode=${acceptance.postRunPreflightExitCode}`,
    );
  }
  if (acceptance.lockPresent !== false) {
    throw new Error(
      "Refusing to issue reconnect-smoke authorization: lockPresent=true",
    );
  }
  if (acceptance.controlledReconnectProven !== true) {
    throw new Error(
      "Refusing to issue reconnect-smoke authorization: controlledReconnectProven=false",
    );
  }

  if (exists(targetPath)) {
    throw new Error(
      `reconnect-smoke-authorization.json already exists at ${targetPath}; refusing to overwrite`,
    );
  }

  const summary = buildReconnectSmokeAuthorizationSummary({
    acceptance,
    gateExitCode: 0,
    generatedAt: options.generatedAt,
  });
  if (summary.passed !== true) {
    throw new Error(
      "Refusing to issue reconnect-smoke authorization: built summary passed=false",
    );
  }

  const verified = verifyPersistedReconnectSmokeAuthorization({
    expectedRunDir: runDir,
    summary,
  });
  if (!verified.ok) {
    throw new Error(
      "Refusing to issue reconnect-smoke authorization: "
        + verified.reasons.join("; "),
    );
  }

  return writeSummary(runDir, summary);
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
  smokeDurationMinutesMin?: number;
  smokeDurationMinutesMax?: number;
}): ReconnectAuthorizationAcceptance | ReconnectAuthorizationDenial {
  const reasons: string[] = [];
  const expectedRunDir = normalizeRunDir(options.expectedRunDir);
  const expectedRunId = expectedRunDir.split("/").at(-1) ?? "";
  const summary = options.summary;
  const durationMin = options.smokeDurationMinutesMin ?? 15;
  const durationMax = options.smokeDurationMinutesMax ?? 20;

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
  if (
    summary.durationMinutes < durationMin
    || summary.durationMinutes > durationMax
  ) {
    reasons.push(
      `durationMinutes=${summary.durationMinutes} outside reconnect smoke window `
        + `${durationMin}-${durationMax}`,
    );
  }
  if (summary.nativeVerdict !== "capture-mvp-success") {
    reasons.push(`nativeVerdict=${String(summary.nativeVerdict)}`);
  }
  if (summary.nativeErrorCount !== 0) {
    reasons.push(`nativeErrorCount=${String(summary.nativeErrorCount)}`);
  }
  if (summary.auditSelectedRunId !== summary.runId) {
    reasons.push(
      `auditSelectedRunId mismatch (summary=${String(summary.auditSelectedRunId)}, `
        + `runId=${summary.runId})`,
    );
  }
  if (summary.runStatusState !== "completed") {
    reasons.push(`runStatusState=${String(summary.runStatusState)}`);
  }
  if (summary.captureEndReason !== "duration-complete") {
    reasons.push(`captureEndReason=${String(summary.captureEndReason)}`);
  }
  if (summary.completedNormally !== true) {
    reasons.push(`completedNormally=${String(summary.completedNormally)}`);
  }
  if (summary.liveConnectionSucceeded !== true) {
    reasons.push(
      `liveConnectionSucceeded=${String(summary.liveConnectionSucceeded)}`,
    );
  }
  if (
    summary.reconnectCount === null
    || summary.reconnectCount < 1
  ) {
    reasons.push(`reconnectCount=${String(summary.reconnectCount)}`);
  }
  if (
    summary.connectionAttemptCount === null
    || summary.connectionAttemptCount < 2
  ) {
    reasons.push(
      `connectionAttemptCount=${String(summary.connectionAttemptCount)}`,
    );
  }
  if (
    summary.authHeaderGenerationCount === null
    || summary.authHeaderGenerationCount < 2
  ) {
    reasons.push(
      `authHeaderGenerationCount=${String(summary.authHeaderGenerationCount)}`,
    );
  }
  // Every WebSocket connection attempt must generate fresh authentication
  // headers exactly once (PR #40).
  if (
    summary.connectionAttemptCount !== null
    && summary.authHeaderGenerationCount !== null
    && summary.authHeaderGenerationCount !== summary.connectionAttemptCount
  ) {
    reasons.push(
      `authHeaderGenerationCount=${summary.authHeaderGenerationCount} `
        + `!= connectionAttemptCount=${summary.connectionAttemptCount}`,
    );
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

function pushMismatch(
  reasons: string[],
  field: string,
  authorizationValue: unknown,
  currentValue: unknown,
): void {
  if (authorizationValue !== currentValue) {
    reasons.push(
      `${field} mismatch (authorization=${String(authorizationValue)}, `
        + `current=${String(currentValue)})`,
    );
  }
}

/**
 * Require complete agreement between persisted authorization and a fresh
 * reconnect acceptance evaluation of current exact-run artifacts.
 */
export function comparePersistedAuthorizationToCurrentAcceptance(options: {
  summary: ReconnectSmokeAuthorizationSummary;
  current: ReconnectSmokeAcceptanceSummary;
  expectedRunDir: string;
}): string[] {
  const reasons: string[] = [];
  const summary = options.summary;
  const current = options.current;
  const expectedRunDir = normalizeRunDir(options.expectedRunDir);

  pushMismatch(reasons, "runId", summary.runId, current.runId);
  pushMismatch(
    reasons,
    "runDir",
    normalizeRunDir(summary.runDir),
    normalizeRunDir(current.runDir),
  );
  if (normalizeRunDir(current.runDir) !== expectedRunDir) {
    reasons.push(
      `runDir mismatch (authorization=${normalizeRunDir(summary.runDir)}, `
        + `current=${normalizeRunDir(current.runDir)})`,
    );
  }
  pushMismatch(
    reasons,
    "durationMinutes",
    summary.durationMinutes,
    current.durationMinutes,
  );
  pushMismatch(
    reasons,
    "auditSelectedRunId",
    summary.auditSelectedRunId,
    current.auditSelectedRunId,
  );
  pushMismatch(
    reasons,
    "runStatusState",
    summary.runStatusState,
    current.runStatusState,
  );
  pushMismatch(
    reasons,
    "captureEndReason",
    summary.captureEndReason,
    current.captureEndReason,
  );
  pushMismatch(
    reasons,
    "completedNormally",
    summary.completedNormally,
    current.completedNormally,
  );
  pushMismatch(
    reasons,
    "liveConnectionSucceeded",
    summary.liveConnectionSucceeded,
    current.liveConnectionSucceeded,
  );
  pushMismatch(
    reasons,
    "nativeVerdict",
    summary.nativeVerdict,
    current.nativeVerdict,
  );
  pushMismatch(
    reasons,
    "nativeErrorCount",
    summary.nativeErrorCount,
    current.nativeErrorCount,
  );
  pushMismatch(
    reasons,
    "allStreamsDrained",
    summary.allStreamsDrained,
    current.allStreamsDrained,
  );
  pushMismatch(
    reasons,
    "writerFailurePresent",
    summary.writerFailurePresent,
    current.writerFailurePresent,
  );
  pushMismatch(
    reasons,
    "wsRecoveryFailureCount",
    summary.wsRecoveryFailureCount,
    current.wsRecoveryFailureCount,
  );
  pushMismatch(
    reasons,
    "terminalWebSocketFailure",
    summary.terminalWebSocketFailure,
    current.terminalWebSocketFailure,
  );
  pushMismatch(
    reasons,
    "controlledReconnectProven",
    summary.controlledReconnectProven,
    current.controlledReconnectProven,
  );
  pushMismatch(
    reasons,
    "reconnectCount",
    summary.reconnectCount,
    current.reconnectCount,
  );
  pushMismatch(
    reasons,
    "connectionAttemptCount",
    summary.connectionAttemptCount,
    current.connectionAttemptCount,
  );
  pushMismatch(
    reasons,
    "authHeaderGenerationCount",
    summary.authHeaderGenerationCount,
    current.authHeaderGenerationCount,
  );
  pushMismatch(
    reasons,
    "captureExitCode",
    summary.captureExitCode,
    current.captureExitCode,
  );
  pushMismatch(
    reasons,
    "auditExitCode",
    summary.auditExitCode,
    current.auditExitCode,
  );
  pushMismatch(
    reasons,
    "restartGateExitCode",
    summary.restartGateExitCode,
    current.restartGateExitCode,
  );
  pushMismatch(
    reasons,
    "postRunPreflightExitCode",
    summary.postRunPreflightExitCode,
    current.postRunPreflightExitCode,
  );
  pushMismatch(reasons, "lockPresent", summary.lockPresent, current.lockPresent);
  pushMismatch(reasons, "passed", summary.passed, current.passed);

  // Every WebSocket connection attempt must generate fresh authentication
  // headers exactly once (PR #40) — enforce on the current evaluation too.
  if (
    current.connectionAttemptCount !== null
    && current.authHeaderGenerationCount !== null
    && current.authHeaderGenerationCount !== current.connectionAttemptCount
  ) {
    reasons.push(
      `authHeaderGenerationCount=${current.authHeaderGenerationCount} `
        + `!= connectionAttemptCount=${current.connectionAttemptCount}`,
    );
  }

  // Deduplicate if runDir mismatch was pushed twice.
  return [...new Set(reasons)];
}

/**
 * Re-evaluate current exact-run artifacts against the persisted orchestration
 * evidence. Never fabricates exit codes — uses the summary's recorded values.
 * Requires complete persisted/current field agreement.
 */
export function revalidateReconnectAuthorizationAgainstCurrentArtifacts(options: {
  expectedRunDir: string;
  summary: ReconnectSmokeAuthorizationSummary;
  statusRecord: Record<string, unknown>;
  healthRecord: Record<string, unknown>;
  auditRecord: Record<string, unknown>;
  lifecycleJsonl: string;
  evaluateAcceptance: (input: {
    schemaVersion: 1;
    mode: "reconnect-smoke";
    runId: string;
    runDir: string;
    durationMinutes: number;
    captureExitCode: number;
    auditExitCode: number;
    restartGateExitCode: number;
    postRunPreflightExitCode: number;
    lockPresent: boolean;
    status: Record<string, unknown>;
    health: {
      runId: unknown;
      verdict: unknown;
      errors: unknown;
      connection: Record<string, unknown> | null;
      watchdog: Record<string, unknown> | null;
      writer: Record<string, unknown> | null;
    };
    audit: Record<string, unknown>;
    lifecycleJsonl: string;
  }) => ReconnectSmokeAcceptanceSummary;
}): ReconnectAuthorizationAcceptance | ReconnectAuthorizationDenial {
  const summary = options.summary;
  const fieldCheck = verifyPersistedReconnectSmokeAuthorization({
    expectedRunDir: options.expectedRunDir,
    summary,
  });
  if (!fieldCheck.ok) {
    return fieldCheck;
  }

  const healthConnection =
    options.healthRecord.connection !== null
    && typeof options.healthRecord.connection === "object"
    && !Array.isArray(options.healthRecord.connection)
      ? (options.healthRecord.connection as Record<string, unknown>)
      : null;
  const healthWatchdog =
    options.healthRecord.watchdog !== null
    && typeof options.healthRecord.watchdog === "object"
    && !Array.isArray(options.healthRecord.watchdog)
      ? (options.healthRecord.watchdog as Record<string, unknown>)
      : null;
  const healthWriter =
    options.healthRecord.writer !== null
    && typeof options.healthRecord.writer === "object"
    && !Array.isArray(options.healthRecord.writer)
      ? (options.healthRecord.writer as Record<string, unknown>)
      : null;

  const reevaluated = options.evaluateAcceptance({
    schemaVersion: 1,
    mode: "reconnect-smoke",
    runId: summary.runId,
    runDir: normalizeRunDir(options.expectedRunDir),
    durationMinutes: summary.durationMinutes,
    captureExitCode: summary.captureExitCode,
    auditExitCode: summary.auditExitCode,
    restartGateExitCode: summary.restartGateExitCode,
    postRunPreflightExitCode: summary.postRunPreflightExitCode,
    lockPresent: summary.lockPresent,
    status: options.statusRecord,
    health: {
      runId: options.healthRecord.runId,
      verdict: options.healthRecord.verdict,
      errors: options.healthRecord.errors,
      connection: healthConnection,
      watchdog: healthWatchdog,
      writer: healthWriter,
    },
    audit: options.auditRecord,
    lifecycleJsonl: options.lifecycleJsonl,
  });

  const reasons: string[] = [];
  if (!reevaluated.passed) {
    reasons.push(
      `current-artifact reconnect acceptance failed: ${reevaluated.failedChecks.join(", ")}`,
    );
  }
  if (reevaluated.controlledReconnectProven !== true) {
    reasons.push("current lifecycle controlledReconnectProven=false");
  }

  reasons.push(
    ...comparePersistedAuthorizationToCurrentAcceptance({
      summary,
      current: reevaluated,
      expectedRunDir: options.expectedRunDir,
    }),
  );

  if (reasons.length > 0) {
    return { ok: false, reasons: [...new Set(reasons)] };
  }
  return { ok: true, summary };
}
