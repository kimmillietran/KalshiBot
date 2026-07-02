import { posix } from "node:path";

import { normalizeRootPath } from "../aggregation/researchAggregatePaths";
import { RESEARCH_OUTPUT_FILENAME } from "../aggregation/researchAggregatePaths";
import { STRATEGY_DECISION_TRACE_FILENAME } from "../decisionTrace/strategyDecisionTraceTypes";
import { assertSafePathSegment } from "../aggregation/researchAggregatePaths";

import {
  DecisionTraceAttributionError,
  DecisionTraceAttributionErrorCode,
  type DecisionTraceAttributionIo,
  type ScannedDecisionTrace,
} from "./decisionTraceAttributionTypes";

function collectTracesInStrategy(
  inputRoot: string,
  strategyIdRaw: string,
  io: DecisionTraceAttributionIo,
  collected: ScannedDecisionTrace[],
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
      const tracePath = posix.join(marketPath, STRATEGY_DECISION_TRACE_FILENAME);

      if (!io.fileExists(tracePath)) {
        continue;
      }

      found = true;
      collected.push({
        strategyId,
        seriesTicker,
        marketTicker,
        tracePath,
        researchOutputPath: posix.join(marketPath, RESEARCH_OUTPUT_FILENAME),
        traceJson: io.readFile(tracePath),
      });
    }
  }

  return found;
}

function collectLegacyTraces(
  inputRoot: string,
  seriesTickerRaw: string,
  io: DecisionTraceAttributionIo,
  collected: ScannedDecisionTrace[],
): void {
  const seriesTicker = assertSafePathSegment(seriesTickerRaw, "seriesTicker");
  const seriesPath = posix.join(inputRoot, seriesTicker);

  if (!io.isDirectory(seriesPath)) {
    return;
  }

  for (const marketTickerRaw of [...io.readdir(seriesPath)].sort()) {
    const marketTicker = assertSafePathSegment(marketTickerRaw, "marketTicker");
    const marketPath = posix.join(seriesPath, marketTicker);
    const tracePath = posix.join(marketPath, STRATEGY_DECISION_TRACE_FILENAME);

    if (!io.fileExists(tracePath)) {
      continue;
    }

    collected.push({
      strategyId: "unknown",
      seriesTicker,
      marketTicker,
      tracePath,
      researchOutputPath: posix.join(marketPath, RESEARCH_OUTPUT_FILENAME),
      traceJson: io.readFile(tracePath),
    });
  }
}

/** Discovers decision-trace.json files under strategy-aware and legacy research trees. */
export function discoverDecisionTraces(
  inputRoot: string,
  io: DecisionTraceAttributionIo,
): readonly ScannedDecisionTrace[] {
  const normalizedRoot = normalizeRootPath(inputRoot);

  if (!io.isDirectory(normalizedRoot)) {
    throw new DecisionTraceAttributionError(
      `Research results directory does not exist: ${normalizedRoot}`,
      DecisionTraceAttributionErrorCode.MISSING_INPUT_DIRECTORY,
    );
  }

  const collected: ScannedDecisionTrace[] = [];

  for (const topLevelRaw of [...io.readdir(normalizedRoot)].sort()) {
    const topLevelPath = posix.join(normalizedRoot, topLevelRaw);
    if (!io.isDirectory(topLevelPath)) {
      continue;
    }

    const foundStrategyAware = collectTracesInStrategy(
      normalizedRoot,
      topLevelRaw,
      io,
      collected,
    );

    if (!foundStrategyAware) {
      collectLegacyTraces(normalizedRoot, topLevelRaw, io, collected);
    }
  }

  return collected.sort((left, right) => left.tracePath.localeCompare(right.tracePath));
}
