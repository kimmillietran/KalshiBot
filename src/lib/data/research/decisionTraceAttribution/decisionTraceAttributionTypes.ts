export const DECISION_TRACE_ATTRIBUTION_FILENAME = "decision-trace-attribution.json";
export const DEFAULT_DECISION_TRACE_ATTRIBUTION_INPUT_DIR = "data/research-results";
export const DEFAULT_DECISION_TRACE_ATTRIBUTION_OUTPUT_PATH =
  "data/research-results/decision-trace-attribution.json";

export const MIN_ATTRIBUTION_SAMPLE_SIZE = 5;

export const DecisionTraceAttributionErrorCode = {
  INVALID_JSON: "invalid-json",
  INVALID_DOCUMENT: "invalid-document",
  MISSING_INPUT_DIRECTORY: "missing-input-directory",
} as const;

export type DecisionTraceAttributionErrorCode =
  (typeof DecisionTraceAttributionErrorCode)[keyof typeof DecisionTraceAttributionErrorCode];

export class DecisionTraceAttributionError extends Error {
  readonly code: DecisionTraceAttributionErrorCode;

  constructor(message: string, code: DecisionTraceAttributionErrorCode) {
    super(message);
    this.name = "DecisionTraceAttributionError";
    this.code = code;
  }
}

export type AttributionObservation = {
  strategyId: string;
  seriesTicker: string;
  marketTicker: string;
  tracePath: string;
  candleIndex: number;
  action: string;
  yesMidBucketId: string;
  yesMidBucketLabel: string;
  timeRemainingBucketId: string;
  timeRemainingBucketLabel: string;
  btcReturnBucketId: string;
  btcReturnBucketLabel: string;
  regimeTagBucketId: string;
  regimeTagBucketLabel: string;
  pnlCents: number;
  fillPriceCents: number;
  isWin: boolean;
};

export type AttributionBucketSummary = {
  bucketId: string;
  bucketLabel: string;
  count: number;
  averagePnlCents: number | null;
  winRatePct: number | null;
  averageFillPriceCents: number | null;
  warnings: readonly string[];
};

export type AttributionSampleCounts = {
  totalObservations: number;
  traceDocumentCount: number;
  marketCount: number;
  skippedMissingResearchOutput: number;
  skippedMissingFills: number;
};

export type AttributionWarning = {
  code:
    | "missing-research-output"
    | "missing-fills"
    | "invalid-trace"
    | "invalid-research-output";
  message: string;
  tracePath?: string;
  marketTicker?: string;
};

export type DecisionTraceAttributionReport = {
  generatedAt: string;
  inputRoot: string;
  outputPath: string;
  sampleCounts: AttributionSampleCounts;
  actionBuckets: readonly AttributionBucketSummary[];
  yesMidBuckets: readonly AttributionBucketSummary[];
  timeRemainingBuckets: readonly AttributionBucketSummary[];
  btcReturnBuckets: readonly AttributionBucketSummary[];
  regimeTagBuckets: readonly AttributionBucketSummary[];
  strategyBuckets: readonly AttributionBucketSummary[];
  warnings: readonly AttributionWarning[];
};

export type ScannedDecisionTrace = {
  strategyId: string;
  seriesTicker: string;
  marketTicker: string;
  tracePath: string;
  researchOutputPath: string;
  traceJson: string;
  researchOutputJson?: string | null;
};

export type BuildDecisionTraceAttributionInput = {
  inputRoot: string;
  outputPath: string;
  generatedAt: string;
  scanned: readonly ScannedDecisionTrace[];
};

export type DecisionTraceAttributionIo = {
  readdir: (path: string) => readonly string[];
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  isDirectory: (path: string) => boolean;
};
