import type {
  HistoricalBronzeValidationErrorCode,
  HistoricalBronzeValidationIssue,
} from "../historicalBronzeValidationTypes";

export type HistoricalBronzeValidationReportSummary = {
  totalRecords: number;
  errorCount: number;
  warningCount: number;
  marketCount: number;
  btcBarCount: number;
  settlementCount: number;
  duplicateCount: number;
};

export type HistoricalBronzeValidationIssuesByCodeEntry = {
  errorCode: HistoricalBronzeValidationErrorCode;
  issues: readonly HistoricalBronzeValidationIssue[];
};

export type HistoricalBronzeValidationIssuesByTickerEntry = {
  ticker: string | null;
  issues: readonly HistoricalBronzeValidationIssue[];
};

export type HistoricalBronzeValidationReportMetadata = Readonly<
  Record<string, unknown>
>;

export type HistoricalBronzeValidationReport = {
  reportId: string;
  valid: boolean;
  summary: HistoricalBronzeValidationReportSummary;
  issuesByCode: readonly HistoricalBronzeValidationIssuesByCodeEntry[];
  issuesByTicker: readonly HistoricalBronzeValidationIssuesByTickerEntry[];
  topIssues: readonly HistoricalBronzeValidationIssue[];
  metadata: HistoricalBronzeValidationReportMetadata;
};

export type BuildHistoricalBronzeValidationReportInput = {
  validationResult: import("../historicalBronzeValidationTypes").HistoricalBronzeValidationResult;
  metadata?: HistoricalBronzeValidationReportMetadata;
};
