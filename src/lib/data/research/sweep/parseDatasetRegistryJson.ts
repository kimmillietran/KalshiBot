import {
  StrategySweepError,
  StrategySweepErrorCode,
  type StrategySweepMarketEntry,
} from "./strategySweepTypes";

export type StrategySweepSeriesRegistryDocument = {
  seriesTicker: string;
  markets: readonly StrategySweepMarketEntry[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseMarketEntry(
  value: unknown,
  registryPath: string,
): StrategySweepMarketEntry {
  if (!isRecord(value)) {
    throw new StrategySweepError(
      "Registry market entry must be a plain object",
      StrategySweepErrorCode.INVALID_REGISTRY,
    );
  }

  if (!isNonEmptyString(value.seriesTicker) || !isNonEmptyString(value.marketTicker)) {
    throw new StrategySweepError(
      "Registry market entry requires seriesTicker and marketTicker",
      StrategySweepErrorCode.INVALID_REGISTRY,
      {
        marketTicker:
          typeof value.marketTicker === "string" ? value.marketTicker : undefined,
      },
    );
  }

  if (!isNonEmptyString(value.fixturePath)) {
    throw new StrategySweepError(
      "Registry market entry requires fixturePath",
      StrategySweepErrorCode.INVALID_REGISTRY,
      { marketTicker: value.marketTicker },
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
    registryPath,
    validationStatus,
  };
}

/** Parses a per-series dataset-registry.json document for strategy sweeps. */
export function parseStrategySweepSeriesRegistryJson(
  json: string,
  registryPath: string,
): StrategySweepSeriesRegistryDocument {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    throw new StrategySweepError(
      "dataset-registry.json contains invalid JSON",
      StrategySweepErrorCode.INVALID_REGISTRY,
    );
  }

  if (!isRecord(parsed) || !isNonEmptyString(parsed.seriesTicker)) {
    throw new StrategySweepError(
      "dataset-registry.json requires seriesTicker",
      StrategySweepErrorCode.INVALID_REGISTRY,
    );
  }

  if (!Array.isArray(parsed.markets)) {
    throw new StrategySweepError(
      "dataset-registry.json requires markets array",
      StrategySweepErrorCode.INVALID_REGISTRY,
    );
  }

  return {
    seriesTicker: parsed.seriesTicker.trim(),
    markets: parsed.markets.map((entry) => parseMarketEntry(entry, registryPath)),
  };
}
