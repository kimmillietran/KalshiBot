import { DEFAULT_HYPOTHESIS_VALIDATION_OUTPUT_PATH } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";
import { DEFAULT_STATISTICAL_SIGNIFICANCE_OUTPUT_PATH } from "@/lib/data/research/statisticalSignificance/statisticalSignificanceTypes";

export const CANDIDATE_PROMOTIONS_FILENAME = "candidate-promotions.json";
export const DEFAULT_CANDIDATE_PROMOTIONS_OUTPUT_PATH =
  "data/research-results/candidate-promotions.json";
export const DEFAULT_CANDIDATE_PROMOTIONS_HTML_PATH =
  "data/reports/research-candidate-promotions.html";
export const DEFAULT_STRATEGY_SYNTHESIS_INPUT_PATH =
  "data/research-results/strategy-synthesis-candidates.json";
export const DEFAULT_HARNESS_RESULTS_INPUT_PATH =
  "data/research-results/harness-results.json";
export const DEFAULT_STRATEGY_HARNESS_SUMMARY_FALLBACK_PATH =
  "data/research-results/harness/strategy-harness-summary.json";

export const DEFAULT_REJECT_ROBUSTNESS_THRESHOLD = 50;
export const DEFAULT_CANDIDATE_ROBUSTNESS_THRESHOLD = 70;
export const DEFAULT_WATCHLIST_ROBUSTNESS_THRESHOLD = 85;
export const DEFAULT_MIN_CANDIDATE_TRADE_COUNT = 5;
export const DEFAULT_MIN_WATCHLIST_TRADE_COUNT = 20;
export const DEFAULT_MIN_CANDIDATE_HARNESS_RUNS = 3;
export const DEFAULT_MIN_OBSERVATION_COUNT = 10;

export type CandidatePromotionDecision =
  | "rejected"
  | "exploratory"
  | "needs-more-data"
  | "candidate"
  | "production-watchlist";

export type CandidatePromotionNextAction =
  | "gather-more-history"
  | "tune-parameters"
  | "reject-permanently"
  | "run-expanded-backtest"
  | "promote-to-watchlist"
  | "monitor-in-exploratory";

export type CandidatePromotionConfig = {
  rejectRobustnessThreshold: number;
  candidateRobustnessThreshold: number;
  watchlistRobustnessThreshold: number;
  minCandidateTradeCount: number;
  minWatchlistTradeCount: number;
  minCandidateHarnessRuns: number;
  minObservationCount: number;
};

export type CandidatePromotionInputPaths = {
  hypothesisValidationPath: string;
  strategySynthesisPath: string;
  harnessResultsPath: string;
  harnessSummaryFallbackPath: string;
  statisticalSignificancePath: string;
};

export type CandidatePromotionSupportingMetrics = {
  robustnessScore: number | null;
  validationPasses: boolean | null;
  observationCount: number | null;
  synthesisPromotionStatus: string | null;
  harnessMarketRuns: number;
  harnessSuccessfulRuns: number;
  harnessFailedRuns: number;
  totalTradeCount: number;
  netPnlCents: number | null;
  singleDayConcentrationPercent: number | null;
  singleDayDominated: boolean | null;
  statisticallySignificant: boolean | null;
  significancePValue: number | null;
  warningCount: number;
};

export type CandidatePromotionEntry = {
  strategyId: string;
  hypothesisId: string;
  strategyFamily: string;
  decision: CandidatePromotionDecision;
  explanation: string;
  supportingMetrics: CandidatePromotionSupportingMetrics;
  blockingIssues: readonly string[];
  warnings: readonly string[];
  recommendedNextAction: CandidatePromotionNextAction;
};

export type CandidatePromotionSummary = {
  totalStrategies: number;
  decisionCounts: Record<CandidatePromotionDecision, number>;
  rejectedCount: number;
  watchlistCount: number;
};

export type CandidatePromotionReport = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: CandidatePromotionInputPaths;
  config: CandidatePromotionConfig;
  summary: CandidatePromotionSummary;
  promotions: readonly CandidatePromotionEntry[];
};

export type ParsedSynthesisStrategy = {
  strategyId: string;
  hypothesisId: string;
  strategyFamily: string;
  promotionStatus: "experimental" | "candidate" | "rejected";
  validationSummary: {
    robustnessScore: number | null;
    passes: boolean;
    observationCount: number | null;
  };
  riskNotes: readonly string[];
};

export type ParsedValidationEntry = {
  hypothesisId: string;
  robustnessScore: number;
  passes: boolean;
  reasons: readonly string[];
  observationCount: number;
  sampleConcentration: {
    singleDayDominated: boolean;
    largestDayPercent: number;
  };
};

export type ParsedHarnessStrategyMetrics = {
  strategyId: string;
  hypothesisId: string;
  strategyFamily: string;
  marketRuns: number;
  successfulRuns: number;
  failedRuns: number;
  skippedRuns: number;
  totalTradeCount: number;
  netPnlCents: number | null;
  warnings: readonly string[];
};

export type ParsedCandidatePromotionInputs = {
  validation: {
    generatedAt: string;
    validations: readonly ParsedValidationEntry[];
  } | null;
  synthesis: {
    generatedAt: string;
    strategies: readonly ParsedSynthesisStrategy[];
  } | null;
  harnessStrategies: readonly ParsedHarnessStrategyMetrics[];
  significanceByFamily: ReadonlyMap<string, {
    statisticallySignificant: boolean;
    pValue: number | null;
    insufficientSample: boolean;
  }>;
};

export type BuildCandidatePromotionReportInput = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: CandidatePromotionInputPaths;
  inputs: ParsedCandidatePromotionInputs;
  config?: Partial<CandidatePromotionConfig>;
};

export type CandidatePromotionIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  readdir: (path: string) => readonly string[];
  isDirectory: (path: string) => boolean;
};

export class CandidatePromotionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CandidatePromotionError";
  }
}

export const DEFAULT_CANDIDATE_PROMOTION_INPUT_PATHS: CandidatePromotionInputPaths = {
  hypothesisValidationPath: DEFAULT_HYPOTHESIS_VALIDATION_OUTPUT_PATH,
  strategySynthesisPath: DEFAULT_STRATEGY_SYNTHESIS_INPUT_PATH,
  harnessResultsPath: DEFAULT_HARNESS_RESULTS_INPUT_PATH,
  harnessSummaryFallbackPath: DEFAULT_STRATEGY_HARNESS_SUMMARY_FALLBACK_PATH,
  statisticalSignificancePath: DEFAULT_STATISTICAL_SIGNIFICANCE_OUTPUT_PATH,
};
