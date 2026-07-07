import type { LeadLagAnalysis } from "@/lib/data/research/leadLag/leadLagTypes";
import type { MispricingAtlas } from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";
import type {
  MispricingAtlasCoverageDiagnostics,
} from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";
import type { StrategyLeaderboard } from "@/lib/data/research/leaderboard/strategyLeaderboardTypes";
import type { StatisticalSignificanceReport } from "@/lib/data/research/statisticalSignificance/statisticalSignificanceTypes";

export const HYPOTHESIS_CANDIDATES_FILENAME = "hypothesis-candidates.json";
export const DEFAULT_HYPOTHESIS_CANDIDATES_OUTPUT_PATH =
  "data/research-results/hypothesis-candidates.json";

export const DEFAULT_MISPRICING_ATLAS_INPUT_PATH =
  "data/research-results/mispricing-atlas.json";
export const DEFAULT_LEAD_LAG_INPUT_PATH =
  "data/research-results/lead-lag-analysis.json";
export const DEFAULT_STATISTICAL_SIGNIFICANCE_INPUT_PATH =
  "data/research-results/statistical-significance.json";
export const DEFAULT_REGIME_TAGS_INPUT_PATH =
  "data/research-results/regime-tags.json";
export const DEFAULT_STRATEGY_LEADERBOARD_INPUT_PATH =
  "data/leaderboards/strategy-leaderboard.json";

export const DEFAULT_HYPOTHESIS_MIN_SAMPLE_SIZE = 30;
export const DEFAULT_MIN_CALIBRATION_ERROR = 0.05;
export const DEFAULT_MIN_LEAD_LAG_CORRELATION = 0.2;
export const DEFAULT_MIN_UNIQUE_TRADING_DAYS = 2;
export const DEFAULT_TRIPLE_AXIS_MIN_SAMPLE_SIZE = 45;

export const HYPOTHESIS_ATLAS_GROUP_IDS = [
  "probabilityOnly",
  "probabilityTime",
  "probabilityRegime",
  "probabilityMoneyness",
  "moneynessTime",
  "volatilityMoneyness",
  "volatilityProbabilityTime",
  "probabilityMomentumTime",
  "probabilityMomentum",
  "momentumVolatility",
  "momentumTime",
  "momentum",
  "probability",
  "timeRemaining",
  "moneyness",
  "volatility",
] as const;

export type HypothesisAtlasGroupId = (typeof HYPOTHESIS_ATLAS_GROUP_IDS)[number];

export type HypothesisBucketSampleThresholds = Partial<
  Record<HypothesisAtlasGroupId, number>
>;

export const HypothesisCandidateErrorCode = {
  INVALID_JSON: "invalid-json",
  INVALID_DOCUMENT: "invalid-document",
} as const;

export type HypothesisCandidateErrorCode =
  (typeof HypothesisCandidateErrorCode)[keyof typeof HypothesisCandidateErrorCode];

export class HypothesisCandidateError extends Error {
  readonly code: HypothesisCandidateErrorCode;

  constructor(message: string, code: HypothesisCandidateErrorCode) {
    super(message);
    this.name = "HypothesisCandidateError";
    this.code = code;
  }
}

export type HypothesisConfidence = "low" | "medium" | "high";

export type HypothesisBucketMetadata = {
  groupId: HypothesisAtlasGroupId;
  bucketId: string;
  bucketLabel: string;
  observations: number;
  uniqueTradingDays: number | null;
  calibrationError: number;
  calibrationDirection: "over" | "under";
};

export type HypothesisCandidate = {
  candidateId: string;
  sourceArtifact: string;
  hypothesis: string;
  rationale: string;
  marketCondition: string;
  suggestedStrategyFamily: string;
  requiredData: readonly string[];
  proposedEntryCondition: string;
  proposedExitSettlementAssumption: string;
  expectedFailureMode: string;
  killCriterion: string;
  confidence: HypothesisConfidence;
  warnings: readonly string[];
  bucketMetadata?: HypothesisBucketMetadata | null;
  refinementRegistration?: RefinementHypothesisRegistrationMetadata;
};

export type RefinementHypothesisRegistrationMetadata = {
  parentHypothesisId: string;
  refinementType: string;
  generatedFromFailureAnalysis: boolean;
  suggestedFilters: Record<string, unknown>;
  generationReason: string;
  refinementRank: number;
  status: "candidate-refinement";
};

export type RegimeTagEntry = {
  regimeId: string;
  label: string;
  marketCount: number;
  tags: readonly string[];
};

export type RegimeTagsDocument = {
  generatedAt: string;
  regimes: readonly RegimeTagEntry[];
};

export type HypothesisCandidateConfig = {
  minSampleSize: number;
  minCalibrationError: number;
  minLeadLagCorrelation: number;
  minUniqueTradingDays: number;
  minSampleSizeByGroup: HypothesisBucketSampleThresholds;
};

export type HypothesisCandidateInputStatus = {
  mispricingAtlasPath: string;
  leadLagAnalysisPath: string;
  statisticalSignificancePath: string;
  regimeTagsPath: string;
  strategyLeaderboardPath: string;
  mispricingAtlasPresent: boolean;
  leadLagAnalysisPresent: boolean;
  statisticalSignificancePresent: boolean;
  regimeTagsPresent: boolean;
  strategyLeaderboardPresent: boolean;
};

export type HypothesisCandidatesSummary = {
  candidateCount: number;
  noCandidateReasons: readonly string[];
  atlasCoverageDiagnostics: MispricingAtlasCoverageDiagnostics | null;
};

export type HypothesisCandidateMemoryDiagnostics = {
  atlasObservationCount: number;
  candidateCount: number;
  peakRetainedCandidateCount: number;
  atlasBucketGroupCount: number;
  largestIntermediateCollection: string;
};

export type HypothesisCandidatesReport = {
  generatedAt: string;
  outputPath: string;
  config: HypothesisCandidateConfig;
  inputs: HypothesisCandidateInputStatus;
  candidates: readonly HypothesisCandidate[];
  summary: HypothesisCandidatesSummary;
  memoryDiagnostics?: HypothesisCandidateMemoryDiagnostics;
};

export type ParsedHypothesisCandidateInputs = {
  mispricingAtlas: MispricingAtlas | null;
  leadLagAnalysis: LeadLagAnalysis | null;
  statisticalSignificance: StatisticalSignificanceReport | null;
  regimeTags: RegimeTagsDocument | null;
  strategyLeaderboard: StrategyLeaderboard | null;
};

export type BuildHypothesisCandidatesInput = {
  generatedAt: string;
  outputPath: string;
  inputs: ParsedHypothesisCandidateInputs;
  inputStatus: HypothesisCandidateInputStatus;
  config?: Partial<HypothesisCandidateConfig>;
  memoryReport?: boolean;
};

export type HypothesisCandidateIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
};
