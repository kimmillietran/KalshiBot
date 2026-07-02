import { posix } from "node:path";

import {
  buildWalkForwardSplitRootPath,
  WALK_FORWARD_FOLDS_DIR,
  WALK_FORWARD_SUMMARY_FILENAME,
} from "@/lib/data/research/walkForwardEngine";
import type { WalkForwardFold, WalkForwardSplitSummary } from "@/lib/data/research/walkForwardEngine";

import {
  WalkForwardSweepError,
  WalkForwardSweepErrorCode,
  WALK_FORWARD_SWEEP_OUTPUT_FILENAME,
  WALK_FORWARD_SWEEP_SUMMARY_FILENAME,
} from "./walkForwardSweepTypes";
import type {
  WalkForwardSweepDiscoveredFold,
  WalkForwardSweepDiscoveredSplit,
  WalkForwardSweepFilesystem,
  WalkForwardSweepValidationMarketRef,
} from "./walkForwardSweepTypes";

function normalizePath(path: string): string {
  return posix.normalize(path.replace(/\\/g, "/"));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseValidationMarketRef(value: unknown): WalkForwardSweepValidationMarketRef {
  if (!isRecord(value)) {
    throw new WalkForwardSweepError(
      "Fold validation market must be a plain object",
      WalkForwardSweepErrorCode.INVALID_FOLD,
    );
  }

  if (
    !isNonEmptyString(value.seriesTicker)
    || !isNonEmptyString(value.marketTicker)
    || !isNonEmptyString(value.fixturePath)
  ) {
    throw new WalkForwardSweepError(
      "Fold validation market requires seriesTicker, marketTicker, and fixturePath",
      WalkForwardSweepErrorCode.INVALID_FOLD,
    );
  }

  return {
    seriesTicker: value.seriesTicker.trim(),
    marketTicker: value.marketTicker.trim(),
    fixturePath: value.fixturePath.trim(),
    marketCloseTime:
      typeof value.marketCloseTime === "string" ? value.marketCloseTime.trim() : "",
    orderedIndex:
      typeof value.orderedIndex === "number" && Number.isFinite(value.orderedIndex)
        ? value.orderedIndex
        : -1,
    registryPath:
      typeof value.registryPath === "string" ? value.registryPath.trim() : "",
  };
}

export function parseWalkForwardFoldJson(json: string): WalkForwardFold {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    throw new WalkForwardSweepError(
      "Walk-forward fold file contains invalid JSON",
      WalkForwardSweepErrorCode.INVALID_FOLD,
    );
  }

  if (!isRecord(parsed)) {
    throw new WalkForwardSweepError(
      "Walk-forward fold file must be a plain object",
      WalkForwardSweepErrorCode.INVALID_FOLD,
    );
  }

  if (
    typeof parsed.foldIndex !== "number"
    || !Number.isInteger(parsed.foldIndex)
    || parsed.foldIndex < 0
    || !isNonEmptyString(parsed.splitId)
    || !isRecord(parsed.metadata)
    || !Array.isArray(parsed.validationMarkets)
  ) {
    throw new WalkForwardSweepError(
      "Walk-forward fold file is missing required fields",
      WalkForwardSweepErrorCode.INVALID_FOLD,
    );
  }

  const validationMarkets = parsed.validationMarkets.map(parseValidationMarketRef);

  return {
    foldIndex: parsed.foldIndex,
    splitId: parsed.splitId.trim(),
    trainingMarkets: Array.isArray(parsed.trainingMarkets) ? parsed.trainingMarkets : [],
    validationMarkets,
    metadata: parsed.metadata as WalkForwardFold["metadata"],
  };
}

function parseSplitSummaryJson(json: string): WalkForwardSplitSummary {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    throw new WalkForwardSweepError(
      "Walk-forward split summary contains invalid JSON",
      WalkForwardSweepErrorCode.INVALID_SPLIT_SUMMARY,
    );
  }

  if (
    !isRecord(parsed)
    || !isNonEmptyString(parsed.splitId)
    || !Array.isArray(parsed.folds)
  ) {
    throw new WalkForwardSweepError(
      "Walk-forward split summary requires splitId and folds",
      WalkForwardSweepErrorCode.INVALID_SPLIT_SUMMARY,
    );
  }

  return parsed as WalkForwardSplitSummary;
}

/** Loads a walk-forward split directory and its fold artifacts in deterministic order. */
export function discoverWalkForwardSplit(
  splitId: string,
  splitInputDir: string,
  filesystem: WalkForwardSweepFilesystem,
): WalkForwardSweepDiscoveredSplit {
  const normalizedSplitId = splitId.trim();
  if (!normalizedSplitId) {
    throw new WalkForwardSweepError(
      "splitId is required",
      WalkForwardSweepErrorCode.SPLIT_ID_MISMATCH,
    );
  }

  const splitInputRoot = normalizePath(
    buildWalkForwardSplitRootPath(splitInputDir, normalizedSplitId),
  );

  if (!filesystem.exists(splitInputRoot)) {
    throw new WalkForwardSweepError(
      `Walk-forward split directory not found: ${splitInputRoot}`,
      WalkForwardSweepErrorCode.MISSING_SPLIT_DIR,
      { splitId: normalizedSplitId },
    );
  }

  const splitSummaryPath = posix.join(splitInputRoot, WALK_FORWARD_SUMMARY_FILENAME);
  if (!filesystem.exists(splitSummaryPath)) {
    throw new WalkForwardSweepError(
      `Walk-forward split summary not found: ${splitSummaryPath}`,
      WalkForwardSweepErrorCode.MISSING_SPLIT_SUMMARY,
      { splitId: normalizedSplitId },
    );
  }

  const summary = parseSplitSummaryJson(filesystem.readFile(splitSummaryPath));

  if (summary.splitId !== normalizedSplitId) {
    throw new WalkForwardSweepError(
      `Split summary splitId "${summary.splitId}" does not match requested "${normalizedSplitId}"`,
      WalkForwardSweepErrorCode.SPLIT_ID_MISMATCH,
      { splitId: normalizedSplitId },
    );
  }

  const seenFoldIndices = new Set<number>();
  const folds: WalkForwardSweepDiscoveredFold[] = [];

  for (const foldRef of [...summary.folds].sort(
    (left, right) => left.foldIndex - right.foldIndex,
  )) {
    if (seenFoldIndices.has(foldRef.foldIndex)) {
      throw new WalkForwardSweepError(
        `Duplicate fold index ${foldRef.foldIndex} in split summary`,
        WalkForwardSweepErrorCode.DUPLICATE_FOLD_INDEX,
        { splitId: normalizedSplitId, foldIndex: foldRef.foldIndex },
      );
    }

    seenFoldIndices.add(foldRef.foldIndex);

    const foldPath = normalizePath(foldRef.outputPath);
    if (!filesystem.exists(foldPath)) {
      throw new WalkForwardSweepError(
        `Walk-forward fold file not found: ${foldPath}`,
        WalkForwardSweepErrorCode.MISSING_FOLD,
        { splitId: normalizedSplitId, foldIndex: foldRef.foldIndex },
      );
    }

    const fold = parseWalkForwardFoldJson(filesystem.readFile(foldPath));

    if (fold.splitId !== normalizedSplitId) {
      throw new WalkForwardSweepError(
        `Fold ${fold.foldIndex} splitId mismatch`,
        WalkForwardSweepErrorCode.INVALID_FOLD,
        { splitId: normalizedSplitId, foldIndex: fold.foldIndex },
      );
    }

    if (fold.foldIndex !== foldRef.foldIndex) {
      throw new WalkForwardSweepError(
        `Fold file index ${fold.foldIndex} does not match summary index ${foldRef.foldIndex}`,
        WalkForwardSweepErrorCode.INVALID_FOLD,
        { splitId: normalizedSplitId, foldIndex: fold.foldIndex },
      );
    }

    if (fold.validationMarkets.length === 0) {
      throw new WalkForwardSweepError(
        `Fold ${fold.foldIndex} has an empty validation set`,
        WalkForwardSweepErrorCode.EMPTY_VALIDATION_SET,
        { splitId: normalizedSplitId, foldIndex: fold.foldIndex },
      );
    }

    folds.push({
      foldIndex: fold.foldIndex,
      splitId: fold.splitId,
      foldPath,
      metadata: fold.metadata,
      validationMarkets: Object.freeze(
        [...fold.validationMarkets].sort((left, right) => {
          const byIndex = left.orderedIndex - right.orderedIndex;
          if (byIndex !== 0) {
            return byIndex;
          }

          const bySeries = left.seriesTicker.localeCompare(right.seriesTicker);
          if (bySeries !== 0) {
            return bySeries;
          }

          return left.marketTicker.localeCompare(right.marketTicker);
        }),
      ),
    });
  }

  if (folds.length === 0) {
    throw new WalkForwardSweepError(
      "Walk-forward split contains no folds",
      WalkForwardSweepErrorCode.MISSING_FOLD,
      { splitId: normalizedSplitId },
    );
  }

  return Object.freeze({
    splitId: normalizedSplitId,
    splitInputDir: normalizePath(splitInputDir),
    splitSummaryPath,
    folds: Object.freeze(folds),
  });
}

export function buildWalkForwardSweepOutputPath(
  outputDir: string,
  splitId: string,
  foldIndex: number,
  strategyId: string,
  seriesTicker: string,
  marketTicker: string,
): string {
  const paddedIndex = String(foldIndex).padStart(3, "0");
  return posix.join(
    normalizePath(outputDir),
    splitId,
    `fold-${paddedIndex}`,
    strategyId,
    seriesTicker,
    marketTicker,
    WALK_FORWARD_SWEEP_OUTPUT_FILENAME,
  );
}

export function resolveWalkForwardSweepSummaryPath(
  outputDir: string,
  splitId: string,
  summaryPath?: string,
): string {
  const normalizedOutputDir = normalizePath(outputDir);
  const requested = summaryPath?.trim() || WALK_FORWARD_SWEEP_SUMMARY_FILENAME;

  if (requested.includes("/") || requested.includes("\\")) {
    return normalizePath(requested);
  }

  return posix.join(normalizedOutputDir, splitId, requested);
}

export { WALK_FORWARD_FOLDS_DIR };
