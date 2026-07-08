import type { HypothesisCandidate } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import type { EnrichedMispricingObservation } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";

export const HYPOTHESIS_TRADE_REPLAY_FILENAME = "hypothesis-trade-replay.json";
export const DEFAULT_HYPOTHESIS_TRADE_REPLAY_OUTPUT_PATH =
  "data/research-results/hypothesis-trade-replay.json";
export const DEFAULT_HYPOTHESIS_TRADE_REPLAY_HTML_PATH =
  "data/reports/hypothesis-trade-replay.html";

export const DEFAULT_COST_AWARE_ATLAS_INPUT_PATH =
  "data/research-results/cost-aware-atlas.json";

export const DEFAULT_HYPOTHESIS_TRADE_REPLAY_MAX_SPREAD_CENTS = 10;
export const DEFAULT_HYPOTHESIS_TRADE_REPLAY_MIN_NET_EDGE_CENTS = 0;
export const DEFAULT_HYPOTHESIS_TRADE_REPLAY_SLIPPAGE_BUFFER_CENTS = 0;

export const HypothesisTradeReplayErrorCode = {
  INVALID_JSON: "invalid-json",
  INVALID_DOCUMENT: "invalid-document",
  MISSING_INPUT: "missing-input",
} as const;

export type HypothesisTradeReplayErrorCode =
  (typeof HypothesisTradeReplayErrorCode)[keyof typeof HypothesisTradeReplayErrorCode];

export class HypothesisTradeReplayError extends Error {
  readonly code: HypothesisTradeReplayErrorCode;

  constructor(message: string, code: HypothesisTradeReplayErrorCode) {
    super(message);
    this.name = "HypothesisTradeReplayError";
    this.code = code;
  }
}

export type HypothesisExecutionMode = "cross-spread";

export type HypothesisTradeReplaySkipReason =
  | "missing-quote"
  | "invalid-quote"
  | "wide-spread"
  | "insufficient-net-edge"
  | "unsupported-hypothesis-type"
  | "no-bucket-observations";

export type HypothesisTradeReplayConfig = {
  executionMode: HypothesisExecutionMode;
  maxSpreadCents: number;
  minNetEdgeCents: number;
  slippageBufferCents: number;
  officialOnly: boolean;
  feeModel: import("@/lib/data/backtesting/costModel/executionCostModelTypes").ExecutionFeeModel;
};

export type HypothesisTradeReplayInputPaths = {
  hypothesisCandidatesPath: string;
  mispricingAtlasPath: string;
  costAwareAtlasPath: string;
  researchResultsDir: string;
  regimeTagsPath: string;
};

export type HypothesisTradeReplayInputStatus = {
  hypothesisCandidatesPresent: boolean;
  mispricingAtlasPresent: boolean;
  costAwareAtlasPresent: boolean;
};

export type ReplayContractSide = "yes" | "no";

export type HypothesisTradeRule = {
  side: ReplayContractSide;
  calibrationDirection: "over" | "under";
  rationale: string;
};

export type ReplayStepQuote = {
  yesBidCents: number;
  yesAskCents: number;
  noBidCents: number;
  noAskCents: number;
};

export type ReplayableObservation = EnrichedMispricingObservation & {
  quote: ReplayStepQuote | null;
};

export type ReplayTradeAttempt = {
  observation: ReplayableObservation;
  rule: HypothesisTradeRule;
  status: "filled" | "skipped";
  skipReason: HypothesisTradeReplaySkipReason | null;
  entryPriceCents: number | null;
  spreadPaidCents: number | null;
  feeCents: number | null;
  grossPnlCents: number | null;
  netPnlCents: number | null;
  expectedNetEdgeCents: number | null;
};

export type HypothesisTradeReplayMetrics = {
  tradeCount: number;
  fillableObservationCount: number;
  skippedCount: number;
  skipReasons: Record<HypothesisTradeReplaySkipReason, number>;
  uniqueMarketCount: number;
  uniqueTradingDayCount: number;
  averageTradesPerMarket: number | null;
  maxTradesPerMarket: number;
  grossPnlCents: number;
  netPnlCents: number;
  averagePnlCentsPerTrade: number | null;
  winRate: number | null;
  maxDrawdownCents: number;
  exposureCount: number;
  averageEntryPriceCents: number | null;
  averageSpreadPaidCents: number | null;
  averageFeeCents: number | null;
  realizedRoi: number | null;
  calibrationGapCents: number | null;
  calibrationGapVsRealizedPnlDeltaCents: number | null;
};

export type HypothesisTradeReplayEntry = {
  hypothesisId: string;
  hypothesis: string;
  sourceArtifact: string;
  tradeRule: HypothesisTradeRule | null;
  unsupportedReason: string | null;
  metrics: HypothesisTradeReplayMetrics;
  warnings: readonly string[];
  candidate: Pick<
    HypothesisCandidate,
    "candidateId" | "confidence" | "bucketMetadata" | "suggestedStrategyFamily"
  >;
};

export type HypothesisTradeReplaySummary = {
  replayedHypothesisCount: number;
  evaluatedTradeCount: number;
  filledTradeCount: number;
  skippedTradeCount: number;
  positiveNetHypothesisCount: number;
  killedByCostOrFillabilityCount: number;
  untradeableHypothesisCount: number;
  descriptiveButUnprofitableCount: number;
};

export type HypothesisTradeReplayReport = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  disclaimer: string;
  config: HypothesisTradeReplayConfig;
  inputPaths: HypothesisTradeReplayInputPaths;
  inputStatus: HypothesisTradeReplayInputStatus;
  summary: HypothesisTradeReplaySummary;
  entries: readonly HypothesisTradeReplayEntry[];
};

export type HypothesisTradeReplayIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  readdir: (path: string) => readonly string[];
  isDirectory: (path: string) => boolean;
};

export type BuildHypothesisTradeReplayReportInput = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: HypothesisTradeReplayInputPaths;
  inputStatus: HypothesisTradeReplayInputStatus;
  config: HypothesisTradeReplayConfig;
  candidates: readonly HypothesisCandidate[];
  observations: readonly ReplayableObservation[];
  regimeVolatilityByMarket: import("@/lib/data/research/mispricingAtlas/mispricingAtlasTypes").RegimeVolatilityByMarketKey;
};
