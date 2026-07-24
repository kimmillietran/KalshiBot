export type KalshiWsWatchdogState =
  | "healthy"
  | "suspected-stall"
  | "probing"
  | "recovering"
  | "terminal-failure";

export type KalshiWsWatchdogConfig = {
  enabled: boolean;
  watchdogTickMs: number;
  wsSoftSilenceThresholdMs: number;
  wsHardStallThresholdMs: number;
  wsProbeGraceMs: number;
  wsRecoveryInitialBackoffMs: number;
  wsRecoveryMaxBackoffMs: number;
  wsRecoveryMaxAttempts: number;
  wsPostSubscribeConfirmationMs: number;
  systemSleepJumpThresholdMs: number;
  wsInitialGraceMs: number;
};

export type KalshiWsLifecycleEventType =
  | "wsStallSuspected"
  | "wsStallDetected"
  | "wsProbeSent"
  | "wsProbeSucceeded"
  | "wsRecoveryAttempted"
  | "wsRecoverySucceeded"
  | "wsRecoveryFailed"
  | "wsBooksMarkedUnsynchronized"
  | "wsBooksResynchronized"
  | "suspectedSystemSleep";

export type KalshiWsLifecycleEvent = {
  type: KalshiWsLifecycleEventType;
  detectedAt: string;
  socketGeneration: number;
  [key: string]: unknown;
};

export type KalshiWsLivenessSignals = {
  lastAnyKalshiRawMessageAt: string | null;
  lastExpectedMarketMessageAt: string | null;
  lastWebSocketOpenAt: string | null;
  lastWebSocketCloseAt: string | null;
  lastPingSentAt: string | null;
  lastPongReceivedAt: string | null;
  lastSuccessfulSubscriptionAt: string | null;
  lastTopOfBookEmissionAt: string | null;
  activeSubscriptionCount: number;
  currentSocketGeneration: number;
};

export type KalshiWsWatchdogDiagnostics = {
  state: KalshiWsWatchdogState;
  wsStallDetectedCount: number;
  wsRecoveryAttemptCount: number;
  wsRecoverySuccessCount: number;
  wsRecoveryFailureCount: number;
  postResumeRecoveryCount: number;
  longestKalshiSilenceMs: number;
  longestRecoveredStallMs: number;
  terminalWebSocketFailure: boolean;
  kalshiStreamEndedAt: string | null;
  btcStreamEndedAt: string | null;
  kalshiSilentWhileBtcActiveSeconds: number;
  lifecycleEvents: readonly KalshiWsLifecycleEvent[];
  liveness: KalshiWsLivenessSignals;
};

export type KalshiWsRecoveryResult =
  | { status: "succeeded"; firstRawMessageAt: string; subscriptionsRestored: number }
  | { status: "failed"; reason: string };

export type KalshiWsRecoveryExecutor = (input: {
  attemptNumber: number;
  reason: string;
  recoveryCycleId: number;
  socketGeneration: number;
  activeMarketTickers: readonly string[];
  backoffMs: number;
}) => Promise<KalshiWsRecoveryResult>;

/** Reason string used by M12.1G controlled reconnect validation. */
export const CONTROLLED_RECONNECT_VALIDATION_REASON =
  "controlled-reconnect-validation" as const;

/**
 * Outcome of requestEscalatedRecovery — never a silent void no-op.
 * Callers must know whether the recovery was accepted, deferred, or rejected.
 */
export type KalshiWsEscalatedRecoveryRequestResult =
  | {
    status: "started";
    recoveryCycleId: number;
    recoveryReason: string;
  }
  | {
    status: "busy";
    activeRecoveryCycleId: number | null;
    activeRecoveryReason: string | null;
  }
  | {
    status: "rejected";
    reason: "disabled" | "stopping" | "terminal-failure";
  };
