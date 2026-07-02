import { posix } from "node:path";

import { buildWalkForwardFoldOutputPath, buildWalkForwardSummaryPath } from "./buildWalkForwardOutputPaths";
import { generateWalkForwardFolds } from "./generateWalkForwardFolds";
import {
  serializeWalkForwardFold,
  serializeWalkForwardSplitSummary,
} from "./serializeWalkForwardSplit";
import { WalkForwardSplitError, WalkForwardSplitErrorCode } from "./walkForwardSplitErrors";
import type {
  RunWalkForwardSplitInput,
  WalkForwardRegistryMarket,
  WalkForwardSplitFilesystem,
  WalkForwardSplitRunnerDeps,
  WalkForwardSplitSummary,
} from "./walkForwardSplitTypes";

function normalizePath(path: string): string {
  return posix.normalize(path.replace(/\\/g, "/"));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseRegistryMarketEntry(
  value: unknown,
  registryPath: string,
): WalkForwardRegistryMarket {
  if (!isRecord(value)) {
    throw new WalkForwardSplitError(
      "Registry market entry must be a plain object",
      WalkForwardSplitErrorCode.INVALID_REGISTRY,
      { registryPath },
    );
  }

  if (!isNonEmptyString(value.seriesTicker) || !isNonEmptyString(value.marketTicker)) {
    throw new WalkForwardSplitError(
      "Registry market entry requires seriesTicker and marketTicker",
      WalkForwardSplitErrorCode.INVALID_REGISTRY,
      { registryPath, marketTicker: typeof value.marketTicker === "string" ? value.marketTicker : undefined },
    );
  }

  if (!isNonEmptyString(value.fixturePath)) {
    throw new WalkForwardSplitError(
      "Registry market entry requires fixturePath",
      WalkForwardSplitErrorCode.INVALID_REGISTRY,
      { registryPath, marketTicker: value.marketTicker },
    );
  }

  const marketCloseTime =
    value.marketCloseTime === null || value.marketCloseTime === undefined
      ? ""
      : typeof value.marketCloseTime === "string"
        ? value.marketCloseTime.trim()
        : "";

  return {
    seriesTicker: value.seriesTicker.trim(),
    marketTicker: value.marketTicker.trim(),
    fixturePath: value.fixturePath.trim(),
    marketCloseTime,
    registryPath,
  };
}

function parseRegistryDocument(
  json: string,
  registryPath: string,
): readonly WalkForwardRegistryMarket[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    throw new WalkForwardSplitError(
      "dataset-registry.json contains invalid JSON",
      WalkForwardSplitErrorCode.INVALID_REGISTRY,
      { registryPath },
    );
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.markets)) {
    throw new WalkForwardSplitError(
      "dataset-registry.json requires markets array",
      WalkForwardSplitErrorCode.INVALID_REGISTRY,
      { registryPath },
    );
  }

  return parsed.markets.map((entry) => parseRegistryMarketEntry(entry, registryPath));
}

function loadRegistryMarkets(
  registryDir: string,
  filesystem: WalkForwardSplitFilesystem,
): WalkForwardRegistryMarket[] {
  const normalizedRegistryDir = normalizePath(registryDir);

  if (!filesystem.exists(normalizedRegistryDir)) {
    throw new WalkForwardSplitError(
      `Registry directory not found: ${normalizedRegistryDir}`,
      WalkForwardSplitErrorCode.MISSING_REGISTRY_DIR,
    );
  }

  const registryPaths = filesystem.listRegistryPaths(normalizedRegistryDir);
  const markets: WalkForwardRegistryMarket[] = [];

  for (const registryPath of registryPaths) {
    markets.push(
      ...parseRegistryDocument(filesystem.readFile(registryPath), registryPath),
    );
  }

  return markets;
}

export function runWalkForwardSplit(
  input: RunWalkForwardSplitInput,
  deps: WalkForwardSplitRunnerDeps,
): WalkForwardSplitSummary {
  const normalizedOutputDir = normalizePath(input.outputDir);
  if (!input.generatedAt?.trim()) {
    throw new WalkForwardSplitError(
      "generatedAt is required for walk-forward split output",
      WalkForwardSplitErrorCode.INVALID_GENERATED_AT,
    );
  }

  const markets = loadRegistryMarkets(input.registryDir, deps.filesystem);
  const folds = generateWalkForwardFolds(markets, input.config);

  const foldOutputs = folds.map((fold) => {
    const outputPath = buildWalkForwardFoldOutputPath(
      normalizedOutputDir,
      input.config.splitId,
      fold.foldIndex,
    );
    deps.filesystem.mkdir(posix.dirname(outputPath));
    deps.filesystem.writeFile(outputPath, serializeWalkForwardFold(fold));

    return Object.freeze({
      foldIndex: fold.foldIndex,
      outputPath,
    });
  });

  const summaryPath = buildWalkForwardSummaryPath(
    normalizedOutputDir,
    input.config.splitId,
  );

  const summary: WalkForwardSplitSummary = Object.freeze({
    splitId: input.config.splitId,
    registryDir: normalizePath(input.registryDir),
    outputDir: normalizedOutputDir,
    summaryPath,
    generatedAt: input.generatedAt,
    config: input.config,
    orderedMarketCount: markets.length,
    foldCount: folds.length,
    folds: Object.freeze([...foldOutputs]),
  });

  deps.filesystem.mkdir(posix.dirname(summaryPath));
  deps.filesystem.writeFile(summaryPath, serializeWalkForwardSplitSummary(summary));

  return summary;
}
