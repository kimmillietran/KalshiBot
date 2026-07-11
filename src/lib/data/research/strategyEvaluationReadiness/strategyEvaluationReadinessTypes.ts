export const STRATEGY_EVALUATION_READINESS_FILENAME =
  "strategy-evaluation-readiness.json";
export const DEFAULT_STRATEGY_EVALUATION_READINESS_OUTPUT_PATH =
  "data/research-results/strategy-evaluation-readiness.json";
export const DEFAULT_STRATEGY_EVALUATION_READINESS_HTML_PATH =
  "data/reports/strategy-evaluation-readiness.html";

export const DEFAULT_FORWARD_QUOTES_CAPTURE_DIR = "data/live-capture/forward-quotes";

export const STRATEGY_EVALUATION_READINESS_DISCLAIMER =
  "This gate inspects offline research artifacts and capture data to determine whether strategy evaluation prerequisites are met. Descriptive analysis is not strategy evaluation. Strategy evaluation is not an executable strategy. Executable confirmation is required before actionability. No trading decisions are made. No orders are placed.";

export const STRATEGY_EVALUATION_READINESS_CAVEATS = [
  "Missing upstream artifacts produce blockers and warnings — they do not crash the gate.",
  "Settlement/outcome joins are not inferred from capture alone.",
  "Executable confirmation support is not faked when absent from artifacts.",
  "Bid-size coverage may improve after M12.8; this gate accepts pre- and post-M12.8 artifacts.",
  "Candidate lifecycle episodes require M12.9 or compatible bid-only-candidate-lifecycle.json.",
] as const;

export const STRATEGY_EVALUATION_ARTIFACT_PATHS = {
  forwardCaptureReadiness:
    "data/research-results/forward-capture-readiness.json",
  staticParityScan: "data/research-results/static-parity-scan.json",
  bidSizeCoverageAudit: "data/research-results/bid-size-coverage-audit.json",
  bidOnlyCandidateLifecycle:
    "data/research-results/bid-only-candidate-lifecycle.json",
  captureQualityValidation:
    "data/research-results/capture-quality-validation.json",
  validBookCoverageInvestigation:
    "data/research-results/valid-book-coverage-investigation.json",
} as const;

export type StrategyEvaluationArtifactKey =
  keyof typeof STRATEGY_EVALUATION_ARTIFACT_PATHS;

export const STRATEGY_EVALUATION_FAMILY_IDS = [
  "bid-only-parity-episode-evaluation",
] as const;

export type StrategyEvaluationFamilyId =
  (typeof STRATEGY_EVALUATION_FAMILY_IDS)[number];

export const STRATEGY_EVALUATION_READINESS_VERDICTS = [
  "not-ready-no-capture",
  "not-ready-too-short",
  "not-ready-size-coverage",
  "not-ready-no-candidates",
  "not-ready-no-episodes",
  "not-ready-no-settlements",
  "not-ready-no-executable-confirmation",
  "ready-for-descriptive-analysis",
  "ready-for-offline-strategy-evaluation",
  "ready-for-execution-confirmation-design",
] as const;

export type StrategyEvaluationReadinessVerdict =
  (typeof STRATEGY_EVALUATION_READINESS_VERDICTS)[number];

export const STRATEGY_EVALUATION_RECOMMENDED_NEXT_ACTIONS = [
  "run-longer-capture",
  "merge-m12.8-and-recapture",
  "run-bid-size-audit",
  "build-candidate-lifecycle",
  "join-settlements",
  "design-executable-confirmation",
  "run-static-parity-scan",
  "refresh-stale-artifacts",
  "continue-capture",
  "fix-artifact-scope",
  "proceed-strategy-evaluation",
  "continue-clean-capture",
  "run-near-miss-analysis",
] as const;

export type StrategyEvaluationRecommendedNextAction =
  (typeof STRATEGY_EVALUATION_RECOMMENDED_NEXT_ACTIONS)[number];

export const READINESS_DIMENSION_IDS = [
  "captureDuration",
  "captureDays",
  "marketCount",
  "topOfBookRecordCount",
  "btcSpotCoverage",
  "bidSizeCoverage",
  "bidPairCoverage",
  "bidOnlyCandidateCount",
  "bufferAdjustedCandidateCount",
  "candidateEpisodeCount",
  "candidateEpisodeDuration",
  "settlementOutcomeCoverage",
  "executionConfirmationSupport",
  "sampleSize",
  "multiDayCoverage",
  "artifactFreshness",
] as const;

export type ReadinessDimensionId = (typeof READINESS_DIMENSION_IDS)[number];

export type ReadinessDimensionStatus =
  | "met"
  | "partial"
  | "blocked"
  | "unknown"
  | "not-applicable";

export type ReadinessDimensionEntry = {
  id: ReadinessDimensionId;
  status: ReadinessDimensionStatus;
  value: number | string | boolean | null;
  threshold: string | null;
  rationale: string;
};

export const DEFAULT_BID_ONLY_PARITY_EPISODE_THRESHOLDS = {
  minCaptureDurationHours: 6,
  preferredCaptureDurationHours: 24,
  minDistinctDays: 2,
  preferredDistinctDays: 5,
  minMarkets: 20,
  minBidPairWithSizeShare: 0.25,
  minCandidateEpisodes: 20,
  minBufferAdjustedEpisodes: 5,
  minBidOnlyCandidates: 1,
  artifactStaleAfterHours: 72,
} as const;

export type StrategyEvaluationInputPaths = {
  forwardQuotesDir: string;
  captureRunDir: string | null;
  artifacts: Record<StrategyEvaluationArtifactKey, string>;
};

export const DEFAULT_STRATEGY_EVALUATION_INPUT_PATHS: StrategyEvaluationInputPaths =
  {
    forwardQuotesDir: DEFAULT_FORWARD_QUOTES_CAPTURE_DIR,
    captureRunDir: null,
    artifacts: STRATEGY_EVALUATION_ARTIFACT_PATHS,
  };

export type LoadedStrategyEvaluationArtifact = {
  path: string;
  generatedAt: string | null;
  parsed: Record<string, unknown> | null;
  malformed: boolean;
  excludedByValidation?: boolean;
};

export type StrategyEvaluationLoadedInputs = {
  forwardCaptureReadiness: LoadedStrategyEvaluationArtifact | null;
  staticParityScan: LoadedStrategyEvaluationArtifact | null;
  bidSizeCoverageAudit: LoadedStrategyEvaluationArtifact | null;
  bidOnlyCandidateLifecycle: LoadedStrategyEvaluationArtifact | null;
  captureQualityValidation: LoadedStrategyEvaluationArtifact | null;
  validBookCoverageInvestigation: LoadedStrategyEvaluationArtifact | null;
  captureFallback: {
    runCount: number;
    totalDurationMinutes: number;
    daysCovered: number;
    marketCount: number;
    topOfBookRecordCount: number;
    btcSpotCoverageShare: number | null;
    bidPairWithSizeShare: number | null;
    bidSizeCoverageShare: number | null;
  } | null;
  selection: {
    analysisScope: "selected-run" | "aggregate";
    forwardQuotesDir: string;
    captureRunDir: string | null;
    selectedRunId: string | null;
  };
  artifactValidation: {
    staleArtifacts: string[];
    mismatchedArtifacts: string[];
    malformedArtifacts: string[];
    missingArtifacts: string[];
    warnings: string[];
    usablePaths: string[];
  };
  warnings: string[];
};

export type StrategyEvaluationFamilyEntry = {
  familyId: StrategyEvaluationFamilyId;
  verdict: StrategyEvaluationReadinessVerdict;
  rationale: string;
  blockingReasons: string[];
};

export type StrategyEvaluationReadinessSummary = {
  overallVerdict: StrategyEvaluationReadinessVerdict;
  recommendedNextAction: StrategyEvaluationRecommendedNextAction;
  families: readonly StrategyEvaluationFamilyEntry[];
  blockingReasons: readonly string[];
  warnings: readonly string[];
  inputArtifactsUsed: readonly string[];
  missingArtifacts: readonly string[];
};

import type { DownstreamScopeMetadata } from "../downstreamAnalysisScope/downstreamAnalysisScopeTypes";

export type StrategyEvaluationReadinessReport = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  disclaimer: string;
  caveats: readonly string[];
  inputPaths: StrategyEvaluationInputPaths;
  thresholds: typeof DEFAULT_BID_ONLY_PARITY_EPISODE_THRESHOLDS;
  dimensions: readonly ReadinessDimensionEntry[];
  summary: StrategyEvaluationReadinessSummary;
  scope: DownstreamScopeMetadata;
  analysisScope: DownstreamScopeMetadata["analysisScope"];
  selectedRunId: string | null;
  sourceRunIds: readonly string[];
};

export type StrategyEvaluationReadinessIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  readdir: (path: string) => readonly string[];
  isDirectory: (path: string) => boolean;
};

export class StrategyEvaluationReadinessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StrategyEvaluationReadinessError";
  }
}
