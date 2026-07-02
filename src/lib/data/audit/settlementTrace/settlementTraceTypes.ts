export const DEFAULT_SETTLEMENT_TRACE_IMPORTS_DIR = "data/imports";
export const DEFAULT_SETTLEMENT_TRACE_IMPORT_CONFIGS_DIR = "data/import-configs";
export const DEFAULT_SETTLEMENT_TRACE_FIXTURES_DIR = "data/fixtures";
export const DEFAULT_SETTLEMENT_TRACE_REGISTRY_DIR = "data/research-datasets";
export const DEFAULT_SETTLEMENT_TRACE_RESEARCH_RESULTS_DIR = "data/research-results";

export const SETTLEMENT_TRACE_STAGE_ORDER = [
  "import-config",
  "import-result",
  "fixture",
  "registry",
  "research-output-replay-input",
  "research-output-replay-steps",
  "aggregate-summary",
  "calibration-report",
  "mispricing-atlas",
] as const;

export type SettlementTraceStageId = (typeof SETTLEMENT_TRACE_STAGE_ORDER)[number];

export type SettlementTraceStageStatus =
  | "found"
  | "missing"
  | "unavailable"
  | "malformed";

export type SettlementTraceStage = {
  stageId: SettlementTraceStageId;
  status: SettlementTraceStageStatus;
  path: string | null;
  settlementPresent: boolean | null;
  settlementValue: string | null;
  settlementFieldPath: string | null;
  marketTickerMatched: boolean | null;
  warnings: readonly string[];
  metadata: Readonly<Record<string, unknown>>;
};

export type SettlementTraceStrategySummary = {
  strategyId: string;
  researchOutputPath: string | null;
  replayInputSettlementPresent: boolean | null;
  replayInputSettlementValue: string | null;
  replayInputSettlementFieldPath: string | null;
  replayStepsTotal: number;
  replayStepsWithSettlement: number;
  replayStepSettlementFieldPath: string | null;
  aggregateSummaryPath: string | null;
  calibrationReportPath: string | null;
  calibrationSettlementOutcome: number | null;
};

export type SettlementTraceConfig = {
  marketTicker: string;
  importsDir: string;
  importConfigsDir: string;
  fixturesDir: string;
  registryDir: string;
  researchResultsDir: string;
};

export type SettlementTraceReport = {
  generatedAt: string;
  marketTicker: string;
  seriesTicker: string;
  outputPath: string;
  config: SettlementTraceConfig;
  stages: readonly SettlementTraceStage[];
  strategySummaries: readonly SettlementTraceStrategySummary[];
  firstMissingStage: SettlementTraceStageId | null;
  likelyRootCause: string;
  recommendedNextAction: string;
};

export type SettlementTraceIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  readdir: (path: string) => readonly string[];
  isDirectory: (path: string) => boolean;
};

export type BuildSettlementTraceReportInput = {
  generatedAt: string;
  outputPath: string;
  config: SettlementTraceConfig;
  io: SettlementTraceIo;
};

export class SettlementTraceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettlementTraceError";
  }
}
