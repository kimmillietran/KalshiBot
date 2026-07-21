/**
 * Eight-hour restart gate (M12.1F): evaluates one exact smoke-capture run
 * directory against the frozen restart acceptance criteria and emits a
 * single machine-readable readiness summary for the operator.
 */

export type CaptureRestartGateThresholds = {
  /** Minimum BTC join coverage share required by the restart policy. */
  minBtcJoinCoverageShare: number;
  /** Minimum valid-book share required by the restart policy. */
  minValidBookShare: number;
  /** Allowed relative deviation from the expected smoke duration. */
  durationToleranceShare: number;
  /** Absolute floor for the duration tolerance window, in seconds. */
  durationToleranceFloorSeconds: number;
};

export const DEFAULT_CAPTURE_RESTART_GATE_THRESHOLDS: CaptureRestartGateThresholds = {
  minBtcJoinCoverageShare: 0.9,
  minValidBookShare: 0.9,
  durationToleranceShare: 0.1,
  durationToleranceFloorSeconds: 60,
};

/**
 * The one machine-readable operator summary printed at smoke completion.
 * `restartEightHourCaptures` is true only when every restart gate passed.
 */
export type CaptureRestartGateSummary = {
  schemaVersion: 1;
  generatedAt: string;
  runId: string | null;
  runDir: string;
  durationSeconds: number | null;
  expectedDurationSeconds: number | null;
  topOfBookCount: number | null;
  btcSpotCount: number | null;
  validBookShare: number | null;
  btcJoinCoverageShare: number | null;
  gapEpisodeCount: number | null;
  recoveryRequestCount: number | null;
  recoverySuccessCount: number | null;
  recoveryFailureCount: number | null;
  suppressedWhileResyncingCount: number | null;
  writerBackpressureCount: number | null;
  allStreamsDrained: boolean | null;
  /** Native capture health verdict (e.g. capture-mvp-success). */
  nativeHealthStatus: string | null;
  /** Terminal capture-run-status state (must be "completed"). */
  runStatusState: string | null;
  /** Explicit run-scoped capture health audit verdict. */
  auditVerdict: string | null;
  /** Audit source-artifact fingerprints were positively re-verified. */
  auditFingerprintsVerified: boolean;
  restartEightHourCaptures: boolean;
  failureReasons: readonly string[];
};
