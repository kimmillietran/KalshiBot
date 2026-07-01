import { buildHistoricalBronzeImportConfig } from "@/lib/data/importJobs/config";
import type { BuildHistoricalBronzeImportConfigInput } from "@/lib/data/importJobs/config";
import type { HistoricalBronzeImportJobCoreResult } from "@/lib/data/importJobs/historicalBronzeImportJobTypes";

import {
  DatasetRegistryError,
  DatasetRegistryErrorCode,
} from "./importedMarketDatasetTypes";

function assertPlainObject(
  value: unknown,
  label: string,
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new DatasetRegistryError(
      `${label} must be a plain object`,
      DatasetRegistryErrorCode.BROKEN_DIRECTORY_STRUCTURE,
    );
  }
}

/** Parses a historical import config JSON document. */
export function parseImportedMarketConfigJson(
  json: string,
): ReturnType<typeof buildHistoricalBronzeImportConfig> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    throw new DatasetRegistryError(
      "config.json contains invalid JSON",
      DatasetRegistryErrorCode.BROKEN_DIRECTORY_STRUCTURE,
    );
  }

  try {
    return buildHistoricalBronzeImportConfig(
      parsed as BuildHistoricalBronzeImportConfigInput,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid config.json";
    throw new DatasetRegistryError(
      message,
      DatasetRegistryErrorCode.BROKEN_DIRECTORY_STRUCTURE,
    );
  }
}

/** Parses a historical bronze import result JSON document. */
export function parseImportedMarketResultJson(
  json: string,
): HistoricalBronzeImportJobCoreResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    throw new DatasetRegistryError(
      "import-result.json contains invalid JSON",
      DatasetRegistryErrorCode.BROKEN_DIRECTORY_STRUCTURE,
    );
  }

  assertPlainObject(parsed, "import-result.json");

  if (typeof parsed.jobId !== "string" || !parsed.jobId.trim()) {
    throw new DatasetRegistryError(
      "import-result.json jobId is required",
      DatasetRegistryErrorCode.BROKEN_DIRECTORY_STRUCTURE,
    );
  }

  if (!Array.isArray(parsed.bronzeRecords)) {
    throw new DatasetRegistryError(
      "import-result.json bronzeRecords must be an array",
      DatasetRegistryErrorCode.BROKEN_DIRECTORY_STRUCTURE,
    );
  }

  assertPlainObject(parsed.metadata, "import-result.json metadata");
  assertPlainObject(parsed.validationResult, "import-result.json validationResult");

  return parsed as HistoricalBronzeImportJobCoreResult;
}
