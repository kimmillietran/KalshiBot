import { fnv1a32, stableStringify } from "@/lib/trading/config/hashConfig";

import type {
  HistoricalBronzeValidationIssue,
  HistoricalBronzeValidationResult,
} from "../historicalBronzeValidationTypes";

import type {
  BuildHistoricalBronzeValidationReportInput,
  HistoricalBronzeValidationIssuesByCodeEntry,
  HistoricalBronzeValidationIssuesByTickerEntry,
  HistoricalBronzeValidationReport,
  HistoricalBronzeValidationReportMetadata,
  HistoricalBronzeValidationReportSummary,
} from "./historicalBronzeValidationReportTypes";

const REPORT_ID_PREFIX = "historical-bronze-validation-report";

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }

  Object.freeze(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreeze(item);
    }
  } else {
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
  }

  return value;
}

function cloneIssue(
  issue: HistoricalBronzeValidationIssue,
): HistoricalBronzeValidationIssue {
  return { ...issue };
}

function buildTopIssues(
  validationResult: HistoricalBronzeValidationResult,
): HistoricalBronzeValidationIssue[] {
  return [
    ...validationResult.errors.map(cloneIssue),
    ...validationResult.warnings.map(cloneIssue),
  ];
}

function buildSummary(
  validationResult: HistoricalBronzeValidationResult,
): HistoricalBronzeValidationReportSummary {
  return {
    totalRecords: validationResult.statistics.totalRecords,
    errorCount: validationResult.errors.length,
    warningCount: validationResult.warnings.length,
    marketCount: validationResult.statistics.marketCount,
    btcBarCount: validationResult.statistics.btcBarCount,
    settlementCount: validationResult.statistics.settlementCount,
    duplicateCount: validationResult.statistics.duplicateCount,
  };
}

function compareTickerKeys(
  left: string | null,
  right: string | null,
): number {
  if (left === null && right === null) {
    return 0;
  }
  if (left === null) {
    return 1;
  }
  if (right === null) {
    return -1;
  }
  return left.localeCompare(right);
}

function buildIssuesByCode(
  topIssues: readonly HistoricalBronzeValidationIssue[],
): HistoricalBronzeValidationIssuesByCodeEntry[] {
  const grouped = new Map<
    HistoricalBronzeValidationIssue["errorCode"],
    HistoricalBronzeValidationIssue[]
  >();

  for (const issue of topIssues) {
    const bucket = grouped.get(issue.errorCode) ?? [];
    bucket.push(cloneIssue(issue));
    grouped.set(issue.errorCode, bucket);
  }

  const errorCodes = [...grouped.keys()].sort((left, right) =>
    left.localeCompare(right),
  );

  return errorCodes.map((errorCode) => ({
    errorCode,
    issues: grouped.get(errorCode)!,
  }));
}

function buildIssuesByTicker(
  topIssues: readonly HistoricalBronzeValidationIssue[],
): HistoricalBronzeValidationIssuesByTickerEntry[] {
  const grouped = new Map<string | null, HistoricalBronzeValidationIssue[]>();

  for (const issue of topIssues) {
    const bucket = grouped.get(issue.ticker) ?? [];
    bucket.push(cloneIssue(issue));
    grouped.set(issue.ticker, bucket);
  }

  const tickers = [...grouped.keys()].sort(compareTickerKeys);

  return tickers.map((ticker) => ({
    ticker,
    issues: grouped.get(ticker)!,
  }));
}

function cloneMetadata(
  metadata: HistoricalBronzeValidationReportMetadata | undefined,
): HistoricalBronzeValidationReportMetadata {
  if (metadata === undefined) {
    return deepFreeze({});
  }

  return deepFreeze({ ...metadata });
}

function buildReportId(
  validationResult: HistoricalBronzeValidationResult,
  metadata: HistoricalBronzeValidationReportMetadata,
): string {
  const digest = fnv1a32(
    stableStringify({
      valid: validationResult.valid,
      errors: validationResult.errors,
      warnings: validationResult.warnings,
      statistics: validationResult.statistics,
      metadata,
    }),
  );

  return `${REPORT_ID_PREFIX}-${digest}`;
}

/** Builds a deterministic report from a bronze validation result. */
export function buildHistoricalBronzeValidationReport(
  input: BuildHistoricalBronzeValidationReportInput,
): HistoricalBronzeValidationReport {
  const metadata = cloneMetadata(input.metadata);
  const topIssues = buildTopIssues(input.validationResult);
  const summary = buildSummary(input.validationResult);
  const issuesByCode = buildIssuesByCode(topIssues);
  const issuesByTicker = buildIssuesByTicker(topIssues);

  return deepFreeze({
    reportId: buildReportId(input.validationResult, metadata),
    valid: input.validationResult.valid,
    summary: deepFreeze({ ...summary }),
    issuesByCode: issuesByCode.map((entry) =>
      deepFreeze({
        errorCode: entry.errorCode,
        issues: deepFreeze(entry.issues.map(cloneIssue)),
      }),
    ),
    issuesByTicker: issuesByTicker.map((entry) =>
      deepFreeze({
        ticker: entry.ticker,
        issues: deepFreeze(entry.issues.map(cloneIssue)),
      }),
    ),
    topIssues: deepFreeze(topIssues.map(cloneIssue)),
    metadata,
  });
}

/** Serializes a bronze validation report to stable JSON. */
export function serializeHistoricalBronzeValidationReport(
  report: HistoricalBronzeValidationReport,
): string {
  return stableStringify(report);
}
