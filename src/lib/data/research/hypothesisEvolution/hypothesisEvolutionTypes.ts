import type { CoverageAwareValidationClassification } from "@/lib/data/research/coverageAwareValidation/coverageAwareValidationTypes";
import type { HypothesisConfidence } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";

export const HYPOTHESIS_HISTORY_FILENAME = "hypothesis-history.json";
export const DEFAULT_HYPOTHESIS_HISTORY_OUTPUT_PATH =
  "data/research-results/hypothesis-history.json";
export const DEFAULT_HYPOTHESIS_EVOLUTION_HTML_PATH =
  "data/reports/hypothesis-evolution.html";

export const DEFAULT_HYPOTHESIS_HISTORY_MAX_RUNS = 100;

export const HYPOTHESIS_EVOLUTION_TRENDS = [
  "strengthening",
  "weakening",
  "stable",
  "newly-discovered",
  "disappeared",
] as const;

export type HypothesisEvolutionTrend =
  (typeof HYPOTHESIS_EVOLUTION_TRENDS)[number];

export type HypothesisEvolutionValidationEntry = {
  hypothesisId: string;
  hypothesis: string;
  robustnessScore: number;
  passes: boolean;
  observationCount: number;
  timeStability: {
    monthPeriods: readonly { observations: number }[];
    monthPersistenceRate: number;
  };
  regimeStability: {
    regimesWithData: number;
    regimesWithEdge: number;
  };
  sampleConcentration: {
    uniqueTradingDays: number;
  };
  leaveOnePeriodOut: {
    errorStdDev: number;
  };
};

export type HypothesisEvolutionRunSnapshot = {
  timestamp: string;
  hypothesis: string;
  marketCount: number;
  observationCount: number;
  robustnessScore: number;
  calibrationError: number | null;
  confidence: HypothesisConfidence | null;
  monthCount: number;
  uniqueTradingDays: number;
  regimesWithData: number;
  regimesWithEdge: number;
  monthPersistenceRate: number;
  leaveOneMonthOutStdDev: number;
  classification: CoverageAwareValidationClassification | null;
  passes: boolean;
  promotionEligible: boolean;
  candidateRank: number | null;
};

export type HypothesisHistoryRun = {
  runId: string;
  marketCount: number;
  snapshotsByHypothesisId: Record<string, HypothesisEvolutionRunSnapshot>;
};

export type HypothesisHistoryDocument = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  maxRunsRetained: number;
  runs: readonly HypothesisHistoryRun[];
};

export type HypothesisEvolutionTrendMetrics = {
  robustnessDelta: number | null;
  observationGrowth: number | null;
  coverageGrowth: number | null;
  calibrationDelta: number | null;
  promotionTrajectory: string | null;
};

export type HypothesisEvolutionClassificationChange = {
  timestamp: string;
  classification: CoverageAwareValidationClassification | null;
};

export type HypothesisEvolutionEntry = {
  hypothesisId: string;
  hypothesis: string;
  trend: HypothesisEvolutionTrend;
  trendMetrics: HypothesisEvolutionTrendMetrics;
  classificationChanges: readonly HypothesisEvolutionClassificationChange[];
  timeline: readonly HypothesisEvolutionRunSnapshot[];
  currentStatus: HypothesisEvolutionRunSnapshot | null;
};

export type HypothesisEvolutionDashboardHighlights = {
  strongestImprovingHypothesisId: string | null;
  strongestImprovingHypothesis: string | null;
  largestRobustnessGain: number | null;
  largestObservationGrowth: number | null;
  approachingPromotion: readonly string[];
  regressedHypotheses: readonly string[];
};

export type HypothesisEvolutionSummary = {
  totalHypotheses: number;
  strengtheningCount: number;
  weakeningCount: number;
  stableCount: number;
  newlyDiscoveredCount: number;
  disappearedCount: number;
  runCount: number;
};

export type HypothesisEvolutionReport = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  historyPath: string;
  summary: HypothesisEvolutionSummary;
  highlights: HypothesisEvolutionDashboardHighlights;
  entries: readonly HypothesisEvolutionEntry[];
};

export type HypothesisEvolutionInputPaths = {
  hypothesisCandidatesPath: string;
  hypothesisValidationPath: string;
  coverageValidationPath: string;
  mispricingAtlasPath: string;
  historyPath: string;
};

export type HypothesisEvolutionIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
};

export class HypothesisEvolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HypothesisEvolutionError";
  }
}
