export const OFFICIAL_MONTH_EXPANSION_REFRESH_FILENAME =
  "official-month-expansion-refresh.json";
export const DEFAULT_OFFICIAL_MONTH_EXPANSION_REFRESH_OUTPUT_PATH =
  "data/research-results/official-month-expansion-refresh.json";
export const DEFAULT_OFFICIAL_MONTH_EXPANSION_REFRESH_HTML_OUTPUT_PATH =
  "data/reports/official-month-expansion-refresh.html";

export const MONTH_COVERAGE_AUDIT_FILENAME = "month-coverage-audit.json";
export const DEFAULT_MONTH_COVERAGE_AUDIT_OUTPUT_PATH =
  "data/research-results/month-coverage-audit.json";
export const DEFAULT_MONTH_COVERAGE_AUDIT_HTML_OUTPUT_PATH =
  "data/reports/month-coverage-audit.html";

export const OfficialMonthExpansionRefreshErrorCode = {
  INVALID_JSON: "invalid-json",
  INVALID_DOCUMENT: "invalid-document",
  MISSING_INPUT: "missing-input",
  COMMAND_FAILED: "command-failed",
} as const;

export type OfficialMonthExpansionRefreshErrorCode =
  (typeof OfficialMonthExpansionRefreshErrorCode)[keyof typeof OfficialMonthExpansionRefreshErrorCode];

export class OfficialMonthExpansionRefreshError extends Error {
  readonly code: OfficialMonthExpansionRefreshErrorCode;

  constructor(message: string, code: OfficialMonthExpansionRefreshErrorCode) {
    super(message);
    this.name = "OfficialMonthExpansionRefreshError";
    this.code = code;
  }
}

export const OFFICIAL_MONTH_REFRESH_RECOMMENDATIONS = [
  "proceed-to-trade-pnl-oos",
  "collect-more-official-months",
  "pause-calibration-fade",
  "pivot-new-family",
  "insufficient-new-data",
  "blocked-import-refresh",
] as const;

export type OfficialMonthRefreshRecommendation =
  (typeof OFFICIAL_MONTH_REFRESH_RECOMMENDATIONS)[number];

export type MonthSettlementStatus = "official" | "derived-sensitive" | "mixed" | "unknown";

export type MonthCoverageAuditEntry = {
  calendarMonth: string;
  settlementStatus: MonthSettlementStatus;
  marketCount: number;
  tradingDayCount: number;
  observationCount: number | null;
  replayFillCount: number | null;
  hypothesisCandidateCount: number | null;
  coverageStatus: "MISSING" | "UNDER_COVERED" | "COVERED" | "unknown";
  importable: boolean;
  importableReason: string | null;
};

export type MonthCoverageAudit = {
  generatedAt: string;
  sensitiveMonths: readonly string[];
  availableCalendarMonths: readonly string[];
  officialMonths: readonly string[];
  derivedSensitiveMonths: readonly string[];
  missingMonths: readonly string[];
  underCoveredMonths: readonly string[];
  importableOfficialMonths: readonly string[];
  alreadyImportedMonths: readonly string[];
  months: readonly MonthCoverageAuditEntry[];
  additionalOfficialMonthsAvailable: boolean;
  additionalOfficialMonthsReason: string;
};

export type EvidenceSnapshot = {
  capturedAt: string;
  calendarMonthsCovered: readonly string[];
  officialMonthsCovered: readonly string[];
  derivedSensitiveMonthsCovered: readonly string[];
  marketCount: number | null;
  observationCount: number | null;
  hypothesisCount: number | null;
  positiveNetReplayHypothesisCount: number | null;
  familyNetPnlCents: number | null;
  excludingSensitiveMonthNetPnlCents: number | null;
  topMonthShare: number | null;
  top3MonthShare: number | null;
  positiveMonthCount: number | null;
  negativeMonthCount: number | null;
  uniqueTradingDayCount: number | null;
  familyVerdict: string | null;
  forensicsVerdict: string | null;
  derivedMonthSensitivityRecommendation: string | null;
  recommendFullM12: boolean | null;
  officialPositiveMonthCount: number | null;
  excludingVariantTopMonthShare: number | null;
};

export type EvidenceSnapshotDelta = {
  calendarMonthsAdded: readonly string[];
  officialMonthsAdded: readonly string[];
  marketCountDelta: number | null;
  observationCountDelta: number | null;
  hypothesisCountDelta: number | null;
  positiveNetReplayHypothesisCountDelta: number | null;
  familyNetPnlCentsDelta: number | null;
  excludingSensitiveMonthNetPnlCentsDelta: number | null;
  topMonthShareDelta: number | null;
  top3MonthShareDelta: number | null;
  positiveMonthCountDelta: number | null;
  negativeMonthCountDelta: number | null;
  uniqueTradingDayCountDelta: number | null;
};

export type OfficialMonthExpansionRefreshConfig = {
  sensitiveMonth: string;
  minOfficialPositiveMonths: number;
  topMonthMaxShare: number;
  minUniqueTradingDayIncrease: number;
};

export type OfficialMonthExpansionRefreshInputPaths = {
  researchResultsDir: string;
  historicalCoveragePlanPath: string;
  historicalExpansionConfigPath: string;
  hypothesisCandidatesPath: string;
  hypothesisValidationPath: string;
  hypothesisTradeReplayPath: string;
  calibrationFadeFamilyVerdictPath: string;
  pnlForensicsGatePath: string;
  derivedMonthPnlSensitivityPath: string;
  mispricingAtlasPath: string;
  dataHealthPath: string;
  regimeTagsPath: string;
};

export type OfficialMonthExpansionRefreshInputStatus = {
  historicalCoveragePlanPresent: boolean;
  historicalExpansionConfigPresent: boolean;
  hypothesisCandidatesPresent: boolean;
  hypothesisValidationPresent: boolean;
  hypothesisTradeReplayPresent: boolean;
  calibrationFadeFamilyVerdictPresent: boolean;
  pnlForensicsGatePresent: boolean;
  derivedMonthPnlSensitivityPresent: boolean;
};

export type ExpansionExecutionSummary = {
  attempted: boolean;
  succeeded: boolean;
  importExecuted: boolean;
  rebuildExecuted: boolean;
  evidenceChainExecuted: boolean;
  monthsAdded: readonly string[];
  monthsDeepened: readonly string[];
  commandsRun: readonly string[];
  errors: readonly string[];
};

export type OfficialMonthExpansionRefreshReport = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  disclaimer: string;
  caveats: readonly string[];
  config: OfficialMonthExpansionRefreshConfig;
  inputPaths: OfficialMonthExpansionRefreshInputPaths;
  inputStatus: OfficialMonthExpansionRefreshInputStatus;
  monthCoverageAudit: MonthCoverageAudit;
  before: EvidenceSnapshot;
  after: EvidenceSnapshot;
  delta: EvidenceSnapshotDelta;
  expansionExecution: ExpansionExecutionSummary;
  finalRecommendation: OfficialMonthRefreshRecommendation;
  recommendFullM12: boolean;
  warnings: readonly string[];
};

export type OfficialMonthExpansionRefreshIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  readdir: (path: string) => readonly string[];
  isDirectory: (path: string) => boolean;
};

export type ShellCommandRunner = (
  command: string,
  options?: { cwd?: string },
) => Promise<{ exitCode: number; stdout: string; stderr: string }>;
