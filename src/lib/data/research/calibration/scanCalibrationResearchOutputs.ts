import { posix } from "node:path";

import { RESEARCH_OUTPUT_FILENAME } from "@/lib/data/research/aggregation/researchAggregatePaths";

import {
  assertSafePathSegment,
  buildCalibrationMarketKey,
  normalizeRootPath,
} from "./calibrationPaths";
import { parseCalibrationResearchDocument } from "./parseCalibrationResearchOutput";
import {
  CalibrationError,
  CalibrationErrorCode,
  type CalibrationIo,
  type ScannedCalibrationResearchOutput,
} from "./calibrationTypes";

function registerScannedOutput(
  collected: ScannedCalibrationResearchOutput[],
  seenKeys: Map<string, string>,
  candidate: ScannedCalibrationResearchOutput,
): void {
  const document = parseCalibrationResearchDocument(candidate.outputJson, candidate.outputPath, {
    strategyId: candidate.strategyId,
    seriesTicker: candidate.seriesTicker,
    marketTicker: candidate.marketTicker,
  });
  const key = buildCalibrationMarketKey(
    document.strategyId,
    document.seriesTicker,
    document.marketTicker,
  );
  const existingPath = seenKeys.get(key);

  if (existingPath) {
    throw new CalibrationError(
      `Duplicate market ${document.marketTicker} for strategy ${document.strategyId} and series ${document.seriesTicker}: ${existingPath} and ${candidate.outputPath}`,
      CalibrationErrorCode.DUPLICATE_MARKET,
      document.marketTicker,
    );
  }

  seenKeys.set(key, candidate.outputPath);
  collected.push({
    ...candidate,
    strategyId: document.strategyId,
    seriesTicker: document.seriesTicker,
    marketTicker: document.marketTicker,
  });
}

function collectStrategyAwareOutputs(
  inputRoot: string,
  strategyIdRaw: string,
  io: CalibrationIo,
  collected: ScannedCalibrationResearchOutput[],
  seenKeys: Map<string, string>,
): boolean {
  const strategyId = assertSafePathSegment(strategyIdRaw, "strategyId");
  const strategyPath = posix.join(inputRoot, strategyId);
  let found = false;

  for (const seriesTickerRaw of [...io.readdir(strategyPath)].sort()) {
    const seriesTicker = assertSafePathSegment(seriesTickerRaw, "seriesTicker");
    const seriesPath = posix.join(strategyPath, seriesTicker);

    if (!io.isDirectory(seriesPath)) {
      continue;
    }

    for (const marketTickerRaw of [...io.readdir(seriesPath)].sort()) {
      const marketTicker = assertSafePathSegment(marketTickerRaw, "marketTicker");
      const marketPath = posix.join(seriesPath, marketTicker);
      const outputPath = posix.join(marketPath, RESEARCH_OUTPUT_FILENAME);

      if (!io.fileExists(outputPath)) {
        continue;
      }

      found = true;
      registerScannedOutput(collected, seenKeys, {
        strategyId,
        seriesTicker,
        marketTicker,
        outputPath,
        outputJson: io.readFile(outputPath),
      });
    }
  }

  return found;
}

function collectLegacySeriesOutputs(
  inputRoot: string,
  seriesTickerRaw: string,
  io: CalibrationIo,
  collected: ScannedCalibrationResearchOutput[],
  seenKeys: Map<string, string>,
): void {
  const seriesTicker = assertSafePathSegment(seriesTickerRaw, "seriesTicker");
  const seriesPath = posix.join(inputRoot, seriesTicker);

  if (!io.isDirectory(seriesPath)) {
    return;
  }

  for (const marketTickerRaw of [...io.readdir(seriesPath)].sort()) {
    const marketTicker = assertSafePathSegment(marketTickerRaw, "marketTicker");
    const marketPath = posix.join(seriesPath, marketTicker);
    const outputPath = posix.join(marketPath, RESEARCH_OUTPUT_FILENAME);

    if (!io.fileExists(outputPath)) {
      continue;
    }

    registerScannedOutput(collected, seenKeys, {
      strategyId: "unknown",
      seriesTicker,
      marketTicker,
      outputPath,
      outputJson: io.readFile(outputPath),
    });
  }
}

/** Scans strategy-aware and legacy research output directories. */
export function scanCalibrationResearchOutputs(
  inputRoot: string,
  io: CalibrationIo,
): readonly ScannedCalibrationResearchOutput[] {
  const normalizedInputRoot = normalizeRootPath(inputRoot);

  if (!io.isDirectory(normalizedInputRoot)) {
    throw new CalibrationError(
      `Input directory does not exist: ${normalizedInputRoot}`,
      CalibrationErrorCode.MISSING_INPUT_DIRECTORY,
    );
  }

  const collected: ScannedCalibrationResearchOutput[] = [];
  const seenKeys = new Map<string, string>();

  for (const topLevelRaw of [...io.readdir(normalizedInputRoot)].sort()) {
    const topLevelPath = posix.join(normalizedInputRoot, topLevelRaw);
    if (!io.isDirectory(topLevelPath)) {
      continue;
    }

    const foundStrategyAware = collectStrategyAwareOutputs(
      normalizedInputRoot,
      topLevelRaw,
      io,
      collected,
      seenKeys,
    );

    if (!foundStrategyAware) {
      collectLegacySeriesOutputs(
        normalizedInputRoot,
        topLevelRaw,
        io,
        collected,
        seenKeys,
      );
    }
  }

  return collected;
}
