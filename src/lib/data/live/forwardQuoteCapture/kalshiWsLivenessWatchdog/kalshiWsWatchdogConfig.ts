import type { KalshiWsWatchdogConfig } from "./kalshiWsWatchdogTypes";

/**
 * Defaults are conservative for unattended multi-hour captures.
 * Soft silence (30s) aligns with dashboard ORDERBOOK_STALE_THRESHOLD_MS.
 * Hard stall (60s) requires probe grace before forced recovery.
 * System-sleep jump (60s) matches M12.15 probable host-suspension threshold.
 */
export const DEFAULT_KALSHI_WS_WATCHDOG_CONFIG: KalshiWsWatchdogConfig = {
  enabled: true,
  watchdogTickMs: 5_000,
  wsSoftSilenceThresholdMs: 30_000,
  wsHardStallThresholdMs: 60_000,
  wsProbeGraceMs: 10_000,
  wsRecoveryInitialBackoffMs: 1_000,
  wsRecoveryMaxBackoffMs: 30_000,
  wsRecoveryMaxAttempts: 5,
  wsPostSubscribeConfirmationMs: 30_000,
  systemSleepJumpThresholdMs: 60_000,
  wsInitialGraceMs: 15_000,
};

export function createKalshiWsWatchdogConfig(
  overrides: Partial<KalshiWsWatchdogConfig> = {},
): KalshiWsWatchdogConfig {
  return {
    ...DEFAULT_KALSHI_WS_WATCHDOG_CONFIG,
    ...overrides,
  };
}

export function resolveWatchdogConfigFromCaptureConfig(input: {
  dryRun: boolean;
  wsSoftSilenceThresholdMs?: number;
  wsHardStallThresholdMs?: number;
  wsProbeGraceMs?: number;
  wsRecoveryMaxAttempts?: number;
  wsWatchdogEnabled?: boolean;
}): KalshiWsWatchdogConfig {
  return createKalshiWsWatchdogConfig({
    enabled: input.dryRun ? false : input.wsWatchdogEnabled ?? true,
    wsSoftSilenceThresholdMs: input.wsSoftSilenceThresholdMs,
    wsHardStallThresholdMs: input.wsHardStallThresholdMs,
    wsProbeGraceMs: input.wsProbeGraceMs,
    wsRecoveryMaxAttempts: input.wsRecoveryMaxAttempts,
  });
}
