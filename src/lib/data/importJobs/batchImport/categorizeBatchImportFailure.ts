import {
  BATCH_IMPORT_FAILURE_CATEGORY,
  type BatchImportFailureCategory,
} from "./batchImportFailureAnalysisTypes";

function normalizeMessage(message: string | null | undefined): string {
  return (message ?? "").trim().toLowerCase();
}

function matchesAny(haystack: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => haystack.includes(pattern));
}

/** Maps a failed import message to a deterministic failure category. */
export function categorizeBatchImportFailure(
  errorMessage: string | null,
): BatchImportFailureCategory {
  const message = normalizeMessage(errorMessage);
  if (!message) {
    return BATCH_IMPORT_FAILURE_CATEGORY.UNKNOWN;
  }

  if (
    matchesAny(message, [
      "rate limit",
      "rate-limited",
      "too many requests",
      "429",
      "retry-after",
    ])
  ) {
    return BATCH_IMPORT_FAILURE_CATEGORY.RATE_LIMITED;
  }

  if (
    matchesAny(message, [
      "econnreset",
      "etimedout",
      "enotfound",
      "network",
      "socket",
      "fetch failed",
      "connection reset",
      "timed out",
      "timeout",
    ])
  ) {
    return BATCH_IMPORT_FAILURE_CATEGORY.NETWORK_FAILURE;
  }

  if (
    matchesAny(message, [
      "503",
      "502",
      "504",
      "unavailable",
      "service unavailable",
      "upstream",
      "provider unavailable",
    ])
  ) {
    return BATCH_IMPORT_FAILURE_CATEGORY.PROVIDER_UNAVAILABLE;
  }

  if (
    matchesAny(message, [
      "404",
      "not found",
      "market not found",
      "unknown market",
    ])
  ) {
    return BATCH_IMPORT_FAILURE_CATEGORY.MARKET_NOT_FOUND;
  }

  if (
    matchesAny(message, [
      "no historical",
      "no candle",
      "no candles",
      "empty dataset",
      "empty-dataset",
      "no data",
      "no records",
      "no bronze",
    ])
  ) {
    return BATCH_IMPORT_FAILURE_CATEGORY.NO_HISTORICAL_DATA;
  }

  if (
    matchesAny(message, [
      "malformed",
      "invalid response",
      "invalid json",
      "invalid ohlc",
      "invalid payload",
      "parse",
      "unexpected token",
    ])
  ) {
    return BATCH_IMPORT_FAILURE_CATEGORY.MALFORMED_RESPONSE;
  }

  if (
    matchesAny(message, [
      "unsupported",
      "not supported",
      "invalid market",
      "invalid ticker",
    ])
  ) {
    return BATCH_IMPORT_FAILURE_CATEGORY.UNSUPPORTED_MARKET;
  }

  if (
    matchesAny(message, [
      "invalid config",
      "jobid is required",
      "job id is required",
      "marketticker is required",
      "market ticker is required",
      "invalid timestamp",
      "invalid time range",
      "invalid input",
      "invalid metadata",
      "invalid provider",
      "invalid interval",
      "invalid output",
      "invalid symbol",
      "failed to read config",
      "input file contains invalid json",
    ])
  ) {
    return BATCH_IMPORT_FAILURE_CATEGORY.INVALID_METADATA;
  }

  return BATCH_IMPORT_FAILURE_CATEGORY.UNKNOWN;
}
