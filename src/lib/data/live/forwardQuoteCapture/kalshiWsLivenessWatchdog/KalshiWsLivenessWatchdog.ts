import type {
  KalshiWsLifecycleEvent,
  KalshiWsRecoveryExecutor,
  KalshiWsWatchdogConfig,
  KalshiWsWatchdogDiagnostics,
  KalshiWsWatchdogState,
} from "./kalshiWsWatchdogTypes";

function computeBackoffMs(
  attemptNumber: number,
  config: KalshiWsWatchdogConfig,
): number {
  const exponent = Math.max(0, attemptNumber - 1);
  const backoff = config.wsRecoveryInitialBackoffMs * 2 ** exponent;
  const jitter = Math.floor(Math.random() * 250);
  return Math.min(config.wsRecoveryMaxBackoffMs, backoff + jitter);
}

/** Single-flight Kalshi WebSocket liveness watchdog with staged probe and recovery. */
export class KalshiWsLivenessWatchdog {
  private state: KalshiWsWatchdogState = "healthy";
  private lifecycleEvents: KalshiWsLifecycleEvent[] = [];
  private socketGeneration = 0;
  private disabled = false;
  private captureStartedAtMonotonicMs: number | null = null;
  private lastWatchdogTickMonotonicMs: number | null = null;
  private lastRawMessageMonotonicMs: number | null = null;
  private lastTopOfBookMonotonicMs: number | null = null;
  private lastBtcActivityMonotonicMs: number | null = null;
  private lastRawMessageAt: string | null = null;
  private lastTopOfBookAt: string | null = null;
  private lastWebSocketOpenAt: string | null = null;
  private lastWebSocketCloseAt: string | null = null;
  private lastPingSentAt: string | null = null;
  private lastPongReceivedAt: string | null = null;
  private lastSuccessfulSubscriptionAt: string | null = null;
  private activeSubscriptionCount = 0;
  private connected = false;
  private probeStartedAtMonotonicMs: number | null = null;
  private recoveryPromise: Promise<void> | null = null;
  private wsStallDetectedCount = 0;
  private wsRecoveryAttemptCount = 0;
  private wsRecoverySuccessCount = 0;
  private wsRecoveryFailureCount = 0;
  private postResumeRecoveryCount = 0;
  private longestKalshiSilenceMs = 0;
  private longestRecoveredStallMs = 0;
  private terminalWebSocketFailure = false;
  private kalshiStreamEndedAt: string | null = null;
  private kalshiSilentWhileBtcActiveSeconds = 0;
  private silentWhileBtcActiveStartMonotonicMs: number | null = null;
  private stallDetectedAtMonotonicMs: number | null = null;

  constructor(
    private readonly config: KalshiWsWatchdogConfig,
    private readonly deps: {
      now: () => Date;
      monotonicNowMs: () => number;
      onEvent?: (event: KalshiWsLifecycleEvent) => void;
      onLog?: (message: string) => void;
      sendProbe?: () => void;
      executeRecovery: KalshiWsRecoveryExecutor;
      getActiveMarketTickers: () => readonly string[];
      shouldStop: () => boolean;
    },
  ) {}

  get currentSocketGeneration(): number {
    return this.socketGeneration;
  }

  get isTerminal(): boolean {
    return this.state === "terminal-failure";
  }

  disable(): void {
    this.disabled = true;
  }

  markCaptureStarted(): void {
    this.captureStartedAtMonotonicMs = this.deps.monotonicNowMs();
    this.lastWatchdogTickMonotonicMs = this.captureStartedAtMonotonicMs;
  }

  incrementSocketGeneration(): number {
    this.socketGeneration += 1;
    return this.socketGeneration;
  }

  recordWebSocketOpen(): void {
    this.connected = true;
    this.lastWebSocketOpenAt = this.deps.now().toISOString();
  }

  recordWebSocketClose(): void {
    this.connected = false;
    this.lastWebSocketCloseAt = this.deps.now().toISOString();
  }

  recordSubscriptionSuccess(count: number): void {
    this.activeSubscriptionCount = count;
    this.lastSuccessfulSubscriptionAt = this.deps.now().toISOString();
  }

  recordRawMessage(): void {
    const nowMono = this.deps.monotonicNowMs();
    this.lastRawMessageMonotonicMs = nowMono;
    this.lastRawMessageAt = this.deps.now().toISOString();
    this.kalshiStreamEndedAt = null;
    this.silentWhileBtcActiveStartMonotonicMs = null;

    if (this.state === "probing") {
      this.emitEvent("wsProbeSucceeded", { reason: "raw-message-during-probe" });
      this.state = "healthy";
      this.probeStartedAtMonotonicMs = null;
    } else if (this.state === "suspected-stall") {
      this.state = "healthy";
    }
  }

  recordTopOfBookEmission(): void {
    this.lastTopOfBookMonotonicMs = this.deps.monotonicNowMs();
    this.lastTopOfBookAt = this.deps.now().toISOString();
  }

  recordBtcActivity(): void {
    const nowMono = this.deps.monotonicNowMs();
    this.lastBtcActivityMonotonicMs = nowMono;

    if (
      this.lastRawMessageMonotonicMs === null
      || nowMono - this.lastRawMessageMonotonicMs >= this.config.wsSoftSilenceThresholdMs
    ) {
      if (this.silentWhileBtcActiveStartMonotonicMs === null) {
        this.silentWhileBtcActiveStartMonotonicMs = nowMono;
      }
    }
  }

  recordPong(): void {
    this.lastPongReceivedAt = this.deps.now().toISOString();
    if (this.state === "probing") {
      this.emitEvent("wsProbeSucceeded", { reason: "pong-during-probe" });
      this.state = "healthy";
      this.probeStartedAtMonotonicMs = null;
    }
  }

  notifyTransportClosedUnexpectedly(): void {
    if (this.disabled || this.deps.shouldStop() || this.state === "recovering") {
      return;
    }

    void this.beginRecovery("transport-closed");
  }

  async tick(): Promise<void> {
    if (!this.config.enabled || this.disabled || this.deps.shouldStop()) {
      return;
    }

    const nowMono = this.deps.monotonicNowMs();
    if (this.lastWatchdogTickMonotonicMs !== null) {
      const observedIntervalMs = nowMono - this.lastWatchdogTickMonotonicMs;
      if (observedIntervalMs >= this.config.systemSleepJumpThresholdMs) {
        this.emitEvent("suspectedSystemSleep", {
          previousWatchdogTickAt: new Date(
            this.deps.now().getTime() - observedIntervalMs,
          ).toISOString(),
          expectedIntervalMs: this.config.watchdogTickMs,
          observedIntervalMs,
        });
        this.postResumeRecoveryCount += 1;
        this.deps.onLog?.(
          `[ws-watchdog] Probable host resume detected (${Math.round(observedIntervalMs / 1000)}s timer jump); validating socket`,
        );
        void this.beginRecovery("suspected-system-sleep");
      }
    }
    this.lastWatchdogTickMonotonicMs = nowMono;

    if (this.state === "recovering" || this.state === "terminal-failure") {
      this.updateSilentWhileBtcActive(nowMono);
      return;
    }

    if (!this.messagesExpected(nowMono)) {
      this.updateSilentWhileBtcActive(nowMono);
      return;
    }

    const silenceMs = this.currentSilenceMs(nowMono);
    this.longestKalshiSilenceMs = Math.max(this.longestKalshiSilenceMs, silenceMs);
    this.updateSilentWhileBtcActive(nowMono);

    if (this.state === "probing") {
      if (
        this.probeStartedAtMonotonicMs !== null
        && nowMono - this.probeStartedAtMonotonicMs >= this.config.wsProbeGraceMs
      ) {
        this.emitEvent("wsStallDetected", {
          reason: "probe-grace-expired",
          silenceDurationMs: silenceMs,
          lastRawMessageAt: this.lastRawMessageAt,
          lastTopOfBookAt: this.lastTopOfBookAt,
          activeSubscriptionCount: this.activeSubscriptionCount,
          activeMarketTickers: this.deps.getActiveMarketTickers(),
          suspectedSystemSleep: false,
        });
        this.wsStallDetectedCount += 1;
        void this.beginRecovery("application-stream-stall");
      }
      return;
    }

    if (silenceMs >= this.config.wsHardStallThresholdMs) {
      this.emitEvent("wsStallDetected", {
        reason: "hard-silence-threshold",
        silenceDurationMs: silenceMs,
        lastRawMessageAt: this.lastRawMessageAt,
        lastTopOfBookAt: this.lastTopOfBookAt,
        activeSubscriptionCount: this.activeSubscriptionCount,
        activeMarketTickers: this.deps.getActiveMarketTickers(),
        suspectedSystemSleep: false,
      });
      this.wsStallDetectedCount += 1;
      void this.beginRecovery("application-stream-stall");
      return;
    }

    if (silenceMs >= this.config.wsSoftSilenceThresholdMs) {
      if (this.state !== "suspected-stall") {
        this.state = "suspected-stall";
        this.emitEvent("wsStallSuspected", {
          silenceDurationMs: silenceMs,
          lastRawMessageAt: this.lastRawMessageAt,
        });
        this.deps.onLog?.(
          `[ws-watchdog] Kalshi stream silent for ${Math.round(silenceMs / 1000)}s; probing connection`,
        );
      }

      if (this.deps.sendProbe) {
        this.state = "probing";
        this.probeStartedAtMonotonicMs = nowMono;
        this.lastPingSentAt = this.deps.now().toISOString();
        this.emitEvent("wsProbeSent", { silenceDurationMs: silenceMs });
        this.deps.sendProbe();
      } else {
        this.emitEvent("wsStallDetected", {
          reason: "soft-silence-no-probe-transport",
          silenceDurationMs: silenceMs,
          lastRawMessageAt: this.lastRawMessageAt,
          lastTopOfBookAt: this.lastTopOfBookAt,
          activeSubscriptionCount: this.activeSubscriptionCount,
          activeMarketTickers: this.deps.getActiveMarketTickers(),
          suspectedSystemSleep: false,
        });
        this.wsStallDetectedCount += 1;
        void this.beginRecovery("application-stream-stall");
      }
    } else {
      this.state = "healthy";
    }
  }

  async waitForRecovery(): Promise<void> {
    if (this.recoveryPromise) {
      await this.recoveryPromise;
    }
  }

  toDiagnostics(): KalshiWsWatchdogDiagnostics {
    return {
      state: this.state,
      wsStallDetectedCount: this.wsStallDetectedCount,
      wsRecoveryAttemptCount: this.wsRecoveryAttemptCount,
      wsRecoverySuccessCount: this.wsRecoverySuccessCount,
      wsRecoveryFailureCount: this.wsRecoveryFailureCount,
      postResumeRecoveryCount: this.postResumeRecoveryCount,
      longestKalshiSilenceMs: this.longestKalshiSilenceMs,
      longestRecoveredStallMs: this.longestRecoveredStallMs,
      terminalWebSocketFailure: this.terminalWebSocketFailure,
      kalshiStreamEndedAt: this.kalshiStreamEndedAt,
      btcStreamEndedAt: null,
      kalshiSilentWhileBtcActiveSeconds: this.kalshiSilentWhileBtcActiveSeconds,
      lifecycleEvents: this.lifecycleEvents,
      liveness: {
        lastAnyKalshiRawMessageAt: this.lastRawMessageAt,
        lastExpectedMarketMessageAt: this.lastRawMessageAt,
        lastWebSocketOpenAt: this.lastWebSocketOpenAt,
        lastWebSocketCloseAt: this.lastWebSocketCloseAt,
        lastPingSentAt: this.lastPingSentAt,
        lastPongReceivedAt: this.lastPongReceivedAt,
        lastSuccessfulSubscriptionAt: this.lastSuccessfulSubscriptionAt,
        lastTopOfBookEmissionAt: this.lastTopOfBookAt,
        activeSubscriptionCount: this.activeSubscriptionCount,
        currentSocketGeneration: this.socketGeneration,
      },
    };
  }

  private messagesExpected(nowMono: number): boolean {
    if (!this.connected || this.activeSubscriptionCount <= 0) {
      return false;
    }

    if (this.captureStartedAtMonotonicMs === null) {
      return false;
    }

    return nowMono - this.captureStartedAtMonotonicMs >= this.config.wsInitialGraceMs;
  }

  private currentSilenceMs(nowMono: number): number {
    if (this.lastRawMessageMonotonicMs === null) {
      if (this.captureStartedAtMonotonicMs === null) {
        return 0;
      }

      return nowMono - this.captureStartedAtMonotonicMs;
    }

    return nowMono - this.lastRawMessageMonotonicMs;
  }

  private updateSilentWhileBtcActive(nowMono: number): void {
    if (this.lastBtcActivityMonotonicMs === null) {
      return;
    }

    const btcRecent = nowMono - this.lastBtcActivityMonotonicMs < this.config.watchdogTickMs * 2;
    const kalshiSilent =
      this.lastRawMessageMonotonicMs === null
      || nowMono - this.lastRawMessageMonotonicMs >= this.config.wsSoftSilenceThresholdMs;

    if (btcRecent && kalshiSilent) {
      if (this.silentWhileBtcActiveStartMonotonicMs === null) {
        this.silentWhileBtcActiveStartMonotonicMs = nowMono;
      }
      this.kalshiSilentWhileBtcActiveSeconds = Math.round(
        (nowMono - this.silentWhileBtcActiveStartMonotonicMs) / 1000,
      );
      return;
    }

    this.silentWhileBtcActiveStartMonotonicMs = null;
  }

  private beginRecovery(reason: string): void {
    if (
      this.disabled
      || this.deps.shouldStop()
      || this.state === "recovering"
      || this.state === "terminal-failure"
      || this.recoveryPromise
    ) {
      return;
    }

    this.state = "recovering";
    this.stallDetectedAtMonotonicMs = this.deps.monotonicNowMs();
    this.recoveryPromise = this.runRecovery(reason).finally(() => {
      this.recoveryPromise = null;
      if (this.state === "recovering") {
        this.state = "healthy";
      }
    });
  }

  private async runRecovery(reason: string): Promise<void> {
    for (let attempt = 1; attempt <= this.config.wsRecoveryMaxAttempts; attempt += 1) {
      if (this.disabled || this.deps.shouldStop()) {
        return;
      }

      const backoffMs = computeBackoffMs(attempt, this.config);
      this.wsRecoveryAttemptCount += 1;
      const generation = this.incrementSocketGeneration();

      this.emitEvent("wsRecoveryAttempted", {
        attemptNumber: attempt,
        backoffMs,
        reason,
        socketGeneration: generation,
      });
      this.deps.onLog?.(
        `[ws-watchdog] Stall confirmed; recovery attempt ${attempt}/${this.config.wsRecoveryMaxAttempts}`,
      );

      if (backoffMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }

      const result = await this.deps.executeRecovery({
        attemptNumber: attempt,
        reason,
        socketGeneration: generation,
        activeMarketTickers: this.deps.getActiveMarketTickers(),
        backoffMs,
      });

      if (result.status === "succeeded") {
        const recoveryDurationMs =
          this.stallDetectedAtMonotonicMs === null
            ? 0
            : this.deps.monotonicNowMs() - this.stallDetectedAtMonotonicMs;
        this.longestRecoveredStallMs = Math.max(
          this.longestRecoveredStallMs,
          recoveryDurationMs,
        );
        this.wsRecoverySuccessCount += 1;
        this.emitEvent("wsRecoverySucceeded", {
          attemptNumber: attempt,
          recoveredAt: this.deps.now().toISOString(),
          recoveryDurationMs,
          socketGeneration: generation,
          subscriptionsRestored: result.subscriptionsRestored,
          firstRawMessageAt: result.firstRawMessageAt,
        });
        this.deps.onLog?.(
          `[ws-watchdog] Recovery attempt ${attempt} succeeded after ${(recoveryDurationMs / 1000).toFixed(1)}s`,
        );
        this.state = "healthy";
        this.probeStartedAtMonotonicMs = null;
        this.stallDetectedAtMonotonicMs = null;
        return;
      }
    }

    this.wsRecoveryFailureCount += 1;
    this.terminalWebSocketFailure = true;
    this.kalshiStreamEndedAt = this.deps.now().toISOString();
    this.state = "terminal-failure";
    this.emitEvent("wsRecoveryFailed", {
      attemptNumber: this.config.wsRecoveryMaxAttempts,
      reason: "recovery-exhausted",
    });
    this.deps.onLog?.(
      `[ws-watchdog] Recovery failed after ${this.config.wsRecoveryMaxAttempts} attempts; ending capture`,
    );
  }

  private emitEvent(
    type: KalshiWsLifecycleEvent["type"],
    details: Record<string, unknown> = {},
  ): void {
    const event: KalshiWsLifecycleEvent = {
      type,
      detectedAt: this.deps.now().toISOString(),
      socketGeneration: this.socketGeneration,
      ...details,
    };
    this.lifecycleEvents.push(event);
    this.deps.onEvent?.(event);
  }
}
