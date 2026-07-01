import {
  BatchResearchRunnerError,
  BatchResearchRunnerErrorCode,
  type ResearchDatasetRegistryMarketEntry,
  type ResearchDatasetSeriesRegistryDocument,
} from "./batchResearchTypes";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseMarketEntry(
  value: unknown,
  registryPath: string,
): ResearchDatasetRegistryMarketEntry {
  if (!isRecord(value)) {
    throw new BatchResearchRunnerError(
      "Registry market entry must be a plain object",
      BatchResearchRunnerErrorCode.INVALID_REGISTRY,
      { registryPath },
    );
  }

  if (!isNonEmptyString(value.seriesTicker) || !isNonEmptyString(value.marketTicker)) {
    throw new BatchResearchRunnerError(
      "Registry market entry requires seriesTicker and marketTicker",
      BatchResearchRunnerErrorCode.INVALID_REGISTRY,
      { registryPath, marketTicker: typeof value.marketTicker === "string" ? value.marketTicker : undefined },
    );
  }

  if (!isNonEmptyString(value.fixturePath)) {
    throw new BatchResearchRunnerError(
      "Registry market entry requires fixturePath",
      BatchResearchRunnerErrorCode.INVALID_REGISTRY,
      { registryPath, marketTicker: value.marketTicker },
    );
  }

  const validationStatus =
    isRecord(value.validationStatus)
    && typeof value.validationStatus.valid === "boolean"
      ? { valid: value.validationStatus.valid }
      : undefined;

  return {
    seriesTicker: value.seriesTicker.trim(),
    marketTicker: value.marketTicker.trim(),
    fixturePath: value.fixturePath.trim(),
    validationStatus,
  };
}

/** Parses a per-series dataset-registry.json document. */
export function parseResearchDatasetSeriesRegistryJson(
  json: string,
  registryPath: string,
): ResearchDatasetSeriesRegistryDocument {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    throw new BatchResearchRunnerError(
      "dataset-registry.json contains invalid JSON",
      BatchResearchRunnerErrorCode.INVALID_REGISTRY,
      { registryPath },
    );
  }

  if (!isRecord(parsed) || !isNonEmptyString(parsed.seriesTicker)) {
    throw new BatchResearchRunnerError(
      "dataset-registry.json requires seriesTicker",
      BatchResearchRunnerErrorCode.INVALID_REGISTRY,
      { registryPath },
    );
  }

  if (!Array.isArray(parsed.markets)) {
    throw new BatchResearchRunnerError(
      "dataset-registry.json requires markets array",
      BatchResearchRunnerErrorCode.INVALID_REGISTRY,
      { registryPath },
    );
  }

  return {
    seriesTicker: parsed.seriesTicker.trim(),
    markets: parsed.markets.map((entry) => parseMarketEntry(entry, registryPath)),
  };
}
