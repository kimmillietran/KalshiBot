import type { StrategySynthesisDirection } from "@/lib/data/research/strategySynthesis/strategySynthesisTypes";

export const HARNESS_RESULTS_FILENAME = "harness-results.json";
export const DEFAULT_HARNESS_RESULTS_OUTPUT_PATH =
  "data/research-results/harness-results.json";
export const DEFAULT_HARNESS_RESULTS_HTML_PATH =
  "data/reports/research-harness-results.html";
export const DEFAULT_STRATEGY_HARNESS_OUTPUT_DIR = "data/research-results/harness";
export const DEFAULT_STRATEGY_HARNESS_SUMMARY_PATH =
  "data/research-results/harness/strategy-harness-summary.json";

export const DEFAULT_MIN_COMPLETED_MARKETS_FOR_CANDIDATE = 3;
export const DEFAULT_MIN_WIN_RATE_FOR_CANDIDATE = 45;
export const DEFAULT_MIN_ROBUSTNESS_SCORE_FOR_CANDIDATE = 70;

export const HarnessResultsErrorCode = {
  INVALID_JSON: "invalid-json",
  INVALID_DOCUMENT: "invalid-document",
  MISSING_INPUT: "missing-input",
} as const;

export type HarnessResultsErrorCode =
  (typeof HarnessResultsErrorCode)[keyof typeof HarnessResultsErrorCode];

export class HarnessResultsError extends Error {
  readonly code: HarnessResultsErrorCode;

  constructor(message: string, code: HarnessResultsErrorCode) {
    super(message);
    this.name = "HarnessResultsError";
    this.code = code;
  }
}

export type HarnessRunStatus = "completed" | "partial" | "failed" | "not-run";

export type HarnessPromotionRecommendation =
  | "reject"
  | "needs-more-data"
  | "candidate";

export type HarnessCalibrationContext = {
  atlasGroupId: string | null;
  bucketId: string | null;
  calibrationDirection: "over" | "under" | null;
  marketCondition: string | null;
};

export type HarnessStrategyRunCounts = {
  total: number;
  successful: number;
  failed: number;
  skipped: number;
};

export type HarnessStrategyResult = {
  strategyId: string;
  hypothesisId: string;
  strategyFamily: string;
  direction: StrategySynthesisDirection;
  runStatus: HarnessRunStatus;
  tradeCount: number;
  totalPnlCents: number;
  averagePnlCents: number;
  winRatePct: number;
  maxDrawdownPct: number | null;
  calibrationContext: HarnessCalibrationContext | null;
  robustnessScore: number | null;
  warnings: readonly string[];
  promotionRecommendation: HarnessPromotionRecommendation;
  harnessRuns: HarnessStrategyRunCounts;
};

export type HarnessResultsConfig = {
  minCompletedMarketsForCandidate: number;
  minWinRateForCandidate: number;
  minRobustnessScoreForCandidate: number;
};

export type HarnessResultsInputPaths = {
  synthesisPath: string;
  harnessSummaryPath: string;
  harnessOutputDir: string;
  hypothesisValidationPath: string | null;
  strategyLeaderboardPath: string | null;
};

export type HarnessResultsSummary = {
  totalStrategies: number;
  evaluatedCount: number;
  recommendationCounts: {
    reject: number;
    needsMoreData: number;
    candidate: number;
  };
  runMode?: "production" | "research-only";
  researchOnlyBacktest?: boolean;
  includedRejectedStrategies?: boolean;
  promotionEligible?: boolean;
  skippedRejectedStrategyCount?: number;
  strategySelection?: readonly {
    strategyId: string;
    hypothesisId: string;
    promotionStatus: string;
    decision: "included" | "skipped";
    reason: string;
  }[];
};

export type HarnessResultsReport = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: HarnessResultsInputPaths;
  config: HarnessResultsConfig;
  summary: HarnessResultsSummary;
  strategies: readonly HarnessStrategyResult[];
};

export type ParsedHarnessMarketResult = {
  synthesizedStrategyId: string;
  hypothesisId: string;
  strategyFamily: string;
  seriesTicker: string;
  marketTicker: string;
  outputPath: string;
  status: "success" | "failed" | "skipped";
  errorMessage: string | null;
};

export type ParsedStrategyHarnessSummary = {
  synthesisPath: string;
  outputDir: string;
  summaryPath: string;
  evaluatedStrategies: number;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  skippedRuns: number;
  runMode: "production" | "research-only";
  researchOnlyBacktest: boolean;
  includedRejectedStrategies: boolean;
  promotionEligible: boolean;
  skippedRejectedStrategyCount: number;
  strategySelection: readonly {
    strategyId: string;
    hypothesisId: string;
    promotionStatus: string;
    decision: "included" | "skipped";
    reason: string;
  }[];
  results: readonly ParsedHarnessMarketResult[];
};

export type ParsedHarnessValidationEntry = {
  hypothesisId: string;
  robustnessScore: number;
  passes: boolean;
  reasons: readonly string[];
};

export type BuildHarnessResultsReportInput = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: HarnessResultsInputPaths;
  synthesisStrategies: readonly import("@/lib/data/research/strategySynthesis/strategySynthesisTypes").StrategySynthesisCandidate[];
  harnessSummary: ParsedStrategyHarnessSummary | null;
  validationByHypothesisId: ReadonlyMap<string, ParsedHarnessValidationEntry>;
  leaderboardStrategyIds: ReadonlySet<string>;
  readFile: (path: string) => string;
  config?: Partial<HarnessResultsConfig>;
};

export type HarnessResultsIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
};
