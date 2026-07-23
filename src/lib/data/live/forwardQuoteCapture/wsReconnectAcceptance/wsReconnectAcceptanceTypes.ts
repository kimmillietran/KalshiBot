/**
 * Deterministic WebSocket reconnect acceptance harness (M12.1G).
 *
 * Proves reconnect auth finalization: fresh headers per attempt, contained
 * handshake failures, process safety, and clean finalization — without
 * contacting Kalshi or using operator credentials.
 */

export const WS_RECONNECT_ACCEPTANCE_SCENARIOS = [
  /** First connect OK; forced reconnect succeeds only with fresh auth headers. */
  "reconnect-success",
  /** First connect OK; every reconnect handshake is HTTP 401 → terminal failure. */
  "reconnect-401-terminal",
  /** Auth header generation throws on reconnect; failure is contained. */
  "auth-generation-throw",
  /** First reconnect 401, second reconnect succeeds with fresh headers. */
  "second-attempt-success",
] as const;

export type WsReconnectAcceptanceScenario =
  (typeof WS_RECONNECT_ACCEPTANCE_SCENARIOS)[number];

/** Safe identity for a recorded connect attempt (never full signatures/keys). */
export type ReconnectAuthAttemptIdentity = {
  /** KALSHI-ACCESS-TIMESTAMP value used for this attempt. */
  timestamp: string;
  /** SHA-256 hex prefix of the signature (not the raw signature). */
  signatureHashPrefix: string;
  /** Last 4 characters of the signature for pairwise comparison only. */
  signatureLast4: string;
};

export type WsReconnectProcessSafety = {
  uncaughtExceptionCount: number;
  unhandledRejectionCount: number;
};

/** Everything the harness observed from the run's artifacts and diagnostics. */
export type WsReconnectAcceptanceObserved = {
  runId: string;
  runDir: string;
  scenario: WsReconnectAcceptanceScenario;
  connectionAttemptCount: number;
  authHeaderGenerationCount: number;
  /** Distinct header identities recorded by the scripted transport. */
  authAttemptIdentities: readonly ReconnectAuthAttemptIdentity[];
  /** True when every pair of attempts differs in timestamp and signature identity. */
  authAttemptsDistinct: boolean;
  reconnectCount: number;
  wsRecoverySuccessCount: number;
  wsRecoveryFailureCount: number;
  terminalWebSocketFailure: boolean;
  captureEndReason: string | null;
  runStatusState: string | null;
  healthVerdict: string;
  healthErrors: readonly string[];
  lockReleased: boolean;
  streamsDrained: boolean | null;
  noCredentialLeakArtifacts: boolean;
  credentialLeakArtifacts: readonly string[];
  processSafety: WsReconnectProcessSafety;
};

export type WsReconnectAcceptanceCheck = {
  id: string;
  description: string;
  passed: boolean;
  detail: string;
};

export type WsReconnectAcceptanceEvaluation = {
  passed: boolean;
  checks: readonly WsReconnectAcceptanceCheck[];
  failures: readonly string[];
};

export type WsReconnectAcceptanceReport = {
  schemaVersion: 1;
  generatedAt: string;
  scenario: WsReconnectAcceptanceScenario;
  passed: boolean;
  observed: WsReconnectAcceptanceObserved;
  checks: readonly WsReconnectAcceptanceCheck[];
  failures: readonly string[];
  /** Ordered wire-level transcript of the deterministic scenario. */
  transcript: readonly string[];
};
