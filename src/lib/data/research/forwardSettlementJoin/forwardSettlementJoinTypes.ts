export const FORWARD_SETTLEMENT_JOIN_FILENAME = "forward-settlement-join.json";
export const DEFAULT_FORWARD_SETTLEMENT_JOIN_OUTPUT_PATH =
  "data/research-results/forward-settlement-join.json";
export const DEFAULT_FORWARD_SETTLEMENT_JOIN_HTML_PATH =
  "data/reports/forward-settlement-join.html";
export const DEFAULT_FORWARD_QUOTES_CAPTURE_DIR = "data/live-capture/forward-quotes";
export const DEFAULT_IMPORTS_DIR = "data/imports";
export const DEFAULT_STATIC_PARITY_SCAN_PATH =
  "data/research-results/static-parity-scan.json";
export const DEFAULT_BID_ONLY_CANDIDATE_LIFECYCLE_PATH =
  "data/research-results/bid-only-candidate-lifecycle.json";

export const FORWARD_SETTLEMENT_JOIN_DISCLAIMER =
  "Settlement join enables offline outcome analysis. It does not imply a trade was executable. It does not evaluate strategy PnL yet. No trading decisions are made. No orders are placed.";

export const FORWARD_SETTLEMENT_JOIN_CAVEATS = [
  "Settlement outcomes are joined from imported Kalshi bronze artifacts when present.",
  "Forward capture alone does not provide settlement results.",
  "Episode joins use marketTicker; cross-run episodes for the same market share one outcome.",
  "Markets that have not settled yet remain unknown until import refresh.",
] as const;

export const FORWARD_SETTLEMENT_JOIN_VERDICTS = [
  "settlement-join-ready",
  "partial-settlement-coverage",
  "missing-settlement-source",
  "no-captured-markets",
  "no-candidate-episodes",
  "stale-or-incomplete-settlements",
] as const;

export type ForwardSettlementJoinVerdict =
  (typeof FORWARD_SETTLEMENT_JOIN_VERDICTS)[number];

export const FORWARD_SETTLEMENT_RECOMMENDED_ACTIONS = [
  "import-settlements",
  "wait-for-markets-to-settle",
  "rerun-after-capture",
  "build-outcome-study",
] as const;

export type ForwardSettlementRecommendedAction =
  (typeof FORWARD_SETTLEMENT_RECOMMENDED_ACTIONS)[number];

export const SETTLED_OUTCOMES = ["yes", "no", "unknown"] as const;
export type SettledOutcome = (typeof SETTLED_OUTCOMES)[number];

export const SETTLEMENT_STATUSES = [
  "known",
  "unknown",
  "pending",
  "missing-source",
] as const;

export type SettlementStatus = (typeof SETTLEMENT_STATUSES)[number];

export const JOIN_CONFIDENCE_LEVELS = ["high", "medium", "low", "none"] as const;
export type JoinConfidence = (typeof JOIN_CONFIDENCE_LEVELS)[number];

export type ForwardSettlementJoinConfig = {
  forwardQuotesDir: string;
  importsDir: string;
  staticParityScanPath: string | null;
  bidOnlyCandidateLifecyclePath: string | null;
  seriesTicker: string | null;
};

export type ForwardSettlementJoinIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  readdir: (path: string) => readonly string[];
  isDirectory: (path: string) => boolean;
};

export type CapturedMarketSettlementKey = {
  marketTicker: string;
  eventTicker: string | null;
  seriesTicker: string | null;
  openTime: string | null;
  closeTime: string | null;
  captureRunIds: readonly string[];
  sourceArtifacts: readonly string[];
};

export type KnownSettlementRecord = {
  marketTicker: string;
  settledOutcome: "yes" | "no";
  settlementTime: string | null;
  openTime: string | null;
  closeTime: string | null;
  eventTicker: string | null;
  seriesTicker: string | null;
  sourceArtifact: string;
  joinConfidence: JoinConfidence;
  settlementStatus: "known";
};

export type CapturedMarketSettlementJoin = {
  marketTicker: string;
  eventTicker: string | null;
  seriesTicker: string | null;
  openTime: string | null;
  closeTime: string | null;
  settlementStatus: SettlementStatus;
  settledOutcome: SettledOutcome;
  settlementTime: string | null;
  sourceArtifact: string | null;
  joinConfidence: JoinConfidence;
  captureRunIds: readonly string[];
};

export type CandidateEpisodeSettlementJoin = {
  episodeId: string;
  marketTicker: string;
  episodeStart: string;
  episodeEnd: string;
  episodeClassification: string;
  settledOutcome: SettledOutcome;
  isOutcomeKnown: boolean;
  timeFromEpisodeEndToSettlementMs: number | null;
  settlementTime: string | null;
  joinConfidence: JoinConfidence;
};

export type CandidateLifecycleEpisodeInput = {
  episodeId: string;
  marketTicker: string;
  episodeStart: string;
  episodeEnd: string;
  episodeClassification: string;
};

export type ForwardSettlementJoinSummary = {
  overallVerdict: ForwardSettlementJoinVerdict;
  recommendedNextAction: ForwardSettlementRecommendedAction;
  capturedMarketCount: number;
  settlementKnownMarketCount: number;
  settlementCoverageShare: number | null;
  candidateEpisodeCount: number;
  settlementKnownEpisodeCount: number;
  episodeSettlementCoverageShare: number | null;
  missingSettlementMarkets: readonly string[];
  inputArtifactsUsed: readonly string[];
  missingArtifacts: readonly string[];
  warnings: readonly string[];
};

export type ForwardSettlementJoinReport = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  disclaimer: string;
  caveats: readonly string[];
  config: ForwardSettlementJoinConfig;
  summary: ForwardSettlementJoinSummary;
  marketJoins: readonly CapturedMarketSettlementJoin[];
  episodeJoins: readonly CandidateEpisodeSettlementJoin[];
};

export class ForwardSettlementJoinError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForwardSettlementJoinError";
  }
}
