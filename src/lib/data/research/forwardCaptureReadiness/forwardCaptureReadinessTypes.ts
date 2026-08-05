export const FORWARD_CAPTURE_READINESS_FILENAME = "forward-capture-readiness.json";
export const DEFAULT_FORWARD_CAPTURE_READINESS_OUTPUT_PATH =
  "data/research-results/forward-capture-readiness.json";
export const DEFAULT_FORWARD_CAPTURE_READINESS_HTML_PATH =
  "data/reports/forward-capture-readiness.html";

export const DEFAULT_FORWARD_QUOTES_CAPTURE_DIR = "data/live-capture/forward-quotes";
export const DEFAULT_KALSHI_WS_SPIKE_CAPTURE_DIR =
  "data/live-capture/kalshi-ws-spike";

export const FORWARD_CAPTURE_READINESS_DISCLAIMER =
  "This gate evaluates whether accumulated forward-capture data is sufficient to start offline executable microstructure research. A successful short smoke run proves plumbing only — not research readiness.";

export const FORWARD_CAPTURE_READINESS_CAVEATS = [
  "Short smoke captures validate infrastructure, not statistical research power.",
  "Top-of-book gaps may understate true exchange latency without exchange timestamps.",
  "Forward capture does not include queue position, partial fills, or adverse selection.",
  "Settlement/outcome joins for calibration-fade spread realism require separate historical artifacts.",
] as const;

export const FORWARD_CAPTURE_RESEARCH_FAMILY_IDS = [
  "leadLagReadiness",
  "quoteStalenessReadiness",
  "sameMarketParityReadiness",
  "bidOnlyParityReadiness",
  "calibrationFadeSpreadRealismReadiness",
] as const;

export type ForwardCaptureResearchFamilyId =
  (typeof FORWARD_CAPTURE_RESEARCH_FAMILY_IDS)[number];

export type ForwardCaptureFamilyReadinessVerdict =
  | "not-ready-no-data"
  | "not-ready-too-short"
  | "not-ready-gappy"
  | "not-ready-no-btc-spot"
  | "not-ready-invalid-books"
  /** Book-state capture is fine; markets are locked/one-sided or otherwise economically ineligible. */
  | "not-ready-insufficient-economic-eligibility"
  | "ready";

export type ForwardCaptureOverallReadinessVerdict =
  | "not-ready"
  | "not-ready-no-data"
  | "not-ready-too-short"
  | "partially-ready"
  | "ready-for-first-lead-lag-diagnostic"
  | "ready-for-first-parity-scan";

export const FORWARD_CAPTURE_RECOMMENDED_NEXT_ACTIONS = [
  "keep-capturing",
  "fix-capture-quality",
  "build-lead-lag-diagnostic",
  "build-quote-staleness-diagnostic",
  "build-static-parity-scan",
  /** Locked/one-sided/economic eligibility limits, not a capture quality defect. */
  "investigate-market-structure",
] as const;

export type ForwardCaptureRecommendedNextAction =
  (typeof FORWARD_CAPTURE_RECOMMENDED_NEXT_ACTIONS)[number];

export const DEFAULT_FORWARD_CAPTURE_READINESS_THRESHOLDS = {
  leadLag: {
    minTotalDurationMinutes: 24 * 60,
    /** Applies to BTC spot JOIN coverage (share of top-of-book records with a joined spot price), not stream cadence. */
    minBtcSpotCoverageShare: 0.95,
    maxP90TopOfBookGapMs: 5_000,
    /** Native bookState === "valid" share — capture integrity, independent of economic eligibility. */
    minBookStateValidShare: 0.95,
    /** @deprecated Alias of minBookStateValidShare, kept for backward-compatible consumers. */
    minValidBookShare: 0.95,
    minCalendarDays: 3,
  },
  quoteStaleness: {
    minTotalDurationMinutes: 12 * 60,
    maxP90TopOfBookGapMs: 10_000,
    /** Gates on the max per-run sequenceGapCount, not the cross-run sum — one bad run should not be diluted by many clean runs. */
    maxSequenceGapCountPerRun: 5,
    /** @deprecated Alias of maxSequenceGapCountPerRun, kept for backward-compatible consumers. */
    maxSequenceGapCount: 5,
    minNonZeroSpreadShare: 0.05,
  },
  sameMarketParity: {
    /** Economic eligibility (locked/one-sided markets excluded), not raw native book-state validity. */
    minEconomicallyValidShare: 0.95,
    requireDepthFields: true,
  },
  bidOnlyParity: {
    minBidPairShare: 0.9,
    requireDepthFields: true,
  },
  calibrationFadeSpreadRealism: {
    minTotalDurationMinutes: 6 * 60,
    minNonZeroSpreadShare: 0.1,
    minMarketsWithValidBook: 3,
  },
} as const;

export type ForwardCaptureReadinessInputPaths = {
  forwardQuotesDir: string;
  kalshiWsSpikeDir: string;
  captureRunDir: string | null;
};

export const DEFAULT_FORWARD_CAPTURE_READINESS_INPUT_PATHS: ForwardCaptureReadinessInputPaths =
  {
    forwardQuotesDir: DEFAULT_FORWARD_QUOTES_CAPTURE_DIR,
    kalshiWsSpikeDir: DEFAULT_KALSHI_WS_SPIKE_CAPTURE_DIR,
    captureRunDir: null,
  };

export type ExcludedCaptureRun = {
  runId: string;
  runDir: string;
  reason: string;
};

export type ForwardCaptureAggregateMetrics = {
  runCount: number;
  successfulRunCount: number;
  totalDurationMinutes: number;
  researchReadyDurationMinutes: number;
  marketCount: number;
  eventCount: number;
  topOfBookRecordCount: number;
  btcSpotRecordCount: number;
  rawMessageCount: number;
  /**
   * @deprecated Alias of economicallyValidShare, kept for backward-compatible JSON consumers.
   * Prefer bookStateValidShare (native capture integrity) or economicallyValidShare (economic eligibility).
   */
  validBookShare: number | null;
  /** Native bookState === "valid" share of records. Capture integrity, independent of market economics. */
  bookStateValidShare: number | null;
  /** Economically-eligible share of records (excludes locked/one-sided books). */
  economicallyValidShare: number | null;
  /** Cumulative sum of per-run sequenceGapCount across all runs. Informational only — see maxSequenceGapCountPerRun for gating. */
  sequenceGapCount: number;
  /** Max of per-run sequenceGapCount. Used for gating so one bad run isn't diluted by many clean runs. */
  maxSequenceGapCountPerRun: number;
  reconnectCount: number;
  medianTopOfBookGapMs: number | null;
  p90TopOfBookGapMs: number | null;
  /**
   * @deprecated Alias of btcSpotJoinCoverageShare, kept for backward-compatible consumers that expect "coverage".
   * Prefer btcSpotJoinCoverageShare (join coverage) or btcSpotStreamCadenceRatio (stream cadence).
   */
  btcSpotCoverageShare: number | null;
  /** Fraction of top-of-book records with a joined BTC spot value (btcSpotPriceUsd != null). */
  btcSpotJoinCoverageShare: number | null;
  /** btcSpotRecordCount / topOfBookRecordCount — relative stream cadence, NOT join coverage. */
  btcSpotStreamCadenceRatio: number | null;
  nonZeroSpreadShare: number | null;
  zeroSpreadShare: number | null;
  daysCovered: number;
  hoursCovered: number;
};

export type ForwardCaptureRunTableEntry = {
  runId: string;
  sourceRoot: string;
  generatedAt: string | null;
  durationMinutes: number;
  marketCount: number;
  topOfBookRecordCount: number;
  btcSpotRecordCount: number;
  rawMessageCount: number;
  /** @deprecated Alias of economicallyValidShare. */
  validBookShare: number | null;
  bookStateValidShare: number | null;
  economicallyValidShare: number | null;
  btcSpotJoinCoverageShare: number | null;
  btcSpotStreamCadenceRatio: number | null;
  /** Per-run sequence gap count (unchanged semantics). */
  sequenceGapCount: number;
  reconnectCount: number;
  verdict: string | null;
  successful: boolean;
};

export type ForwardCaptureBreakdownEntry = ForwardCaptureAggregateMetrics & {
  key: string;
};

export type ForwardCaptureFamilyReadinessEntry = {
  familyId: ForwardCaptureResearchFamilyId;
  verdict: ForwardCaptureFamilyReadinessVerdict;
  rationale: string;
};

export type ForwardCaptureReadinessSummary = {
  overallVerdict: ForwardCaptureOverallReadinessVerdict;
  recommendedNextAction: ForwardCaptureRecommendedNextAction;
  familyReadiness: readonly ForwardCaptureFamilyReadinessEntry[];
};

export type ForwardCaptureReadinessReport = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  disclaimer: string;
  caveats: readonly string[];
  warnings: readonly string[];
  inputPaths: ForwardCaptureReadinessInputPaths;
  thresholds: typeof DEFAULT_FORWARD_CAPTURE_READINESS_THRESHOLDS;
  summary: ForwardCaptureReadinessSummary;
  aggregates: ForwardCaptureAggregateMetrics;
  runs: readonly ForwardCaptureRunTableEntry[];
  byDate: readonly ForwardCaptureBreakdownEntry[];
  bySeriesTicker: readonly ForwardCaptureBreakdownEntry[];
  byMarketTicker: readonly ForwardCaptureBreakdownEntry[];
  byRunId: readonly ForwardCaptureBreakdownEntry[];
  scope: import("../downstreamAnalysisScope/downstreamAnalysisScopeTypes").DownstreamScopeMetadata;
  analysisScope: import("../downstreamAnalysisScope/downstreamAnalysisScopeTypes").AnalysisScope;
  selectedRunId: string | null;
  sourceRunIds: readonly string[];
  excludedRuns?: readonly ExcludedCaptureRun[];
  sequenceGapSemantics?: readonly import("../downstreamAnalysisScope/downstreamAnalysisScopeTypes").SequenceGapCounterSemantics[];
};

export type ForwardCaptureReadinessIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  readdir: (path: string) => readonly string[];
  isDirectory: (path: string) => boolean;
};

export class ForwardCaptureReadinessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForwardCaptureReadinessError";
  }
}
