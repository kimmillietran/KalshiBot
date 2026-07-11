import type {
  CaptureBaselineDelta,
  CaptureBaselineMetricKey,
  CaptureBaselineSnapshot,
} from "./captureBaselineComparisonTypes";

export function joinPath(root: string, child: string): string {
  return `${root.replace(/[\\/]+$/, "")}/${child}`;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function safeShare(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return null;
  }

  return numerator / denominator;
}

export function formatShare(value: number | null): string {
  if (value === null) {
    return "—";
  }

  return `${(value * 100).toFixed(1)}%`;
}

const HIGHER_IS_BETTER: Record<CaptureBaselineMetricKey, boolean> = {
  captureDurationSeconds: true,
  marketCount: true,
  topOfBookCount: true,
  btcSpotCount: true,
  btcJoinCoverageShare: true,
  validBookShare: true,
  p90TopOfBookGapMs: false,
  bidPairWithSizeCount: true,
  bidPairWithoutSizeCount: false,
  bidSizeCoverageShare: true,
  validBidOnlySnapshots: true,
  grossCandidates: true,
  bufferAdjustedCandidates: true,
  candidateEpisodes: true,
  persistentCandidateEpisodes: true,
};

export function compareMetric(
  metric: CaptureBaselineMetricKey,
  baseline: number | null,
  comparison: number | null,
): CaptureBaselineDelta {
  if (baseline === null || comparison === null) {
    return {
      metric,
      baseline,
      comparison,
      delta: null,
      deltaShare: null,
      direction: "unknown",
    };
  }

  const delta = comparison - baseline;
  const deltaShare = baseline !== 0 ? delta / Math.abs(baseline) : null;
  let direction: CaptureBaselineDelta["direction"] = "unchanged";

  if (Math.abs(delta) > 1e-9) {
    const improved = HIGHER_IS_BETTER[metric] ? delta > 0 : delta < 0;
    direction = improved ? "improved" : "regressed";
  }

  return {
    metric,
    baseline,
    comparison,
    delta,
    deltaShare,
    direction,
  };
}

export function metricValue(
  snapshot: CaptureBaselineSnapshot,
  metric: CaptureBaselineMetricKey,
): number | null {
  return snapshot[metric];
}

export function mergeSnapshots(
  primary: CaptureBaselineSnapshot,
  overlay: Partial<CaptureBaselineSnapshot>,
): CaptureBaselineSnapshot {
  return {
    ...primary,
    ...Object.fromEntries(
      Object.entries(overlay).filter(([, value]) => value !== undefined),
    ),
  } as CaptureBaselineSnapshot;
}
