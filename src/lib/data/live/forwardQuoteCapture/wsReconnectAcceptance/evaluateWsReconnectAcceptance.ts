import type {
  WsReconnectAcceptanceCheck,
  WsReconnectAcceptanceEvaluation,
  WsReconnectAcceptanceObserved,
  WsReconnectAcceptanceScenario,
} from "./wsReconnectAcceptanceTypes";

function check(
  checks: WsReconnectAcceptanceCheck[],
  id: string,
  description: string,
  passed: boolean,
  detail: string,
): void {
  checks.push({ id, description, passed, detail });
}

function evaluateCommonSafety(observed: WsReconnectAcceptanceObserved): WsReconnectAcceptanceCheck[] {
  const checks: WsReconnectAcceptanceCheck[] = [];

  check(
    checks,
    "process-safety-uncaught",
    "No uncaughtException events during the acceptance run",
    observed.processSafety.uncaughtExceptionCount === 0,
    `uncaughtExceptionCount=${observed.processSafety.uncaughtExceptionCount}`,
  );
  check(
    checks,
    "process-safety-unhandled-rejection",
    "No unhandledRejection events during the acceptance run",
    observed.processSafety.unhandledRejectionCount === 0,
    `unhandledRejectionCount=${observed.processSafety.unhandledRejectionCount}`,
  );
  check(
    checks,
    "lock-released",
    "The global capture lock was released after the run",
    observed.lockReleased,
    `lockReleased=${observed.lockReleased}`,
  );
  check(
    checks,
    "streams-drained",
    "All persistence streams drained during writer finalization",
    observed.streamsDrained === true,
    `streamsDrained=${observed.streamsDrained}`,
  );
  check(
    checks,
    "no-credential-leaks",
    "No credential material appears in any capture artifact",
    observed.noCredentialLeakArtifacts && observed.credentialLeakArtifacts.length === 0,
    `credentialLeakArtifacts=[${observed.credentialLeakArtifacts.join(",")}]`,
  );

  return checks;
}

function evaluateReconnectSuccess(
  observed: WsReconnectAcceptanceObserved,
): WsReconnectAcceptanceCheck[] {
  const checks: WsReconnectAcceptanceCheck[] = [];

  check(
    checks,
    "auth-header-generation-count",
    "Auth headers were generated at least twice (initial + reconnect)",
    observed.authHeaderGenerationCount >= 2,
    `authHeaderGenerationCount=${observed.authHeaderGenerationCount}`,
  );
  check(
    checks,
    "connection-attempt-count",
    "At least two connection attempts were recorded",
    observed.connectionAttemptCount >= 2,
    `connectionAttemptCount=${observed.connectionAttemptCount}`,
  );
  check(
    checks,
    "auth-attempts-distinct",
    "Reconnect auth attempts used distinct timestamps and signature identities",
    observed.authAttemptsDistinct && observed.authAttemptIdentities.length >= 2,
    `authAttemptsDistinct=${observed.authAttemptsDistinct} `
      + `identities=${observed.authAttemptIdentities.length}`,
  );
  check(
    checks,
    "reconnect-count",
    "At least one reconnect was recorded",
    observed.reconnectCount >= 1,
    `reconnectCount=${observed.reconnectCount}`,
  );
  check(
    checks,
    "ws-recovery-success",
    "Watchdog recorded at least one successful WebSocket recovery",
    observed.wsRecoverySuccessCount >= 1,
    `wsRecoverySuccessCount=${observed.wsRecoverySuccessCount}`,
  );
  check(
    checks,
    "not-terminal-websocket-failure",
    "The run did not end in terminal WebSocket failure",
    observed.terminalWebSocketFailure === false,
    `terminalWebSocketFailure=${observed.terminalWebSocketFailure}`,
  );
  check(
    checks,
    "capture-end-duration-complete",
    "Capture ended with duration-complete after a successful reconnect",
    observed.captureEndReason === "duration-complete",
    `captureEndReason=${observed.captureEndReason}`,
  );
  check(
    checks,
    "run-status-completed",
    "Terminal run status is completed",
    observed.runStatusState === "completed",
    `runStatusState=${observed.runStatusState}`,
  );
  check(
    checks,
    "native-health-success",
    "Native health reports capture-mvp-success with no errors",
    observed.healthVerdict === "capture-mvp-success"
      && observed.healthErrors.length === 0,
    `healthVerdict=${observed.healthVerdict} healthErrors=${observed.healthErrors.length}`,
  );

  return checks;
}

function evaluateReconnect401Terminal(
  observed: WsReconnectAcceptanceObserved,
): WsReconnectAcceptanceCheck[] {
  const checks: WsReconnectAcceptanceCheck[] = [];

  check(
    checks,
    "auth-header-generation-count",
    "Auth headers were generated for initial connect and at least one reconnect",
    observed.authHeaderGenerationCount >= 2,
    `authHeaderGenerationCount=${observed.authHeaderGenerationCount}`,
  );
  check(
    checks,
    "reconnect-attempted",
    "At least one reconnect was attempted before terminal failure",
    observed.reconnectCount >= 1,
    `reconnectCount=${observed.reconnectCount}`,
  );
  check(
    checks,
    "ws-recovery-failure",
    "Watchdog recorded at least one WebSocket recovery failure",
    observed.wsRecoveryFailureCount >= 1,
    `wsRecoveryFailureCount=${observed.wsRecoveryFailureCount}`,
  );
  check(
    checks,
    "terminal-websocket-failure",
    "Watchdog marked terminal WebSocket failure after reconnect 401 exhaustion",
    observed.terminalWebSocketFailure === true,
    `terminalWebSocketFailure=${observed.terminalWebSocketFailure}`,
  );
  check(
    checks,
    "capture-end-terminal-websocket",
    "Capture ended with terminal-websocket-failure",
    observed.captureEndReason === "terminal-websocket-failure",
    `captureEndReason=${observed.captureEndReason}`,
  );
  check(
    checks,
    "run-status-failed",
    "Terminal run status is failed",
    observed.runStatusState === "failed",
    `runStatusState=${observed.runStatusState}`,
  );
  check(
    checks,
    "health-not-mvp-success",
    "Native health does not report capture-mvp-success after terminal reconnect failure",
    observed.healthVerdict !== "capture-mvp-success",
    `healthVerdict=${observed.healthVerdict}`,
  );
  check(
    checks,
    "sanitized-401-in-errors",
    "Health errors include a sanitized reconnect 401 message (no credential material)",
    observed.healthErrors.some(
      (error) => error.includes("401") && !error.includes("KALSHI-ACCESS"),
    ),
    `healthErrors=${JSON.stringify(observed.healthErrors)}`,
  );

  return checks;
}

function evaluateAuthGenerationThrow(
  observed: WsReconnectAcceptanceObserved,
): WsReconnectAcceptanceCheck[] {
  const checks: WsReconnectAcceptanceCheck[] = [];

  check(
    checks,
    "reconnect-attempted",
    "A reconnect was attempted after the initial connection",
    observed.reconnectCount >= 1 || observed.connectionAttemptCount >= 2,
    `reconnectCount=${observed.reconnectCount} `
      + `connectionAttemptCount=${observed.connectionAttemptCount}`,
  );
  check(
    checks,
    "failure-contained",
    "Auth-generation / reconnect failure became terminal without process crash",
    observed.terminalWebSocketFailure === true
      || observed.captureEndReason === "terminal-websocket-failure",
    `terminalWebSocketFailure=${observed.terminalWebSocketFailure} `
      + `captureEndReason=${observed.captureEndReason}`,
  );
  check(
    checks,
    "run-status-failed",
    "Terminal run status is failed",
    observed.runStatusState === "failed",
    `runStatusState=${observed.runStatusState}`,
  );

  return checks;
}

function evaluateSecondAttemptSuccess(
  observed: WsReconnectAcceptanceObserved,
): WsReconnectAcceptanceCheck[] {
  const checks: WsReconnectAcceptanceCheck[] = [];

  check(
    checks,
    "auth-header-generation-count",
    "Auth headers were generated at least three times (initial + failed + successful reconnect)",
    observed.authHeaderGenerationCount >= 3,
    `authHeaderGenerationCount=${observed.authHeaderGenerationCount}`,
  );
  check(
    checks,
    "auth-attempts-distinct",
    "Successful reconnect used distinct timestamp/signature from earlier attempts",
    observed.authAttemptsDistinct && observed.authAttemptIdentities.length >= 2,
    `authAttemptsDistinct=${observed.authAttemptsDistinct} `
      + `identities=${observed.authAttemptIdentities.length}`,
  );
  check(
    checks,
    "ws-recovery-success",
    "Watchdog recorded a successful recovery after the failed first reconnect",
    observed.wsRecoverySuccessCount >= 1,
    `wsRecoverySuccessCount=${observed.wsRecoverySuccessCount}`,
  );
  check(
    checks,
    "multiple-auth-reconnect-attempts",
    "At least three connection attempts occurred (initial + failed reconnect + successful reconnect)",
    observed.connectionAttemptCount >= 3,
    `connectionAttemptCount=${observed.connectionAttemptCount}`,
  );
  check(
    checks,
    "not-terminal-websocket-failure",
    "The run did not remain in terminal WebSocket failure after second-attempt success",
    observed.terminalWebSocketFailure === false,
    `terminalWebSocketFailure=${observed.terminalWebSocketFailure}`,
  );
  check(
    checks,
    "capture-end-duration-complete",
    "Capture ended with duration-complete after second-attempt success",
    observed.captureEndReason === "duration-complete",
    `captureEndReason=${observed.captureEndReason}`,
  );
  check(
    checks,
    "run-status-completed",
    "Terminal run status is completed",
    observed.runStatusState === "completed",
    `runStatusState=${observed.runStatusState}`,
  );

  return checks;
}

const SCENARIO_EVALUATORS: Record<
  WsReconnectAcceptanceScenario,
  (observed: WsReconnectAcceptanceObserved) => WsReconnectAcceptanceCheck[]
> = {
  "reconnect-success": evaluateReconnectSuccess,
  "reconnect-401-terminal": evaluateReconnect401Terminal,
  "auth-generation-throw": evaluateAuthGenerationThrow,
  "second-attempt-success": evaluateSecondAttemptSuccess,
};

/**
 * Pure acceptance policy for a reconnect scenario. Every check must pass
 * for the scenario to be considered proven.
 */
export function evaluateWsReconnectAcceptance(
  observed: WsReconnectAcceptanceObserved,
): WsReconnectAcceptanceEvaluation {
  const checks = [
    ...evaluateCommonSafety(observed),
    ...SCENARIO_EVALUATORS[observed.scenario](observed),
  ];

  const failures = checks
    .filter((entry) => !entry.passed)
    .map((entry) => `${entry.id}: ${entry.description} (${entry.detail})`);

  return { passed: failures.length === 0, checks, failures };
}
