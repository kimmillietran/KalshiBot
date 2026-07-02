import { stableStringify } from "@/lib/trading/config/hashConfig";
import { ENGINE_VERSION } from "@/lib/trading/versioning";

import {
  ExperimentRegistryError,
  ExperimentRegistryErrorCode,
  type ParsedExperimentResearchDocument,
} from "./experimentRegistryTypes";
import { hashDatasetContent } from "./hashExperimentIdentity";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonValue(value: unknown, label: string, marketTicker?: string): unknown {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      throw new ExperimentRegistryError(
        `${label} contains invalid JSON`,
        ExperimentRegistryErrorCode.INVALID_METADATA,
        { marketTicker },
      );
    }
  }

  return value;
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function extractEngineVersion(backtestResult: Record<string, unknown>): string | null {
  const replayResult = parseJsonValue(backtestResult.replayResult, "replayResult");
  if (!isRecord(replayResult) || !Array.isArray(replayResult.results)) {
    return null;
  }

  for (const step of replayResult.results) {
    if (!isRecord(step) || !isRecord(step.engineOutput)) {
      continue;
    }

    const engineVersion = readString(step.engineOutput, "engineVersion");
    if (engineVersion) {
      return engineVersion;
    }
  }

  return null;
}

function extractCostModelConfig(fillConfig: Record<string, unknown>): unknown {
  if ("executionCostModel" in fillConfig && fillConfig.executionCostModel !== undefined) {
    return fillConfig.executionCostModel;
  }

  return {
    feeCentsPerContract:
      typeof fillConfig.feeCentsPerContract === "number"
        ? fillConfig.feeCentsPerContract
        : 0,
    priceSource: fillConfig.priceSource ?? "engine-input-pricing",
    allowPartialFills: fillConfig.allowPartialFills ?? false,
  };
}

/** Parses runner-format research output into experiment registry inputs. */
export function parseExperimentResearchDocument(
  json: string,
  outputPath: string,
  pathContext?: {
    strategyId?: string;
    seriesTicker?: string;
    marketTicker?: string;
  },
): ParsedExperimentResearchDocument {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    throw new ExperimentRegistryError(
      "research-output.json contains invalid JSON",
      ExperimentRegistryErrorCode.INVALID_METADATA,
      { marketTicker: pathContext?.marketTicker },
    );
  }

  if (!isRecord(parsed) || !("dataset" in parsed) || !("researchRun" in parsed)) {
    throw new ExperimentRegistryError(
      "research-output.json must use runner format with dataset and researchRun",
      ExperimentRegistryErrorCode.INVALID_METADATA,
      { marketTicker: pathContext?.marketTicker },
    );
  }

  const metadata = parsed.metadata;
  if (!isRecord(metadata)) {
    throw new ExperimentRegistryError(
      "research-output.json metadata must be a plain object",
      ExperimentRegistryErrorCode.INVALID_METADATA,
      { marketTicker: pathContext?.marketTicker },
    );
  }

  const researchRun = parseJsonValue(
    parsed.researchRun,
    "researchRun",
    pathContext?.marketTicker,
  );
  if (!isRecord(researchRun) || !isRecord(researchRun.config)) {
    throw new ExperimentRegistryError(
      "researchRun.config must be a plain object",
      ExperimentRegistryErrorCode.INVALID_METADATA,
      { marketTicker: pathContext?.marketTicker },
    );
  }

  const config = researchRun.config;
  const datasetJson =
    typeof parsed.dataset === "string" ? parsed.dataset : stableStringify(parsed.dataset);
  const dataset = parseJsonValue(parsed.dataset, "dataset", pathContext?.marketTicker);
  if (!isRecord(dataset) || !Array.isArray(dataset.snapshots) || dataset.snapshots.length === 0) {
    throw new ExperimentRegistryError(
      "dataset.snapshots must contain at least one snapshot",
      ExperimentRegistryErrorCode.INCOMPLETE_EXPERIMENT,
      { marketTicker: pathContext?.marketTicker },
    );
  }

  const snapshot = dataset.snapshots[0];
  if (!isRecord(snapshot)) {
    throw new ExperimentRegistryError(
      "dataset snapshot must be a plain object",
      ExperimentRegistryErrorCode.INVALID_METADATA,
      { marketTicker: pathContext?.marketTicker },
    );
  }

  const marketWindow = isRecord(snapshot.marketWindow) ? snapshot.marketWindow : null;
  const marketTicker =
    (typeof snapshot.ticker === "string" ? snapshot.ticker.trim() : "")
    || pathContext?.marketTicker?.trim()
    || (marketWindow && typeof marketWindow.ticker === "string"
      ? marketWindow.ticker.trim()
      : "");

  if (!marketTicker) {
    throw new ExperimentRegistryError(
      "Unable to resolve marketTicker from research output",
      ExperimentRegistryErrorCode.INCOMPLETE_EXPERIMENT,
      { marketTicker: pathContext?.marketTicker },
    );
  }

  const seriesTicker =
    pathContext?.seriesTicker?.trim()
    || (marketWindow && typeof marketWindow.seriesTicker === "string"
      ? marketWindow.seriesTicker.trim()
      : "")
    || marketTicker.split("-")[0]
    || marketTicker;

  const strategyId =
    readString(metadata, "strategyId")
    || readString(config, "strategyId")
    || pathContext?.strategyId?.trim()
    || "";

  if (!strategyId) {
    throw new ExperimentRegistryError(
      "strategyId is required in research output metadata",
      ExperimentRegistryErrorCode.INCOMPLETE_EXPERIMENT,
      { marketTicker },
    );
  }

  const runId =
    readString(metadata, "runId")
    || readString(config, "runId")
    || "";

  if (!runId) {
    throw new ExperimentRegistryError(
      "runId is required in research output metadata",
      ExperimentRegistryErrorCode.INCOMPLETE_EXPERIMENT,
      { marketTicker },
    );
  }

  const datasetMetadata = isRecord(dataset.metadata) ? dataset.metadata : null;
  const datasetHash =
    readString(metadata, "datasetId")
    || (datasetMetadata ? readString(datasetMetadata, "datasetId") : undefined)
    || hashDatasetContent(datasetJson);

  const strategyConfig = readRecord(config.strategyConfig);
  const fillConfig = readRecord(config.fillConfig);
  const costModelConfig = extractCostModelConfig(fillConfig);

  const backtestResult = parseJsonValue(
    researchRun.backtestResult,
    "backtestResult",
    marketTicker,
  );
  const engineVersion = isRecord(backtestResult)
    ? extractEngineVersion(backtestResult) ?? ENGINE_VERSION
    : ENGINE_VERSION;

  const timestamp =
    readString(metadata, "generatedAt")
    || readString(config, "generatedAt")
    || new Date(0).toISOString();

  return {
    runId,
    strategyId,
    seriesTicker,
    marketTicker,
    strategyConfig,
    costModelConfig,
    datasetHash,
    engineVersion,
    timestamp,
    outputPath,
  };
}
