import type { CaptureHealthReconciliationConfig } from "./captureHealthReconciliationTypes";

export const DEFAULT_CAPTURE_HEALTH_RECONCILIATION_CONFIG: CaptureHealthReconciliationConfig = {
  captureRunDir: "",
  expectedBtcHeartbeatMs: 5_000,
  heartbeatWarningGapMs: 15_000,
  probableSuspensionGapMs: 60_000,
  timelineBucketMs: 5 * 60 * 1000,
  artifactStaleAfterHours: 72,
};

export function createCaptureHealthReconciliationConfig(
  overrides: Partial<CaptureHealthReconciliationConfig>,
): CaptureHealthReconciliationConfig {
  return {
    ...DEFAULT_CAPTURE_HEALTH_RECONCILIATION_CONFIG,
    ...overrides,
  };
}
