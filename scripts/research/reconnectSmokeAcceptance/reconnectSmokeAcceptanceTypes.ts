/**
 * M12.1G corrective: observed inputs for the controlled reconnect smoke gate.
 * Fail closed on missing fields — never coerce null into success.
 */

export const RECONNECT_SMOKE_ACCEPTANCE_SCHEMA_VERSION = 1 as const;

export type ReconnectSmokeStatusObserved = {
  schemaVersion: unknown;
  runId: unknown;
  state: unknown;
  endedAt: unknown;
  captureEndReason: unknown;
  failureReason: unknown;
};

export type ReconnectSmokeHealthObserved = {
  runId?: unknown;
  verdict: unknown;
  errors: unknown;
  connection: {
    completedNormally: unknown;
    liveConnectionSucceeded: unknown;
    captureEndReason: unknown;
    terminalFailureReason: unknown;
    reconnectCount: unknown;
    connectionAttemptCount: unknown;
    authHeaderGenerationCount: unknown;
  } | null;
  watchdog: {
    wsRecoverySuccessCount: unknown;
    wsRecoveryFailureCount: unknown;
    terminalWebSocketFailure: unknown;
  } | null;
  writer: {
    allStreamsDrained: unknown;
    failure: unknown;
  } | null;
};

export type ReconnectSmokeAuditObserved = {
  summary?: {
    verdict?: unknown;
  } | null;
  verdict?: unknown;
};

export type ReconnectSmokeAcceptanceInput = {
  schemaVersion: typeof RECONNECT_SMOKE_ACCEPTANCE_SCHEMA_VERSION;
  mode: "reconnect-smoke";
  runId: string;
  runDir: string;
  durationMinutes: number;
  captureExitCode: number;
  auditExitCode: number;
  restartGateExitCode: number;
  postRunPreflightExitCode: number;
  lockPresent: boolean;
  status: ReconnectSmokeStatusObserved | null;
  health: ReconnectSmokeHealthObserved | null;
  audit: ReconnectSmokeAuditObserved | null;
};

export type ReconnectSmokeAcceptanceSummary = {
  schemaVersion: typeof RECONNECT_SMOKE_ACCEPTANCE_SCHEMA_VERSION;
  mode: "reconnect-smoke";
  runId: string;
  runDir: string;
  durationMinutes: number;
  captureExitCode: number;
  auditExitCode: number;
  auditVerdict: string | null;
  nativeVerdict: string | null;
  nativeErrorCount: number | null;
  runStatusState: string | null;
  captureEndReason: string | null;
  completedNormally: boolean | null;
  liveConnectionSucceeded: boolean | null;
  reconnectCount: number | null;
  connectionAttemptCount: number | null;
  authHeaderGenerationCount: number | null;
  wsRecoverySuccessCount: number | null;
  wsRecoveryFailureCount: number | null;
  terminalWebSocketFailure: boolean | null;
  allStreamsDrained: boolean | null;
  writerFailurePresent: boolean | null;
  restartGateExitCode: number;
  restartEightHourCaptures: boolean;
  postRunPreflightExitCode: number;
  lockPresent: boolean;
  passed: boolean;
  failedChecks: string[];
};
