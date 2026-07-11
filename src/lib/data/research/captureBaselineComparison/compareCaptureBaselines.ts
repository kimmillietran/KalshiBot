import type {
  CaptureBaselineComparisonVerdict,
  CaptureBaselineDelta,
  CaptureBaselineMetricKey,
  CaptureBaselineRecommendedNextAction,
  CaptureBaselineSnapshot,
} from "./captureBaselineComparisonTypes";
import { compareMetric, formatShare, metricValue } from "./captureBaselineComparisonUtils";

const METRIC_KEYS: readonly CaptureBaselineMetricKey[] = [
  "captureDurationSeconds",
  "marketCount",
  "topOfBookCount",
  "btcSpotCount",
  "btcJoinCoverageShare",
  "validBookShare",
  "p90TopOfBookGapMs",
  "bidPairWithSizeCount",
  "bidPairWithoutSizeCount",
  "bidSizeCoverageShare",
  "validBidOnlySnapshots",
  "grossCandidates",
  "bufferAdjustedCandidates",
  "candidateEpisodes",
  "persistentCandidateEpisodes",
];

const METRIC_LABELS: Record<CaptureBaselineMetricKey, string> = {
  captureDurationSeconds: "capture duration (seconds)",
  marketCount: "market count",
  topOfBookCount: "top-of-book count",
  btcSpotCount: "BTC spot count",
  btcJoinCoverageShare: "BTC join coverage share",
  validBookShare: "valid book share",
  p90TopOfBookGapMs: "p90 top-of-book gap (ms)",
  bidPairWithSizeCount: "bid pairs with size",
  bidPairWithoutSizeCount: "bid pairs without size",
  bidSizeCoverageShare: "bid size coverage share",
  validBidOnlySnapshots: "valid bid-only snapshots",
  grossCandidates: "gross candidates",
  bufferAdjustedCandidates: "buffer-adjusted candidates",
  candidateEpisodes: "candidate episodes",
  persistentCandidateEpisodes: "persistent candidate episodes",
};

function describeDelta(delta: CaptureBaselineDelta): string | null {
  if (delta.direction === "unknown" || delta.delta === null) {
    return null;
  }

  const label = METRIC_LABELS[delta.metric];
  if (delta.metric === "bidSizeCoverageShare" || delta.metric === "validBookShare") {
    return `${label}: ${formatShare(delta.baseline)} → ${formatShare(delta.comparison)} (${delta.direction})`;
  }

  return `${label}: ${delta.baseline ?? "—"} → ${delta.comparison ?? "—"} (${delta.direction})`;
}

function hasCandidateSignal(snapshot: CaptureBaselineSnapshot): boolean {
  return (
    (snapshot.grossCandidates ?? 0) > 0
    || (snapshot.bufferAdjustedCandidates ?? 0) > 0
    || (snapshot.persistentCandidateEpisodes ?? 0) > 0
  );
}

function captureQualityImproved(
  baseline: CaptureBaselineSnapshot,
  comparison: CaptureBaselineSnapshot,
  deltas: readonly CaptureBaselineDelta[],
): boolean {
  const bidSizeDelta = deltas.find((delta) => delta.metric === "bidSizeCoverageShare");
  const bidPairDelta = deltas.find((delta) => delta.metric === "bidPairWithSizeCount");
  const healthImproved =
    comparison.captureHealthVerdict === "capture-research-ready"
    && baseline.captureHealthVerdict !== "capture-research-ready";

  return (
    healthImproved
    || bidSizeDelta?.direction === "improved"
    || bidPairDelta?.direction === "improved"
    || (
      (comparison.bidSizeCoverageShare ?? 0) >= 0.5
      && (baseline.bidSizeCoverageShare ?? 0) < 0.5
    )
  );
}

function captureQualityRegressed(deltas: readonly CaptureBaselineDelta[]): boolean {
  const qualityMetrics: CaptureBaselineMetricKey[] = [
    "bidSizeCoverageShare",
    "validBookShare",
    "btcJoinCoverageShare",
    "bidPairWithSizeCount",
  ];

  return qualityMetrics.some((metric) => {
    const delta = deltas.find((entry) => entry.metric === metric);
    return delta?.direction === "regressed";
  });
}

function readyForLongCapture(comparison: CaptureBaselineSnapshot): boolean {
  return (
    comparison.captureHealthVerdict === "capture-research-ready"
    && (comparison.bidSizeCoverageShare ?? 0) >= 0.5
    && (comparison.captureDurationSeconds ?? 0) < 3_600
  );
}

function readyForOutcomeStudy(comparison: CaptureBaselineSnapshot): boolean {
  return (
    comparison.strategyReadinessVerdict === "ready-for-offline-strategy-evaluation"
    || comparison.strategyReadinessVerdict === "ready-for-descriptive-analysis"
    || (comparison.persistentCandidateEpisodes ?? 0) > 0
  );
}

export function compareCaptureBaselines(input: {
  baseline: CaptureBaselineSnapshot;
  comparison: CaptureBaselineSnapshot;
}): {
  deltas: CaptureBaselineDelta[];
  improvements: string[];
  regressions: string[];
  overallVerdict: CaptureBaselineComparisonVerdict;
  recommendedNextAction: CaptureBaselineRecommendedNextAction;
  currentBottleneck: string;
} {
  const deltas = METRIC_KEYS.map((metric) =>
    compareMetric(metric, metricValue(input.baseline, metric), metricValue(input.comparison, metric)),
  );

  const improvementMessages = deltas
    .filter((delta) => delta.direction === "improved")
    .map(describeDelta)
    .filter((value): value is string => value !== null);
  const regressionMessages = deltas
    .filter((delta) => delta.direction === "regressed")
    .map(describeDelta)
    .filter((value): value is string => value !== null);

  let overallVerdict: CaptureBaselineComparisonVerdict = "no-candidates-yet";
  let recommendedNextAction: CaptureBaselineRecommendedNextAction =
    "continue-capture-until-candidates-emerge";
  let currentBottleneck = "candidate-signal-absent";

  if (captureQualityRegressed(deltas)) {
    overallVerdict = "capture-quality-regressed";
    recommendedNextAction = "investigate-capture-regression";
    currentBottleneck = "capture-quality-regression";
  } else if (readyForOutcomeStudy(input.comparison)) {
    overallVerdict = "ready-for-outcome-study";
    recommendedNextAction = "join-settlements-for-outcome-study";
    currentBottleneck = "settlement-join-and-confirmation";
  } else if (hasCandidateSignal(input.comparison)) {
    overallVerdict = "candidate-signal-emerging";
    recommendedNextAction = "design-executable-confirmation";
    currentBottleneck = "executable-confirmation";
  } else if (captureQualityImproved(input.baseline, input.comparison, deltas)) {
    overallVerdict = "capture-quality-improved-need-volume";
    recommendedNextAction = "run-longer-forward-capture";
    currentBottleneck = "capture-volume";
  } else if (readyForLongCapture(input.comparison)) {
    overallVerdict = "ready-for-long-capture";
    recommendedNextAction = "run-longer-forward-capture";
    currentBottleneck = "capture-volume";
  } else if (
    (input.comparison.grossCandidates ?? 0) === 0
    && (input.comparison.bufferAdjustedCandidates ?? 0) === 0
    && (input.comparison.persistentCandidateEpisodes ?? 0) === 0
  ) {
    overallVerdict = "no-candidates-yet";
    recommendedNextAction = "continue-capture-until-candidates-emerge";
    currentBottleneck = "candidate-signal-absent";
  }

  return {
    deltas,
    improvements: improvementMessages,
    regressions: regressionMessages,
    overallVerdict,
    recommendedNextAction,
    currentBottleneck,
  };
}
