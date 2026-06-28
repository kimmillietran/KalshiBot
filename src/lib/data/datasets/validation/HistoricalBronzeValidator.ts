import { bronzeRecordsAreIdentical } from "@/lib/data/bronze";
import { rawHistoricalRecordSchema } from "@/lib/data/schemas";
import { SILVER_BRONZE_CONTENT_TYPE } from "@/lib/data/silver";
import { isUtcIsoTimestamp } from "@/lib/data/timestamps";
import type { RawHistoricalRecord } from "@/lib/data/types";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import { DATASET_BRONZE_CONTENT_TYPE } from "../datasetTypes";

import {
  HistoricalBronzeValidationErrorCode,
} from "./historicalBronzeValidationTypes";
import type {
  HistoricalBronzeValidationIssue,
  HistoricalBronzeValidationResult,
  HistoricalBronzeValidationSeverity,
  HistoricalBronzeValidationStatistics,
} from "./historicalBronzeValidationTypes";

type MarketGroup = {
  market: RawHistoricalRecord[];
  candles: RawHistoricalRecord[];
  btcBars: RawHistoricalRecord[];
  settlements: RawHistoricalRecord[];
  other: RawHistoricalRecord[];
};

const SUPPORTED_CONTENT_TYPES = new Set<string>([
  SILVER_BRONZE_CONTENT_TYPE.MARKET,
  SILVER_BRONZE_CONTENT_TYPE.CANDLESTICK,
  SILVER_BRONZE_CONTENT_TYPE.SETTLEMENT,
  DATASET_BRONZE_CONTENT_TYPE.BTC_KLINE,
]);

const DUPLICATE_ERROR_CODES = new Set<HistoricalBronzeValidationIssue["errorCode"]>([
  HistoricalBronzeValidationErrorCode.DUPLICATE_RECORD_ID,
  HistoricalBronzeValidationErrorCode.DUPLICATE_MARKET_WINDOW,
  HistoricalBronzeValidationErrorCode.DUPLICATE_SETTLEMENT,
  HistoricalBronzeValidationErrorCode.DUPLICATE_BTC_BAR,
]);

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(
  record: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

function readNumber(
  record: Record<string, unknown>,
  ...keys: string[]
): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return undefined;
}

function createIssue(
  errorCode: HistoricalBronzeValidationIssue["errorCode"],
  severity: HistoricalBronzeValidationSeverity,
  message: string,
  record: Partial<RawHistoricalRecord> | null,
): HistoricalBronzeValidationIssue {
  return {
    errorCode,
    severity,
    message,
    recordId: record?.recordId ?? null,
    ticker: record?.ticker ?? null,
    eventTime: record?.eventTime ?? null,
    contentType: record?.contentType ?? null,
  };
}

function compareIssues(
  left: HistoricalBronzeValidationIssue,
  right: HistoricalBronzeValidationIssue,
): number {
  const timeCompare = (left.eventTime ?? "").localeCompare(right.eventTime ?? "");
  if (timeCompare !== 0) {
    return timeCompare;
  }

  const tickerCompare = (left.ticker ?? "").localeCompare(right.ticker ?? "");
  if (tickerCompare !== 0) {
    return tickerCompare;
  }

  const recordCompare = (left.recordId ?? "").localeCompare(right.recordId ?? "");
  if (recordCompare !== 0) {
    return recordCompare;
  }

  return left.errorCode.localeCompare(right.errorCode);
}

function sortIssues(
  issues: readonly HistoricalBronzeValidationIssue[],
): readonly HistoricalBronzeValidationIssue[] {
  return Object.freeze([...issues].sort(compareIssues));
}

function createEmptyGroup(): MarketGroup {
  return {
    market: [],
    candles: [],
    btcBars: [],
    settlements: [],
    other: [],
  };
}

function classifyRecord(record: RawHistoricalRecord): keyof MarketGroup {
  switch (record.contentType) {
    case SILVER_BRONZE_CONTENT_TYPE.MARKET:
      return "market";
    case SILVER_BRONZE_CONTENT_TYPE.CANDLESTICK:
      return "candles";
    case DATASET_BRONZE_CONTENT_TYPE.BTC_KLINE:
      return "btcBars";
    case SILVER_BRONZE_CONTENT_TYPE.SETTLEMENT:
      return "settlements";
    default:
      return "other";
  }
}

function validateTemporalFields(
  record: RawHistoricalRecord,
  issues: HistoricalBronzeValidationIssue[],
): void {
  const fields: Array<keyof Pick<RawHistoricalRecord, "eventTime" | "collectionTime" | "observedAt">> =
    ["eventTime", "collectionTime", "observedAt"];

  for (const field of fields) {
    const value = record[field];
    if (typeof value !== "string" || value.trim().length === 0) {
      issues.push(
        createIssue(
          HistoricalBronzeValidationErrorCode.MISSING_TIMESTAMP,
          "error",
          `${field} is required`,
          record,
        ),
      );
      continue;
    }

    if (!isUtcIsoTimestamp(value)) {
      issues.push(
        createIssue(
          HistoricalBronzeValidationErrorCode.MISSING_TIMESTAMP,
          "error",
          `${field} must be a valid UTC ISO-8601 timestamp`,
          record,
        ),
      );
    }
  }
}

function validateTimestampOrdering(
  record: RawHistoricalRecord,
  openTime: string | undefined,
  closeTime: string | undefined,
  issues: HistoricalBronzeValidationIssue[],
): void {
  if (!openTime || !closeTime) {
    return;
  }

  if (!isUtcIsoTimestamp(openTime) || !isUtcIsoTimestamp(closeTime)) {
    return;
  }

  if (Date.parse(openTime) >= Date.parse(closeTime)) {
    issues.push(
      createIssue(
        HistoricalBronzeValidationErrorCode.INVALID_TIMESTAMP_ORDERING,
        "error",
        "openTime must be before closeTime",
        record,
      ),
    );
  }
}

function validateOhlc(
  record: RawHistoricalRecord,
  openUsd: number | undefined,
  highUsd: number | undefined,
  lowUsd: number | undefined,
  closeUsd: number | undefined,
  issues: HistoricalBronzeValidationIssue[],
): void {
  const values = [openUsd, highUsd, lowUsd, closeUsd];
  if (values.some((value) => value === undefined)) {
    return;
  }

  if (values.some((value) => value! <= 0)) {
    issues.push(
      createIssue(
        HistoricalBronzeValidationErrorCode.NEGATIVE_PRICE,
        "error",
        "BTC OHLC prices must be positive",
        record,
      ),
    );
  }

  if (highUsd! < lowUsd!) {
    issues.push(
      createIssue(
        HistoricalBronzeValidationErrorCode.INVALID_OHLC,
        "error",
        "highUsd must be greater than or equal to lowUsd",
        record,
      ),
    );
  } else {
    if (highUsd! < openUsd! || highUsd! < closeUsd!) {
      issues.push(
        createIssue(
          HistoricalBronzeValidationErrorCode.INVALID_OHLC,
          "error",
          "highUsd must be greater than or equal to openUsd and closeUsd",
          record,
        ),
      );
    }

    if (lowUsd! > openUsd! || lowUsd! > closeUsd!) {
      issues.push(
        createIssue(
          HistoricalBronzeValidationErrorCode.INVALID_OHLC,
          "error",
          "lowUsd must be less than or equal to openUsd and closeUsd",
          record,
        ),
      );
    }
  }
}

function validatePayload(
  record: RawHistoricalRecord,
  issues: HistoricalBronzeValidationIssue[],
): void {
  if (!isRecord(record.payload)) {
    issues.push(
      createIssue(
        HistoricalBronzeValidationErrorCode.MALFORMED_PAYLOAD,
        "error",
        "payload must be a JSON object",
        record,
      ),
    );
    return;
  }

  const payload = record.payload;

  switch (record.contentType) {
    case SILVER_BRONZE_CONTENT_TYPE.MARKET: {
      const openTime = readString(payload, "open_time", "openTime");
      const closeTime = readString(payload, "close_time", "closeTime");
      const floorStrike = readNumber(payload, "floor_strike", "floorStrike");
      validateTimestampOrdering(record, openTime, closeTime, issues);
      if (floorStrike !== undefined && floorStrike <= 0) {
        issues.push(
          createIssue(
            HistoricalBronzeValidationErrorCode.NEGATIVE_PRICE,
            "error",
            "floor_strike must be positive",
            record,
          ),
        );
      }
      if (!openTime || !closeTime || floorStrike === undefined) {
        issues.push(
          createIssue(
            HistoricalBronzeValidationErrorCode.MALFORMED_PAYLOAD,
            "error",
            "market payload requires open_time, close_time, and floor_strike",
            record,
          ),
        );
      }
      break;
    }
    case SILVER_BRONZE_CONTENT_TYPE.CANDLESTICK: {
      const openTime = readString(payload, "open_time", "openTime");
      const closeTime = readString(payload, "close_time", "closeTime");
      validateTimestampOrdering(record, openTime, closeTime, issues);
      const bidAskFields = [
        "yes_bid_cents",
        "yesBidCents",
        "yes_ask_cents",
        "yesAskCents",
        "no_bid_cents",
        "noBidCents",
        "no_ask_cents",
        "noAskCents",
      ];
      for (const field of bidAskFields) {
        const value = readNumber(payload, field);
        if (value !== undefined && value < 0) {
          issues.push(
            createIssue(
              HistoricalBronzeValidationErrorCode.NEGATIVE_PRICE,
              "error",
              `${field} must be non-negative`,
              record,
            ),
          );
        }
      }
      const volume = readNumber(payload, "volume_contracts", "volumeContracts");
      if (volume !== undefined && volume < 0) {
        issues.push(
          createIssue(
            HistoricalBronzeValidationErrorCode.INVALID_VOLUME,
            "error",
            "volume_contracts must be non-negative",
            record,
          ),
        );
      }
      break;
    }
    case DATASET_BRONZE_CONTENT_TYPE.BTC_KLINE: {
      const openTime = readString(payload, "open_time", "openTime");
      const closeTime = readString(payload, "close_time", "closeTime");
      validateTimestampOrdering(record, openTime, closeTime, issues);
      const openUsd = readNumber(payload, "open_usd", "openUsd");
      const highUsd = readNumber(payload, "high_usd", "highUsd");
      const lowUsd = readNumber(payload, "low_usd", "lowUsd");
      const closeUsd = readNumber(payload, "close_usd", "closeUsd");
      validateOhlc(record, openUsd, highUsd, lowUsd, closeUsd, issues);
      const volumeBtc = readNumber(payload, "volume_btc", "volumeBtc");
      if (volumeBtc !== undefined && volumeBtc < 0) {
        issues.push(
          createIssue(
            HistoricalBronzeValidationErrorCode.INVALID_VOLUME,
            "error",
            "volume_btc must be non-negative",
            record,
          ),
        );
      }
      if (!openTime || !closeTime || openUsd === undefined) {
        issues.push(
          createIssue(
            HistoricalBronzeValidationErrorCode.MALFORMED_PAYLOAD,
            "error",
            "BTC kline payload requires open_time, close_time, and OHLC prices",
            record,
          ),
        );
      }
      break;
    }
    case SILVER_BRONZE_CONTENT_TYPE.SETTLEMENT: {
      const floorStrike = readNumber(payload, "floor_strike", "floorStrike");
      if (floorStrike !== undefined && floorStrike <= 0) {
        issues.push(
          createIssue(
            HistoricalBronzeValidationErrorCode.NEGATIVE_PRICE,
            "error",
            "floor_strike must be positive",
            record,
          ),
        );
      }
      break;
    }
    default:
      break;
  }
}

function btcBarSignature(record: RawHistoricalRecord): string | null {
  if (!isRecord(record.payload)) {
    return null;
  }

  const openTime = readString(record.payload, "open_time", "openTime");
  const closeTime = readString(record.payload, "close_time", "closeTime");
  if (!openTime || !closeTime) {
    return null;
  }

  return stableStringify({
    ticker: record.ticker,
    openTime,
    closeTime,
  });
}

function validateRecordShape(
  record: unknown,
  index: number,
  issues: HistoricalBronzeValidationIssue[],
): RawHistoricalRecord | null {
  if (record === null || typeof record !== "object" || Array.isArray(record)) {
    issues.push(
      createIssue(
        HistoricalBronzeValidationErrorCode.MALFORMED_PAYLOAD,
        "error",
        `Record at index ${index} must be an object`,
        null,
      ),
    );
    return null;
  }

  const candidate = record as Partial<RawHistoricalRecord>;

  if (typeof candidate.recordId !== "string" || candidate.recordId.trim().length === 0) {
    issues.push(
      createIssue(
        HistoricalBronzeValidationErrorCode.MALFORMED_PAYLOAD,
        "error",
        `Record at index ${index} is missing recordId`,
        candidate as RawHistoricalRecord,
      ),
    );
  }

  if (typeof candidate.ticker !== "string" || candidate.ticker.trim().length === 0) {
    issues.push(
      createIssue(
        HistoricalBronzeValidationErrorCode.MISSING_TICKER,
        "error",
        "ticker is required",
        candidate as RawHistoricalRecord,
      ),
    );
  }

  if (
    typeof candidate.contentType !== "string" ||
    candidate.contentType.trim().length === 0
  ) {
    issues.push(
      createIssue(
        HistoricalBronzeValidationErrorCode.MISSING_CONTENT_TYPE,
        "error",
        "contentType is required",
        candidate as RawHistoricalRecord,
      ),
    );
    return candidate as RawHistoricalRecord;
  }

  if (!SUPPORTED_CONTENT_TYPES.has(candidate.contentType)) {
    issues.push(
      createIssue(
        HistoricalBronzeValidationErrorCode.UNSUPPORTED_CONTENT_TYPE,
        "error",
        `Unsupported bronze contentType "${candidate.contentType}"`,
        candidate as RawHistoricalRecord,
      ),
    );
  }

  const parsed = rawHistoricalRecordSchema.safeParse(candidate);
  if (!parsed.success) {
    issues.push(
      createIssue(
        HistoricalBronzeValidationErrorCode.MALFORMED_PAYLOAD,
        "error",
        parsed.error.issues[0]?.message ?? "Bronze record failed schema validation",
        candidate as RawHistoricalRecord,
      ),
    );
    return candidate as RawHistoricalRecord;
  }

  return parsed.data;
}

function validateDuplicateRecordIds(
  records: readonly RawHistoricalRecord[],
  issues: HistoricalBronzeValidationIssue[],
): void {
  const seen = new Map<string, RawHistoricalRecord>();

  for (const record of records) {
    if (typeof record.recordId !== "string" || record.recordId.trim().length === 0) {
      continue;
    }

    const existing = seen.get(record.recordId);
    if (existing !== undefined) {
      issues.push(
        createIssue(
          HistoricalBronzeValidationErrorCode.DUPLICATE_RECORD_ID,
          "error",
          `Duplicate bronze recordId "${record.recordId}"`,
          record,
        ),
      );
      if (!bronzeRecordsAreIdentical(existing, record)) {
        issues.push(
          createIssue(
            HistoricalBronzeValidationErrorCode.DUPLICATE_RECORD_ID,
            "error",
            `Conflicting duplicate bronze recordId "${record.recordId}"`,
            record,
          ),
        );
      }
      continue;
    }

    seen.set(record.recordId, record);
  }
}

function validateGroupDuplicates(
  ticker: string,
  group: MarketGroup,
  issues: HistoricalBronzeValidationIssue[],
): void {
  if (group.market.length > 1) {
    for (const record of group.market.slice(1)) {
      issues.push(
        createIssue(
          HistoricalBronzeValidationErrorCode.DUPLICATE_MARKET_WINDOW,
          "error",
          `Multiple market window bronze records for ticker "${ticker}"`,
          record,
        ),
      );
    }
  }

  if (group.settlements.length > 1) {
    for (const record of group.settlements.slice(1)) {
      issues.push(
        createIssue(
          HistoricalBronzeValidationErrorCode.DUPLICATE_SETTLEMENT,
          "error",
          `Multiple settlement bronze records for ticker "${ticker}"`,
          record,
        ),
      );
    }
  }

  const seenBtc = new Map<string, RawHistoricalRecord>();
  for (const record of group.btcBars) {
    const signature = btcBarSignature(record);
    if (signature === null) {
      continue;
    }

    const existing = seenBtc.get(signature);
    if (existing !== undefined) {
      issues.push(
        createIssue(
          HistoricalBronzeValidationErrorCode.DUPLICATE_BTC_BAR,
          "error",
          `Duplicate BTC bar for ticker "${ticker}"`,
          record,
        ),
      );
      continue;
    }

    seenBtc.set(signature, record);
  }
}

function validateGroupCompleteness(
  ticker: string,
  group: MarketGroup,
  issues: HistoricalBronzeValidationIssue[],
): void {
  const hasMarket = group.market.length > 0;
  const hasCandles = group.candles.length > 0;
  const hasBtc = group.btcBars.length > 0;
  const hasSettlement = group.settlements.length > 0;
  const hasAnyKalshi =
    hasMarket || hasCandles || hasSettlement || group.other.length > 0;

  if (!hasMarket && hasSettlement) {
    for (const record of group.settlements) {
      issues.push(
        createIssue(
          HistoricalBronzeValidationErrorCode.ORPHAN_SETTLEMENT,
          "error",
          `Settlement record has no market window for ticker "${ticker}"`,
          record,
        ),
      );
    }
  }

  if (!hasMarket && hasBtc) {
    for (const record of group.btcBars) {
      issues.push(
        createIssue(
          HistoricalBronzeValidationErrorCode.ORPHAN_BTC_HISTORY,
          "error",
          `BTC bar record has no market window for ticker "${ticker}"`,
          record,
        ),
      );
    }
  }

  if (hasAnyKalshi || hasBtc) {
    const complete = hasMarket && hasCandles && hasBtc;
    if (!complete) {
      const anchor =
        group.market[0] ??
        group.candles[0] ??
        group.btcBars[0] ??
        group.settlements[0] ??
        null;
      issues.push(
        createIssue(
          HistoricalBronzeValidationErrorCode.INCOMPLETE_MARKET_GROUP,
          "error",
          `Bronze records for ticker "${ticker}" do not form a complete snapshot group`,
          anchor,
        ),
      );
    }
  }
}

function buildStatistics(
  records: readonly RawHistoricalRecord[],
  issues: readonly HistoricalBronzeValidationIssue[],
): HistoricalBronzeValidationStatistics {
  let marketCount = 0;
  let btcBarCount = 0;
  let settlementCount = 0;

  for (const record of records) {
    switch (record.contentType) {
      case SILVER_BRONZE_CONTENT_TYPE.MARKET:
        marketCount += 1;
        break;
      case DATASET_BRONZE_CONTENT_TYPE.BTC_KLINE:
        btcBarCount += 1;
        break;
      case SILVER_BRONZE_CONTENT_TYPE.SETTLEMENT:
        settlementCount += 1;
        break;
      default:
        break;
    }
  }

  const duplicateCount = issues.filter((issue) =>
    DUPLICATE_ERROR_CODES.has(issue.errorCode),
  ).length;

  return {
    totalRecords: records.length,
    marketCount,
    btcBarCount,
    settlementCount,
    duplicateCount,
  };
}

/** Validates bronze historical records before dataset assembly. */
export function validateHistoricalBronzeDataset(
  records: readonly RawHistoricalRecord[],
): HistoricalBronzeValidationResult {
  const errors: HistoricalBronzeValidationIssue[] = [];
  const warnings: HistoricalBronzeValidationIssue[] = [];

  if (records.length === 0) {
    errors.push(
      createIssue(
        HistoricalBronzeValidationErrorCode.EMPTY_DATASET,
        "error",
        "Historical bronze dataset requires at least one record",
        null,
      ),
    );

    return deepFreeze({
      valid: false,
      errors: sortIssues(errors),
      warnings: sortIssues(warnings),
      statistics: deepFreeze({
        totalRecords: 0,
        marketCount: 0,
        btcBarCount: 0,
        settlementCount: 0,
        duplicateCount: 0,
      }),
    });
  }

  const parsedRecords: RawHistoricalRecord[] = [];

  records.forEach((record, index) => {
    const parsed = validateRecordShape(record, index, errors);
    if (parsed === null) {
      return;
    }

    parsedRecords.push(parsed);
    validateTemporalFields(parsed, errors);
    validatePayload(parsed, errors);
  });

  validateDuplicateRecordIds(parsedRecords, errors);

  const groups = new Map<string, MarketGroup>();
  for (const record of parsedRecords) {
    if (typeof record.ticker !== "string" || record.ticker.trim().length === 0) {
      continue;
    }

    const group = groups.get(record.ticker) ?? createEmptyGroup();
    const bucket = classifyRecord(record);
    group[bucket].push(record);
    groups.set(record.ticker, group);
  }

  const tickers = [...groups.keys()].sort((left, right) => left.localeCompare(right));
  for (const ticker of tickers) {
    const group = groups.get(ticker)!;
    validateGroupDuplicates(ticker, group, errors);
    validateGroupCompleteness(ticker, group, errors);
  }

  const sortedErrors = sortIssues(errors);
  const sortedWarnings = sortIssues(warnings);
  const statistics = deepFreeze(buildStatistics(parsedRecords, sortedErrors));

  return deepFreeze({
    valid: sortedErrors.length === 0,
    errors: sortedErrors,
    warnings: sortedWarnings,
    statistics,
  });
}

/** Deterministic JSON-like serialization for bronze validation results. */
export function serializeHistoricalBronzeValidation(
  result: HistoricalBronzeValidationResult,
): string {
  return stableStringify(result);
}
