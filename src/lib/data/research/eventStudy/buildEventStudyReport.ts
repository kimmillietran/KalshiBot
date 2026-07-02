import { stableStringify } from "@/lib/trading/config/hashConfig";

import { normalizeRootPath } from "../aggregation/researchAggregatePaths";
import { scanCalibrationResearchOutputs } from "@/lib/data/research/calibration/scanCalibrationResearchOutputs";

import { resolveEventStudyWindowConfig } from "./assignEventWindows";
import { computeEventStudyEventResult } from "./computeEventStudyMetrics";
import { extractEventStudyMarketFromResearchOutput } from "./parseEventStudyMarket";
import type {
  BuildEventStudyReportInput,
  EventDefinition,
  EventStudyIo,
  EventStudyMarketData,
  EventStudyReport,
  EventStudyWarning,
} from "./eventStudyTypes";

function sortWarnings(warnings: readonly EventStudyWarning[]): EventStudyWarning[] {
  return [...warnings].sort((left, right) => {
    const eventCompare = (left.eventId ?? "").localeCompare(right.eventId ?? "");
    if (eventCompare !== 0) {
      return eventCompare;
    }

    const marketCompare = (left.marketTicker ?? "").localeCompare(
      right.marketTicker ?? "",
    );
    if (marketCompare !== 0) {
      return marketCompare;
    }

    return left.message.localeCompare(right.message);
  });
}

function buildEmptyReport(input: {
  inputRoot: string;
  outputPath: string;
  eventsPath: string;
  generatedAt: string;
  windowConfig: ReturnType<typeof resolveEventStudyWindowConfig>;
  warnings: readonly EventStudyWarning[];
}): EventStudyReport {
  return {
    generatedAt: input.generatedAt,
    inputRoot: normalizeRootPath(input.inputRoot),
    outputPath: normalizeRootPath(input.outputPath),
    eventsPath: normalizeRootPath(input.eventsPath),
    windowConfig: input.windowConfig,
    sampleCounts: {
      eventCount: 0,
      scannedMarketCount: 0,
      analyzedMarketCount: 0,
      skippedMarkets: 0,
    },
    events: [],
    warnings: sortWarnings(input.warnings),
  };
}

/** Builds a deterministic event study report from events and scanned research outputs. */
export function buildEventStudyReport(
  input: BuildEventStudyReportInput,
): EventStudyReport {
  const windowConfig = resolveEventStudyWindowConfig(input.windowConfig);
  const warnings: EventStudyWarning[] = [];

  if (input.events.length === 0) {
    warnings.push({
      code: "empty-events",
      message: "No events were provided for event study analysis",
    });
  }

  if (input.scanned.length === 0) {
    warnings.push({
      code: "empty-dataset",
      message: "No research outputs found for event study analysis",
    });

    return buildEmptyReport({
      inputRoot: input.inputRoot,
      outputPath: input.outputPath,
      eventsPath: input.eventsPath,
      generatedAt: input.generatedAt,
      windowConfig,
      warnings,
    });
  }

  const markets: EventStudyMarketData[] = [];
  let skippedMarkets = 0;

  for (const entry of [...input.scanned].sort((left, right) =>
    left.marketTicker.localeCompare(right.marketTicker),
  )) {
    const extracted = extractEventStudyMarketFromResearchOutput(
      entry.outputJson,
      entry.outputPath,
      {
        strategyId: entry.strategyId,
        seriesTicker: entry.seriesTicker,
        marketTicker: entry.marketTicker,
      },
    );

    warnings.push(...extracted.warnings);

    if (!extracted.market) {
      skippedMarkets += 1;
      continue;
    }

    markets.push(extracted.market);
  }

  const events = input.events.map((event) =>
    computeEventStudyEventResult({
      event,
      markets,
      windowConfig,
    }),
  );

  return {
    generatedAt: input.generatedAt,
    inputRoot: normalizeRootPath(input.inputRoot),
    outputPath: normalizeRootPath(input.outputPath),
    eventsPath: normalizeRootPath(input.eventsPath),
    windowConfig,
    sampleCounts: {
      eventCount: input.events.length,
      scannedMarketCount: input.scanned.length,
      analyzedMarketCount: markets.length,
      skippedMarkets,
    },
    events,
    warnings: sortWarnings(warnings),
  };
}

export function buildEventStudyReportFromDirectories(
  inputRoot: string,
  outputPath: string,
  eventsPath: string,
  io: EventStudyIo,
  options: {
    generatedAt: string;
    events: readonly EventDefinition[];
    windowConfig?: BuildEventStudyReportInput["windowConfig"];
  },
): EventStudyReport {
  const scanned = scanCalibrationResearchOutputs(inputRoot, io);

  return buildEventStudyReport({
    inputRoot,
    outputPath,
    eventsPath,
    generatedAt: options.generatedAt,
    events: options.events,
    windowConfig: options.windowConfig,
    scanned,
  });
}

export function serializeEventStudyReport(report: EventStudyReport): string {
  return stableStringify(report);
}
