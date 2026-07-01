import type { HistoricalBronzeImportJobCoreResult } from "@/lib/data/importJobs/historicalBronzeImportJobTypes";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Parses a serialized historical bronze import result JSON document. */
export function parseHistoricalBronzeImportResultJson(
  json: string,
): HistoricalBronzeImportJobCoreResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Input file contains invalid JSON");
  }

  if (!isRecord(parsed)) {
    throw new Error("Import result must be a plain object");
  }

  if (!isNonEmptyString(parsed.jobId)) {
    throw new Error("Import result jobId is required");
  }

  if (!Array.isArray(parsed.bronzeRecords)) {
    throw new Error("Import result bronzeRecords must be an array");
  }

  if (
    !isRecord(parsed.validationResult)
    || typeof parsed.validationResult.valid !== "boolean"
    || !Array.isArray(parsed.validationResult.errors)
    || !Array.isArray(parsed.validationResult.warnings)
    || !isRecord(parsed.validationResult.statistics)
  ) {
    throw new Error("Import result validationResult is invalid");
  }

  if (!isRecord(parsed.metadata) || !isNonEmptyString(parsed.metadata.marketTicker)) {
    throw new Error("Import result metadata is invalid");
  }

  return parsed as HistoricalBronzeImportJobCoreResult;
}
