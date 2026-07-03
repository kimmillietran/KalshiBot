import type { HistoricalResearchCliInput } from "@/lib/data/fixtures/historicalFixtureTypes";

export const STRATEGY_SYNTHESIS_CANDIDATES_FILENAME = "strategy-synthesis-candidates.json";
export const DEFAULT_STRATEGY_SYNTHESIS_CANDIDATES_PATH =
  "data/research-results/strategy-synthesis-candidates.json";
export const DEFAULT_STRATEGY_HARNESS_OUTPUT_DIR = "data/research-results/harness";
export const DEFAULT_STRATEGY_HARNESS_SUMMARY_FILENAME = "strategy-harness-summary.json";
export const STRATEGY_HARNESS_OUTPUT_FILENAME = "research-output.json";

export const SYNTHESIZED_STRATEGY_DIRECTIONS = [
  "buy-yes",
  "buy-no",
  "fade-yes",
  "fade-no",
] as const;

export const SUPPORTED_STRATEGY_HARNESS_FAMILIES = ["calibration-fade"] as const;

export const SYNTHESIZED_PROMOTION_STATUSES = [
  "experimental",
  "candidate",
  "rejected",
] as const;

export type SynthesizedStrategyDirection =
  (typeof SYNTHESIZED_STRATEGY_DIRECTIONS)[number];

export type SupportedStrategyHarnessFamily =
  (typeof SUPPORTED_STRATEGY_HARNESS_FAMILIES)[number];

export type SynthesizedPromotionStatus =
  (typeof SYNTHESIZED_PROMOTION_STATUSES)[number];

export type SynthesizedStrategyEntryConditions = {
  yesMidThresholdCents: number;
  minCalibrationError?: number;
  probabilityBucketId?: string;
};

export type SynthesizedStrategyValidationSummary = {
  robustnessScore: number | null;
  passes: boolean;
  observationCount: number | null;
};

export type SynthesizedStrategySpec = {
  strategyId: string;
  hypothesisId: string;
  strategyFamily: string;
  direction: SynthesizedStrategyDirection;
  entryConditions: SynthesizedStrategyEntryConditions;
  exitAssumption: string;
  requiredData: readonly string[];
  riskNotes: readonly string[];
  validationSummary: SynthesizedStrategyValidationSummary;
  promotionStatus: SynthesizedPromotionStatus;
};

export type StrategySynthesisCandidatesReport = {
  generatedAt: string;
  outputPath: string;
  inputs: Record<string, unknown>;
  strategies: readonly SynthesizedStrategySpec[];
  summary: Record<string, unknown>;
};

export type TranslatedHarnessStrategy = {
  pluginStrategyId: "calibration-fade";
  strategyConfig: Record<string, unknown>;
  synthesizedStrategyId: string;
  hypothesisId: string;
  strategyFamily: string;
};

export type StrategyHarnessMarketResult = {
  synthesizedStrategyId: string;
  hypothesisId: string;
  strategyFamily: string;
  seriesTicker: string;
  marketTicker: string;
  fixturePath: string;
  outputPath: string;
  status: "success" | "failed" | "skipped";
  errorMessage: string | null;
  runId: string | null;
};

export type StrategyHarnessSummary = {
  synthesisPath: string;
  registryDir: string;
  outputDir: string;
  summaryPath: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  evaluatedStrategies: number;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  skippedRuns: number;
  results: readonly StrategyHarnessMarketResult[];
};

export type StrategyHarnessIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  readdir: (path: string) => readonly string[];
  isDirectory: (path: string) => boolean;
  writeFile: (path: string, data: string) => void;
  mkdir: (path: string) => void;
};

export type RunStrategyHarnessEvaluationInput = {
  spec: SynthesizedStrategySpec;
  fixture: HistoricalResearchCliInput;
};

export type RunStrategyHarnessEvaluationFn = (
  input: RunStrategyHarnessEvaluationInput,
) => string;

export class StrategyHarnessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StrategyHarnessError";
  }
}
