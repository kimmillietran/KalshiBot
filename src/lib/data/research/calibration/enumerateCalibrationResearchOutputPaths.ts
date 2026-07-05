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

export type CalibrationResearchOutputRef = {
  strategyId: string;
  seriesTicker: string;
  marketTicker: string;
  outputPath: string;
};

function registerOutputRef(
  collected: CalibrationResearchOutputRef[],
  seenKeys: Map<string, string>,
  candidate: CalibrationResearchOutputRef,
): void {
  const key = buildCalibrationMarketKey(
    candidate.strategyId,
    candidate.seriesTicker,
    candidate.marketTicker,
  );
  const existingPath = seenKeys.get(key);

  if (existingPath) {
    throw new CalibrationError(
      `Duplicate market ${candidate.marketTicker} for strategy ${candidate.strategyId} and series ${candidate.seriesTicker}: ${existingPath} and ${candidate.outputPath}`,
      CalibrationErrorCode.DUPLICATE_MARKET,
      candidate.marketTicker,
    );
  }

  seenKeys.set(key, candidate.outputPath);
  collected.push(candidate);
}

function collectStrategyAwareOutputRefs(
  inputRoot: string,
  strategyIdRaw: string,
  io: CalibrationIo,
  collected: CalibrationResearchOutputRef[],
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
      registerOutputRef(collected, seenKeys, {
        strategyId,
        seriesTicker,
        marketTicker,
        outputPath,
      });
    }
  }

  return found;
}

function collectLegacySeriesOutputRefs(
  inputRoot: string,
  seriesTickerRaw: string,
  io: CalibrationIo,
  collected: CalibrationResearchOutputRef[],
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

    registerOutputRef(collected, seenKeys, {
      strategyId: "unknown",
      seriesTicker,
      marketTicker,
      outputPath,
    });
  }
}

/** Enumerates research output file paths without loading file contents. */
export function enumerateCalibrationResearchOutputPaths(
  inputRoot: string,
  io: CalibrationIo,
): readonly CalibrationResearchOutputRef[] {
  const normalizedInputRoot = normalizeRootPath(inputRoot);

  if (!io.isDirectory(normalizedInputRoot)) {
    throw new CalibrationError(
      `Input directory does not exist: ${normalizedInputRoot}`,
      CalibrationErrorCode.MISSING_INPUT_DIRECTORY,
    );
  }

  const collected: CalibrationResearchOutputRef[] = [];
  const seenKeys = new Map<string, string>();

  for (const topLevelRaw of [...io.readdir(normalizedInputRoot)].sort()) {
    const topLevelPath = posix.join(normalizedInputRoot, topLevelRaw);
    if (!io.isDirectory(topLevelPath)) {
      continue;
    }

    const foundStrategyAware = collectStrategyAwareOutputRefs(
      normalizedInputRoot,
      topLevelRaw,
      io,
      collected,
      seenKeys,
    );

    if (!foundStrategyAware) {
      collectLegacySeriesOutputRefs(
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

/** Scans strategy-aware and legacy research output directories. */
export function scanCalibrationResearchOutputs(
  inputRoot: string,
  io: CalibrationIo,
): readonly ScannedCalibrationResearchOutput[] {
  const refs = enumerateCalibrationResearchOutputPaths(inputRoot, io);
  const collected: ScannedCalibrationResearchOutput[] = [];
  const seenKeys = new Map<string, string>();

  for (const ref of refs) {
    const outputJson = io.readFile(ref.outputPath);
    const document = parseCalibrationResearchDocument(outputJson, ref.outputPath, {
      strategyId: ref.strategyId,
      seriesTicker: ref.seriesTicker,
      marketTicker: ref.marketTicker,
    });
    const key = buildCalibrationMarketKey(
      document.strategyId,
      document.seriesTicker,
      document.marketTicker,
    );
    const existingPath = seenKeys.get(key);

    if (existingPath) {
      throw new CalibrationError(
        `Duplicate market ${document.marketTicker} for strategy ${document.strategyId} and series ${document.seriesTicker}: ${existingPath} and ${ref.outputPath}`,
        CalibrationErrorCode.DUPLICATE_MARKET,
        document.marketTicker,
      );
    }

    seenKeys.set(key, ref.outputPath);
    collected.push({
      strategyId: document.strategyId,
      seriesTicker: document.seriesTicker,
      marketTicker: document.marketTicker,
      outputPath: ref.outputPath,
      outputJson,
    });
  }

  return collected;
}
