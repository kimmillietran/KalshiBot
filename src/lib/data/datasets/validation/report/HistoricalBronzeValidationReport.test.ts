import { describe, expect, it } from "vitest";

import { DataSource } from "@/lib/data/provenance";
import { SILVER_BRONZE_CONTENT_TYPE } from "@/lib/data/silver";
import type { RawHistoricalRecord } from "@/lib/data/types";

import { DATASET_BRONZE_CONTENT_TYPE } from "../../datasetTypes";
import {
  HistoricalBronzeValidationErrorCode,
} from "../historicalBronzeValidationTypes";
import type { HistoricalBronzeValidationResult } from "../historicalBronzeValidationTypes";
import { validateHistoricalBronzeDataset } from "../HistoricalBronzeValidator";
import {
  buildHistoricalBronzeValidationReport,
  serializeHistoricalBronzeValidationReport,
} from "./HistoricalBronzeValidationReport";

const COLLECTION_TIME = "2026-06-27T01:00:00.000Z";
const OBSERVED_AT = "2026-06-27T01:00:05.000Z";

function baseBronze(
  contentType: string,
  payload: Record<string, unknown>,
  options: {
    recordId: string;
    ticker: string;
    eventTime: string;
    source?: (typeof DataSource)[keyof typeof DataSource];
  },
): RawHistoricalRecord {
  return {
    recordId: options.recordId,
    ticker: options.ticker,
    contentType,
    eventTime: options.eventTime,
    collectionTime: COLLECTION_TIME,
    observedAt: OBSERVED_AT,
    payload,
    provenance: {
      source: options.source ?? DataSource.KALSHI_REST,
      collectionTime: COLLECTION_TIME,
      observedAt: OBSERVED_AT,
      fetchId: `fetch-${options.recordId}`,
    },
  };
}

function marketBronze(
  ticker: string,
  recordId: string,
  eventTime: string,
  windowClose: string,
): RawHistoricalRecord {
  return baseBronze(
    SILVER_BRONZE_CONTENT_TYPE.MARKET,
    {
      open_time: eventTime,
      close_time: windowClose,
      floor_strike: 59_990.31,
      event_ticker: `${ticker.split("-")[0]}-EVENT`,
      status: "closed",
    },
    { recordId, ticker, eventTime },
  );
}

function candleBronze(
  ticker: string,
  recordId: string,
  openTime: string,
  closeTime: string,
): RawHistoricalRecord {
  return baseBronze(
    SILVER_BRONZE_CONTENT_TYPE.CANDLESTICK,
    {
      open_time: openTime,
      close_time: closeTime,
      yes_bid_cents: 48,
      yes_ask_cents: 52,
      no_bid_cents: 47,
      no_ask_cents: 51,
      volume_contracts: 120,
    },
    {
      recordId,
      ticker,
      eventTime: closeTime,
      source: DataSource.KALSHI_CANDLES,
    },
  );
}

function btcBronze(
  ticker: string,
  recordId: string,
  openTime: string,
  closeTime: string,
): RawHistoricalRecord {
  return baseBronze(
    DATASET_BRONZE_CONTENT_TYPE.BTC_KLINE,
    {
      open_time: openTime,
      close_time: closeTime,
      open_usd: 59_980.5,
      high_usd: 60_010.25,
      low_usd: 59_960.0,
      close_usd: 59_995.75,
      volume_btc: 12.5,
    },
    {
      recordId,
      ticker,
      eventTime: closeTime,
      source: DataSource.BINANCE_SPOT,
    },
  );
}

function settlementBronze(
  ticker: string,
  recordId: string,
  eventTime: string,
  windowClose: string,
): RawHistoricalRecord {
  return baseBronze(
    SILVER_BRONZE_CONTENT_TYPE.SETTLEMENT,
    {
      floor_strike: 59_990.31,
      expiration_value: "60010.25",
      result: "yes",
      settlement_ts: windowClose,
    },
    { recordId, ticker, eventTime },
  );
}

function completeMarketRecords(
  ticker: string,
  eventTime: string,
  windowClose: string,
  idPrefix: string,
): RawHistoricalRecord[] {
  const openTime = eventTime;
  const closeTime = new Date(Date.parse(eventTime) + 60_000).toISOString();

  return [
    marketBronze(ticker, `${idPrefix}-market`, eventTime, windowClose),
    candleBronze(ticker, `${idPrefix}-candle`, openTime, closeTime),
    btcBronze(ticker, `${idPrefix}-btc`, openTime, closeTime),
    settlementBronze(ticker, `${idPrefix}-settlement`, eventTime, windowClose),
  ];
}

function snapshotValidationResult(
  result: HistoricalBronzeValidationResult,
): string {
  return JSON.stringify({
    valid: result.valid,
    errors: result.errors,
    warnings: result.warnings,
    statistics: result.statistics,
  });
}

describe("buildHistoricalBronzeValidationReport", () => {
  it("builds a report for a valid validation result", () => {
    const records = completeMarketRecords(
      "KXBTC15M-VALID",
      "2026-06-26T23:15:00.000Z",
      "2026-06-26T23:30:00.000Z",
      "valid",
    );
    const validationResult = validateHistoricalBronzeDataset(records);

    const report = buildHistoricalBronzeValidationReport({ validationResult });

    expect(report.valid).toBe(true);
    expect(report.summary).toEqual({
      totalRecords: 4,
      errorCount: 0,
      warningCount: 0,
      marketCount: 1,
      btcBarCount: 1,
      settlementCount: 1,
      duplicateCount: 0,
    });
    expect(report.topIssues).toHaveLength(0);
    expect(report.issuesByCode).toHaveLength(0);
    expect(report.issuesByTicker).toHaveLength(0);
    expect(report.metadata).toEqual({});
  });

  it("builds a report for an invalid validation result", () => {
    const records = completeMarketRecords(
      "KXBTC15M-INVALID",
      "2026-06-26T23:15:00.000Z",
      "2026-06-26T23:30:00.000Z",
      "invalid",
    );
    records.push({ ...records[1]!, recordId: records[1]!.recordId });

    const validationResult = validateHistoricalBronzeDataset(records);
    const report = buildHistoricalBronzeValidationReport({ validationResult });

    expect(report.valid).toBe(false);
    expect(report.summary.errorCount).toBeGreaterThan(0);
    expect(report.topIssues.length).toBeGreaterThan(0);
  });

  it("groups issues by error code in sorted order", () => {
    const validationResult: HistoricalBronzeValidationResult = {
      valid: false,
      errors: [
        {
          errorCode: HistoricalBronzeValidationErrorCode.MISSING_TICKER,
          severity: "error",
          message: "missing ticker",
          recordId: "rec-b",
          ticker: null,
          eventTime: "2026-06-26T23:15:00.000Z",
          contentType: SILVER_BRONZE_CONTENT_TYPE.MARKET,
        },
        {
          errorCode: HistoricalBronzeValidationErrorCode.DUPLICATE_RECORD_ID,
          severity: "error",
          message: "duplicate id",
          recordId: "rec-a",
          ticker: "KXBTC15M-A",
          eventTime: "2026-06-26T23:16:00.000Z",
          contentType: SILVER_BRONZE_CONTENT_TYPE.CANDLESTICK,
        },
      ],
      warnings: [],
      statistics: {
        totalRecords: 2,
        marketCount: 1,
        btcBarCount: 0,
        settlementCount: 0,
        duplicateCount: 1,
      },
    };

    const report = buildHistoricalBronzeValidationReport({ validationResult });

    expect(report.issuesByCode.map((entry) => entry.errorCode)).toEqual([
      HistoricalBronzeValidationErrorCode.DUPLICATE_RECORD_ID,
      HistoricalBronzeValidationErrorCode.MISSING_TICKER,
    ]);
    expect(report.issuesByCode[0]!.issues).toHaveLength(1);
    expect(report.issuesByCode[1]!.issues).toHaveLength(1);
  });

  it("groups issues by ticker in sorted order", () => {
    const validationResult: HistoricalBronzeValidationResult = {
      valid: false,
      errors: [
        {
          errorCode: HistoricalBronzeValidationErrorCode.ORPHAN_SETTLEMENT,
          severity: "error",
          message: "orphan settlement z",
          recordId: "rec-z",
          ticker: "KXBTC15M-Z",
          eventTime: "2026-06-26T23:15:00.000Z",
          contentType: SILVER_BRONZE_CONTENT_TYPE.SETTLEMENT,
        },
        {
          errorCode: HistoricalBronzeValidationErrorCode.ORPHAN_SETTLEMENT,
          severity: "error",
          message: "orphan settlement a",
          recordId: "rec-a",
          ticker: "KXBTC15M-A",
          eventTime: "2026-06-26T23:16:00.000Z",
          contentType: SILVER_BRONZE_CONTENT_TYPE.SETTLEMENT,
        },
        {
          errorCode: HistoricalBronzeValidationErrorCode.MISSING_TICKER,
          severity: "error",
          message: "missing ticker",
          recordId: "rec-null",
          ticker: null,
          eventTime: "2026-06-26T23:17:00.000Z",
          contentType: SILVER_BRONZE_CONTENT_TYPE.MARKET,
        },
      ],
      warnings: [],
      statistics: {
        totalRecords: 3,
        marketCount: 0,
        btcBarCount: 0,
        settlementCount: 2,
        duplicateCount: 0,
      },
    };

    const report = buildHistoricalBronzeValidationReport({ validationResult });

    expect(report.issuesByTicker.map((entry) => entry.ticker)).toEqual([
      "KXBTC15M-A",
      "KXBTC15M-Z",
      null,
    ]);
    expect(report.issuesByTicker[0]!.issues).toHaveLength(1);
    expect(report.issuesByTicker[2]!.issues).toHaveLength(1);
  });

  it("preserves validator issue ordering in topIssues", () => {
    const validationResult: HistoricalBronzeValidationResult = {
      valid: false,
      errors: [
        {
          errorCode: HistoricalBronzeValidationErrorCode.EMPTY_DATASET,
          severity: "error",
          message: "error first",
          recordId: null,
          ticker: null,
          eventTime: null,
          contentType: null,
        },
      ],
      warnings: [
        {
          errorCode: HistoricalBronzeValidationErrorCode.MALFORMED_PAYLOAD,
          severity: "warning",
          message: "warning second",
          recordId: "warn-1",
          ticker: "KXBTC15M-W",
          eventTime: "2026-06-26T23:15:00.000Z",
          contentType: SILVER_BRONZE_CONTENT_TYPE.MARKET,
        },
      ],
      statistics: {
        totalRecords: 0,
        marketCount: 0,
        btcBarCount: 0,
        settlementCount: 0,
        duplicateCount: 0,
      },
    };

    const report = buildHistoricalBronzeValidationReport({ validationResult });

    expect(report.topIssues.map((issue) => issue.message)).toEqual([
      "error first",
      "warning second",
    ]);
  });

  it("derives a deterministic reportId from validation result and metadata", () => {
    const records = completeMarketRecords(
      "KXBTC15M-REPORT-ID",
      "2026-06-26T23:15:00.000Z",
      "2026-06-26T23:30:00.000Z",
      "report-id",
    );
    const validationResult = validateHistoricalBronzeDataset(records);
    const metadata = { datasetLabel: "fixture-a" };

    const first = buildHistoricalBronzeValidationReport({
      validationResult,
      metadata,
    });
    const second = buildHistoricalBronzeValidationReport({
      validationResult,
      metadata,
    });
    const differentMetadata = buildHistoricalBronzeValidationReport({
      validationResult,
      metadata: { datasetLabel: "fixture-b" },
    });

    expect(first.reportId).toBe(second.reportId);
    expect(first.reportId).toMatch(/^historical-bronze-validation-report-/);
    expect(differentMetadata.reportId).not.toBe(first.reportId);
  });

  it("serializes reports deterministically", () => {
    const validationResult = validateHistoricalBronzeDataset([]);
    const report = buildHistoricalBronzeValidationReport({
      validationResult,
      metadata: { source: "unit-test" },
    });

    expect(serializeHistoricalBronzeValidationReport(report)).toBe(
      serializeHistoricalBronzeValidationReport(report),
    );
  });

  it("returns deeply frozen output", () => {
    const validationResult = validateHistoricalBronzeDataset([]);
    const metadata = { label: "frozen" };
    const report = buildHistoricalBronzeValidationReport({
      validationResult,
      metadata,
    });

    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.summary)).toBe(true);
    expect(Object.isFrozen(report.topIssues)).toBe(true);
    expect(Object.isFrozen(report.metadata)).toBe(true);

    expect(() => {
      (report as { valid: boolean }).valid = false;
    }).toThrow();
  });

  it("does not mutate the validation result", () => {
    const records = completeMarketRecords(
      "KXBTC15M-IMMUTABLE",
      "2026-06-26T23:15:00.000Z",
      "2026-06-26T23:30:00.000Z",
      "immutable",
    );
    const validationResult = validateHistoricalBronzeDataset(records);
    const before = snapshotValidationResult(validationResult);

    buildHistoricalBronzeValidationReport({
      validationResult,
      metadata: { run: "immutable-check" },
    });

    expect(snapshotValidationResult(validationResult)).toBe(before);
  });

  it("passes caller metadata through unchanged", () => {
    const validationResult = validateHistoricalBronzeDataset([]);
    const metadata = {
      datasetId: "ds-001",
      requestedBy: "builder-2",
      tags: ["bronze", "validation"],
    };

    const report = buildHistoricalBronzeValidationReport({
      validationResult,
      metadata,
    });

    expect(report.metadata).toEqual(metadata);
  });

  it("handles an empty issue list", () => {
    const records = completeMarketRecords(
      "KXBTC15M-EMPTY-ISSUES",
      "2026-06-26T23:15:00.000Z",
      "2026-06-26T23:30:00.000Z",
      "empty-issues",
    );
    const validationResult = validateHistoricalBronzeDataset(records);
    const report = buildHistoricalBronzeValidationReport({ validationResult });

    expect(report.topIssues).toEqual([]);
    expect(report.issuesByCode).toEqual([]);
    expect(report.issuesByTicker).toEqual([]);
    expect(report.summary.errorCount).toBe(0);
    expect(report.summary.warningCount).toBe(0);
  });
});
