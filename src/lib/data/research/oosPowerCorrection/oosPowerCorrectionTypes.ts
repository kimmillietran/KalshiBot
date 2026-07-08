import type { HypothesisCandidate } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";

export const OOS_POWER_CORRECTION_FILENAME = "oos-power-correction.json";
export const DEFAULT_OOS_POWER_CORRECTION_OUTPUT_PATH =
  "data/research-results/oos-power-correction.json";
export const DEFAULT_OOS_POWER_CORRECTION_HTML_PATH =
  "data/reports/oos-power-correction.html";

export const DEFAULT_OOS_HYPOTHESIS_CANDIDATES_PATH =
  "data/research-results/hypothesis-candidates.json";
export const DEFAULT_OOS_HYPOTHESIS_TRADE_REPLAY_PATH =
  "data/research-results/hypothesis-trade-replay.json";
export const DEFAULT_OOS_RESEARCH_RESULTS_DIR = "data/research-results";
export const DEFAULT_OOS_REGIME_TAGS_PATH = "data/research-results/regime-tags.json";

export const DEFAULT_OOS_CORRECTION_ALPHA = 0.05;
export const DEFAULT_OOS_TARGET_POWER = 0.8;
export const DEFAULT_OOS_MIN_EFFECT_CENTS = 2;
export const DEFAULT_OOS_BLOCK_BOOTSTRAP_ITERATIONS = 200;
export const DEFAULT_OOS_BLOCK_BOOTSTRAP_SEED = 42;

export type OosCorrectionMethodId = "benjaminiYekutieli" | "blockBootstrap";

export type OosTemporalSplitId = "train" | "validation" | "holdout";

export type OosStatisticalVerdict =
  | "pass"
  | "fail"
  | "underpowered"
  | "insufficient-data"
  | "skipped";

export type OosTemporalSplitRanges = {
  trainMonths: readonly string[];
  validationMonths: readonly string[];
  holdoutMonths: readonly string[];
};

export type OosTemporalSplitSummary = OosTemporalSplitRanges & {
  availableMonths: readonly string[];
  splitMode: "explicit" | "deterministic-default";
  trainCandidateCount: number;
  validationCandidateCount: number;
  holdoutCandidateCount: number;
};

export type OosSplitPowerMetrics = {
  split: OosTemporalSplitId;
  rawObservationCount: number;
  independentMarketCount: number;
  marketDayCount: number;
  effectiveSampleSizeEstimate: number;
  observedNetEdge: number | null;
  standardError: number | null;
  confidenceInterval95: { lower: number; upper: number } | null;
  minimumDetectableEffect: number | null;
  tStatistic: number | null;
  uncorrectedPValue: number | null;
  clearsMde: boolean;
  isUnderpowered: boolean;
  underpoweredReason: string | null;
};

export type OosPowerCorrectionEntry = {
  hypothesisId: string;
  hypothesis: string;
  sourceArtifact: string;
  candidate: Pick<HypothesisCandidate, "candidateId" | "confidence" | "bucketMetadata">;
  splitMetrics: Record<OosTemporalSplitId, OosSplitPowerMetrics>;
  uncorrectedPValue: number | null;
  correctedPValue: number | null;
  qValue: number | null;
  correctionMethod: OosCorrectionMethodId;
  passesUncorrected: boolean;
  passesCorrected: boolean;
  clearsMde: boolean;
  isUnderpowered: boolean;
  finalStatisticalVerdict: OosStatisticalVerdict;
  dependenceWarnings: readonly string[];
  tradeReplayAvailable: boolean;
};

export type OosPowerCorrectionConfig = {
  alpha: number;
  targetPower: number;
  minEffectCents: number;
  correctionMethod: OosCorrectionMethodId;
  blockKey: "market-day";
  officialOnly: boolean;
  blockBootstrapIterations: number;
  blockBootstrapSeed: number;
  explicitSplit: OosTemporalSplitRanges | null;
};

export type OosPowerCorrectionInputPaths = {
  hypothesisCandidatesPath: string;
  hypothesisTradeReplayPath: string;
  researchResultsDir: string;
  regimeTagsPath: string;
};

export type OosPowerCorrectionInputStatus = {
  hypothesisCandidatesPresent: boolean;
  hypothesisTradeReplayPresent: boolean;
  observationCount: number;
  availableMonthCount: number;
};

export type OosPowerCorrectionSummary = {
  candidateCount: number;
  testedCount: number;
  skippedCount: number;
  passesUncorrectedCount: number;
  passesCorrectedCount: number;
  underpoweredCount: number;
  insufficientDataCount: number;
  finalPassCount: number;
  dependenceWarningCount: number;
  correctionMethod: OosCorrectionMethodId;
  blockBootstrapScaffolded: boolean;
};

export type OosPowerCorrectionReport = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: OosPowerCorrectionInputPaths;
  inputStatus: OosPowerCorrectionInputStatus;
  config: OosPowerCorrectionConfig;
  splitSummary: OosTemporalSplitSummary;
  summary: OosPowerCorrectionSummary;
  entries: readonly OosPowerCorrectionEntry[];
  investigatorNotes: readonly string[];
  limitations: readonly string[];
};

export type OosPowerCorrectionIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  readdir: (path: string) => readonly string[];
  isDirectory: (path: string) => boolean;
};

export type BuildOosPowerCorrectionReportInput = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: OosPowerCorrectionInputPaths;
  io: OosPowerCorrectionIo;
  config?: Partial<OosPowerCorrectionConfig>;
};

export class OosPowerCorrectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OosPowerCorrectionError";
  }
}
