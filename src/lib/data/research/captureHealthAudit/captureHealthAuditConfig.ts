import type {
  CaptureHealthAuditConfig,
  CaptureHealthAuditThresholds,
} from "./captureHealthAuditTypes";

export const CAPTURE_HEALTH_AUDIT_DISCLAIMER =
  "Read-only capture quality audit. No trading decisions are made. No orders are placed. This evaluates offline capture artifacts only.";

export const CAPTURE_HEALTH_AUDIT_CAVEATS = [
  "Audit consumes local capture artifacts only; it does not connect to Kalshi.",
  "Short M12.1C smoke runs are expected to fail duration thresholds.",
  "BTC spot join metrics require synchronized timestamps in both streams.",
  "Market metadata is optional and may be absent in early capture spikes.",
] as const;

export const DEFAULT_CAPTURE_HEALTH_AUDIT_THRESHOLDS: CaptureHealthAuditThresholds = {
  minDurationSeconds: 600,
  maxP90TopOfBookGapMs: 30_000,
  minValidBookShare: 0.95,
  minBtcJoinCoverageShare: 0.9,
  maxZeroSpreadShare: 0.95,
  btcJoinMaxDistanceMs: 5_000,
};

export const DEFAULT_CAPTURE_HEALTH_AUDIT_CONFIG: CaptureHealthAuditConfig = {
  thresholds: DEFAULT_CAPTURE_HEALTH_AUDIT_THRESHOLDS,
};

export function createCaptureHealthAuditConfig(
  overrides?: Partial<CaptureHealthAuditThresholds>,
): CaptureHealthAuditConfig {
  return {
    thresholds: {
      ...DEFAULT_CAPTURE_HEALTH_AUDIT_THRESHOLDS,
      ...overrides,
    },
  };
}
