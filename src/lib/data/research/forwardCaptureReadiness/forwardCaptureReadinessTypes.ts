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
] as const;

export type ForwardCaptureRecommendedNextAction =
  (typeof FORWARD_CAPTURE_RECOMMENDED_NEXT_ACTIONS)[number];

export const DEFAULT_FORWARD_CAPTURE_READINESS_THRESHOLDS = {
  leadLag: {
    minTotalDurationMinutes: 24 * 60,
    minBtcSpotCoverageShare: 0.95,
    maxP90TopOfBookGapMs: 5_000,
    minValidBookShare: 0.95,
    minCalendarDays: 3,
  },
  quoteStaleness: {
    minTotalDurationMinutes: 12 * 60,
    maxP90TopOfBookGapMs: 10_000,
    maxSequenceGapCount: 5,
    minNonZeroSpreadShare: 0.05,
  },
  sameMarketParity: {
    minValidBookShare: 0.95,
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
};

export const DEFAULT_FORWARD_CAPTURE_READINESS_INPUT_PATHS: ForwardCaptureReadinessInputPaths =
  {
    forwardQuotesDir: DEFAULT_FORWARD_QUOTES_CAPTURE_DIR,
    kalshiWsSpikeDir: DEFAULT_KALSHI_WS_SPIKE_CAPTURE_DIR,
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
  validBookShare: number | null;
  sequenceGapCount: number;
  reconnectCount: number;
  medianTopOfBookGapMs: number | null;
  p90TopOfBookGapMs: number | null;
  btcSpotCoverageShare: number | null;
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
  validBookShare: number | null;
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
