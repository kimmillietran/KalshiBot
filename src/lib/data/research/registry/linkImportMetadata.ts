import type { LinkedImportMetadataSummary } from "./researchDatasetRegistryTypes";
import {
  ResearchDatasetRegistryError,
  ResearchDatasetRegistryErrorCode,
} from "./researchDatasetRegistryTypes";

function assertPlainObject(
  value: unknown,
  label: string,
  marketTicker?: string,
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ResearchDatasetRegistryError(
      `${label} must be a plain object`,
      ResearchDatasetRegistryErrorCode.INVALID_METADATA,
      marketTicker,
    );
  }
}

/** Parses optional import metadata when present; missing metadata returns null. */
export function parseLinkedImportMetadataJson(
  json: string | undefined,
  marketTicker: string,
): LinkedImportMetadataSummary | null {
  if (json === undefined) {
    return null;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    throw new ResearchDatasetRegistryError(
      "metadata.json contains invalid JSON",
      ResearchDatasetRegistryErrorCode.INVALID_METADATA,
      marketTicker,
    );
  }

  assertPlainObject(parsed, "metadata.json", marketTicker);

  if (typeof parsed.marketTicker === "string" && parsed.marketTicker !== marketTicker) {
    throw new ResearchDatasetRegistryError(
      "metadata.json marketTicker does not match fixture directory",
      ResearchDatasetRegistryErrorCode.INVALID_METADATA,
      marketTicker,
    );
  }

  const importTimestamp =
    typeof parsed.importTimestamp === "string" && parsed.importTimestamp.trim()
      ? parsed.importTimestamp.trim()
      : null;

  const bronzeRecordCount =
    typeof parsed.bronzeRecordCount === "number" && Number.isFinite(parsed.bronzeRecordCount)
      ? parsed.bronzeRecordCount
      : null;

  const settlementPresent =
    typeof parsed.settlementPresent === "boolean" ? parsed.settlementPresent : null;

  return {
    importTimestamp,
    bronzeRecordCount,
    settlementPresent,
  };
}
