export const DEFAULT_LEAD_LAG_INPUT_DIR = "data/research-results";
export const DEFAULT_LEAD_LAG_OUTPUT_PATH =
  "data/research-results/lead-lag-analysis.json";
export const DEFAULT_LEAD_LAG_MAX_LAG = 10;
export const LEAD_LAG_ANALYSIS_FILENAME = "lead-lag-analysis.json";

export const LeadLagErrorCode = {
  INVALID_JSON: "invalid-json",
  INVALID_DOCUMENT: "invalid-document",
  EMPTY_DATASET: "empty-dataset",
} as const;

export type LeadLagErrorCode =
  (typeof LeadLagErrorCode)[keyof typeof LeadLagErrorCode];

export class LeadLagError extends Error {
  readonly code: LeadLagErrorCode;

  constructor(message: string, code: LeadLagErrorCode) {
    super(message);
    this.name = "LeadLagError";
    this.code = code;
  }
}

export type LeadLagDirection =
  | "btc-leads-kalshi"
  | "synchronous"
  | "insufficient-data";

export type LeadLagCandlePoint = {
  stepIndex: number;
  timestampMs: number;
  btcPrice: number;
  impliedProbability: number;
};

export type LeadLagLagMetrics = {
  lag: number;
  correlation: number | null;
  crossCorrelation: number | null;
  direction: LeadLagDirection;
  observationCount: number;
};

export type LeadLagMarketSeries = {
  strategyId: string;
  seriesTicker: string;
  marketTicker: string;
  outputPath: string;
  candleCount: number;
  skippedMissingCandles: number;
  lagMetrics: readonly LeadLagLagMetrics[];
  bestLag: number | null;
  bestDirection: LeadLagDirection;
};

export type LeadLagWarning = {
  code: string;
  message: string;
  marketTicker?: string;
};

export type LeadLagSampleCounts = {
  marketCount: number;
  totalCandles: number;
  skippedMarkets: number;
  skippedMissingCandles: number;
};

export type LeadLagAnalysis = {
  generatedAt: string;
  inputRoot: string;
  outputPath: string;
  maxLag: number;
  sampleCounts: LeadLagSampleCounts;
  aggregateLagMetrics: readonly LeadLagLagMetrics[];
  markets: readonly LeadLagMarketSeries[];
  warnings: readonly LeadLagWarning[];
};

export type LeadLagIo = {
  readdir: (path: string) => readonly string[];
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  isDirectory: (path: string) => boolean;
};

export type BuildLeadLagAnalysisInput = {
  inputRoot: string;
  outputPath: string;
  generatedAt: string;
  maxLag?: number;
  scanned: readonly import("@/lib/data/research/calibration/calibrationTypes").ScannedCalibrationResearchOutput[];
};
