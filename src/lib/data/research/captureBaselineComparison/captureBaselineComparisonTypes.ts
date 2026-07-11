export const CAPTURE_BASELINE_COMPARISON_FILENAME = "capture-baseline-comparison.json";
export const DEFAULT_CAPTURE_BASELINE_COMPARISON_OUTPUT_PATH =
  "data/research-results/capture-baseline-comparison.json";
export const DEFAULT_CAPTURE_BASELINE_COMPARISON_HTML_PATH =
  "data/reports/capture-baseline-comparison.html";
export const DEFAULT_FORWARD_QUOTES_CAPTURE_DIR = "data/live-capture/forward-quotes";

export const CAPTURE_BASELINE_COMPARISON_DISCLAIMER =
  "Offline baseline comparison only. No trading decisions are made. No orders are placed. No trade recommendations are emitted. Findings compare capture quality and research artifact metrics across pre- and post-M12.8 baselines.";

export const CAPTURE_BASELINE_COMPARISON_CAVEATS = [
  "Configured pre-M12.8 baseline values are used when no explicit baseline run is provided.",
  "Research artifacts may aggregate multiple runs; run-specific metrics come from capture-health when a run is selected.",
  "Missing upstream artifacts produce warnings and partial comparisons.",
  "Candidate counts depend on bid-size coverage and capture volume; improved quality without volume may still show zero candidates.",
] as const;

export const CAPTURE_BASELINE_ARTIFACT_PATHS = {
  captureHealthAudit: "data/research-results/capture-health-audit.json",
  bidSizeCoverageAudit: "data/research-results/bid-size-coverage-audit.json",
  staticParityScan: "data/research-results/static-parity-scan.json",
  bidOnlyCandidateLifecycle: "data/research-results/bid-only-candidate-lifecycle.json",
  strategyEvaluationReadiness: "data/research-results/strategy-evaluation-readiness.json",
  executableConfirmationDesign: "data/research-results/executable-confirmation-design.json",
  forwardCaptureReadiness: "data/research-results/forward-capture-readiness.json",
} as const;

export type CaptureBaselineArtifactKey = keyof typeof CAPTURE_BASELINE_ARTIFACT_PATHS;

export const CAPTURE_BASELINE_COMPARISON_VERDICTS = [
  "capture-quality-improved-need-volume",
  "capture-quality-regressed",
  "candidate-signal-emerging",
  "no-candidates-yet",
  "ready-for-long-capture",
  "ready-for-outcome-study",
] as const;

export type CaptureBaselineComparisonVerdict =
  (typeof CAPTURE_BASELINE_COMPARISON_VERDICTS)[number];

export const CAPTURE_BASELINE_RECOMMENDED_NEXT_ACTIONS = [
  "run-longer-forward-capture",
  "refresh-research-artifacts",
  "investigate-capture-regression",
  "build-candidate-lifecycle",
  "run-static-parity-scan",
  "join-settlements-for-outcome-study",
  "design-executable-confirmation",
  "continue-capture-until-candidates-emerge",
] as const;

export type CaptureBaselineRecommendedNextAction =
  (typeof CAPTURE_BASELINE_RECOMMENDED_NEXT_ACTIONS)[number];

export type CaptureBaselineMetricKey =
  | "captureDurationSeconds"
  | "marketCount"
  | "topOfBookCount"
  | "btcSpotCount"
  | "btcJoinCoverageShare"
  | "validBookShare"
  | "p90TopOfBookGapMs"
  | "bidPairWithSizeCount"
  | "bidPairWithoutSizeCount"
  | "bidSizeCoverageShare"
  | "validBidOnlySnapshots"
  | "grossCandidates"
  | "bufferAdjustedCandidates"
  | "candidateEpisodes"
  | "persistentCandidateEpisodes";

export type CaptureBaselineSnapshot = {
  label: string;
  source: "configured-baseline" | "capture-run" | "research-artifacts";
  runId: string | null;
  captureDurationSeconds: number | null;
  marketCount: number | null;
  topOfBookCount: number | null;
  btcSpotCount: number | null;
  btcJoinCoverageShare: number | null;
  validBookShare: number | null;
  p90TopOfBookGapMs: number | null;
  bidPairWithSizeCount: number | null;
  bidPairWithoutSizeCount: number | null;
  bidSizeCoverageShare: number | null;
  validBidOnlySnapshots: number | null;
  grossCandidates: number | null;
  bufferAdjustedCandidates: number | null;
  candidateEpisodes: number | null;
  persistentCandidateEpisodes: number | null;
  strategyReadinessVerdict: string | null;
  executableConfirmationStatus: string | null;
  captureHealthVerdict: string | null;
  forwardCaptureReadinessVerdict: string | null;
};

export type CaptureBaselineDelta = {
  metric: CaptureBaselineMetricKey;
  baseline: number | null;
  comparison: number | null;
  delta: number | null;
  deltaShare: number | null;
  direction: "improved" | "regressed" | "unchanged" | "unknown";
};

export type CaptureBaselineComparisonConfig = {
  forwardQuotesDir: string;
  artifacts: Record<CaptureBaselineArtifactKey, string>;
  baselineRunId: string | null;
  comparisonRunId: string | null;
  useLatestComparisonRun: boolean;
  useConfiguredBaseline: boolean;
};

export const DEFAULT_CONFIGURED_BASELINE: CaptureBaselineSnapshot = {
  label: "pre-M12.8 known baseline",
  source: "configured-baseline",
  runId: null,
  captureDurationSeconds: null,
  marketCount: null,
  topOfBookCount: 1122,
  btcSpotCount: null,
  btcJoinCoverageShare: null,
  validBookShare: null,
  p90TopOfBookGapMs: null,
  bidPairWithSizeCount: 47,
  bidPairWithoutSizeCount: 519,
  bidSizeCoverageShare: 47 / 1122,
  validBidOnlySnapshots: 62,
  grossCandidates: 0,
  bufferAdjustedCandidates: 0,
  candidateEpisodes: 0,
  persistentCandidateEpisodes: 0,
  strategyReadinessVerdict: "not-ready-too-short",
  executableConfirmationStatus: "no-candidates",
  captureHealthVerdict: "capture-too-short",
  forwardCaptureReadinessVerdict: "not-ready-too-short",
};

export type CaptureBaselineComparisonInputPaths = {
  forwardQuotesDir: string;
  artifacts: Record<CaptureBaselineArtifactKey, string>;
};

export const DEFAULT_CAPTURE_BASELINE_COMPARISON_INPUT_PATHS: CaptureBaselineComparisonInputPaths =
  {
    forwardQuotesDir: DEFAULT_FORWARD_QUOTES_CAPTURE_DIR,
    artifacts: CAPTURE_BASELINE_ARTIFACT_PATHS,
  };

export type CaptureBaselineComparisonSummary = {
  overallVerdict: CaptureBaselineComparisonVerdict;
  recommendedNextAction: CaptureBaselineRecommendedNextAction;
  currentBottleneck: string;
  improvements: readonly string[];
  regressions: readonly string[];
  warnings: readonly string[];
  artifactsLoaded: readonly string[];
  missingArtifacts: readonly string[];
  corruptArtifacts: readonly string[];
};

export type CaptureBaselineComparisonReport = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  disclaimer: string;
  caveats: readonly string[];
  config: CaptureBaselineComparisonConfig;
  baseline: CaptureBaselineSnapshot;
  comparison: CaptureBaselineSnapshot;
  deltas: readonly CaptureBaselineDelta[];
  summary: CaptureBaselineComparisonSummary;
};

export type CaptureBaselineComparisonIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  readdir: (path: string) => readonly string[];
  isDirectory: (path: string) => boolean;
};

export class CaptureBaselineComparisonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CaptureBaselineComparisonError";
  }
}
