import type { ParsedStrategyAggregateSummary } from "../leaderboard/strategyLeaderboardTypes";
import type { StatisticalSignificanceReport } from "../statisticalSignificance/statisticalSignificanceTypes";

export const OVERFITTING_DIAGNOSTICS_FILENAME = "overfitting-diagnostics.json";
export const DEFAULT_OVERFITTING_DIAGNOSTICS_INPUT_DIR = "data/research-results";
export const DEFAULT_OVERFITTING_DIAGNOSTICS_EXPERIMENTS_ROOT = "data/experiments";
export const DEFAULT_OVERFITTING_DIAGNOSTICS_OUTPUT_PATH =
  "data/research-results/overfitting-diagnostics.json";

export const DEFAULT_MULTIPLE_TESTING_ALPHA = 0.05;
export const MIN_PBO_FOLDS = 2;
export const MIN_PBO_VARIANTS = 2;

export type MetricAvailability = "computed" | "unavailable";

export type BestObservedResult = {
  metric: "totalPnlCents" | "averageReturnPct";
  value: number | null;
  completedMarkets: number;
};

export type StrategyFamilyDiagnostics = {
  strategyId: string;
  bestObserved: BestObservedResult;
  rawPValue: number | null;
  pValueSource: "statistical-significance" | "unavailable";
};

export type FamilyWiseAdjustedPValue = {
  strategyId: string;
  rawPValue: number | null;
  bonferroniAdjustedPValue: number | null;
  holmAdjustedPValue: number | null;
  rejectedBonferroni: boolean;
  rejectedHolm: boolean;
};

export type FdrAdjustedPValue = {
  strategyId: string;
  rawPValue: number | null;
  bhAdjustedPValue: number | null;
  rejectedFdr: boolean;
};

export type MultipleTestingDiagnostics = {
  status: MetricAvailability;
  alpha: number;
  hypothesisCount: number;
  familyWise: readonly FamilyWiseAdjustedPValue[];
  fdr: readonly FdrAdjustedPValue[];
  warnings: readonly string[];
};

export type BacktestOverfittingDiagnostic = {
  status: MetricAvailability;
  probabilityOfOverfitting: number | null;
  foldCount: number | null;
  variantCount: number | null;
  method: "rank-degradation-across-folds" | null;
  warnings: readonly string[];
};

export type DeflatedSharpeEntry = {
  strategyId: string;
  observedSharpeRatio: number | null;
  expectedMaxSharpeUnderNull: number | null;
  deflatedSharpeApproximation: number | null;
  sampleSize: number;
};

export type DeflatedSharpeDiagnostic = {
  status: MetricAvailability;
  trialsCount: number | null;
  strategies: readonly DeflatedSharpeEntry[];
  warnings: readonly string[];
};

export type ExperimentRegistryDiagnostics = {
  available: boolean;
  experimentCount: number;
  uniqueConfigCount: number;
  warnings: readonly string[];
};

export type EvaluationScope = {
  experimentCount: number;
  configCount: number;
  strategyFamilyCount: number;
  strategyIds: readonly string[];
};

export type OverfittingDiagnosticsReport = {
  generatedAt: string;
  inputRoot: string;
  experimentsRoot: string;
  significancePath: string | null;
  outputPath: string;
  evaluationScope: EvaluationScope;
  experimentRegistry: ExperimentRegistryDiagnostics;
  strategyFamilies: readonly StrategyFamilyDiagnostics[];
  multipleTesting: MultipleTestingDiagnostics;
  backtestOverfitting: BacktestOverfittingDiagnostic;
  deflatedSharpe: DeflatedSharpeDiagnostic;
  warnings: readonly string[];
};

export type BuildOverfittingDiagnosticsReportInput = {
  inputRoot: string;
  experimentsRoot: string;
  outputPath: string;
  generatedAt: string;
  summaries: readonly ParsedStrategyAggregateSummary[];
  significanceReport: StatisticalSignificanceReport | null;
  significancePath: string | null;
  experimentRegistry: ExperimentRegistryDiagnostics;
  configCount: number;
  foldPerformanceMatrix: FoldPerformanceMatrix | null;
  alpha?: number;
};

export type OverfittingDiagnosticsIo = {
  readdir: (path: string) => readonly string[];
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  isDirectory: (path: string) => boolean;
};

export type ParsedExperimentRecord = {
  experimentId: string;
  strategyId: string;
  strategyConfig: Record<string, unknown>;
};

export type FoldPerformanceMatrix = {
  folds: readonly string[];
  variants: readonly string[];
  /** variantId -> foldId -> performance (total PnL cents) */
  performances: Readonly<Record<string, Readonly<Record<string, number>>>>;
  sourcePath: string;
};
