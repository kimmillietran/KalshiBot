import { scanCalibrationResearchOutputs } from "@/lib/data/research/calibration/scanCalibrationResearchOutputs";
import type { CalibrationIo } from "@/lib/data/research/calibration/calibrationTypes";
import { extractMispricingObservationsFromResearchOutput } from "@/lib/data/research/mispricingAtlas/parseMispricingObservations";
import { loadRegimeVolatilityByMarket } from "@/lib/data/research/mispricingAtlas/loadRegimeVolatilityByMarket";

import type {
  EnrichedMispricingObservation,
  HypothesisRobustnessIo,
  VolatilityRegimeTag,
} from "./hypothesisRobustnessTypes";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value === "string") {
    return JSON.parse(value);
  }

  return value;
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function toTradingDayUtc(timestampMs: number): string {
  return new Date(timestampMs).toISOString().slice(0, 10);
}

function toCalendarMonth(timestampMs: number): string {
  const date = new Date(timestampMs);
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${date.getUTCFullYear()}-${month}`;
}

function toCalendarQuarter(timestampMs: number): string {
  const date = new Date(timestampMs);
  const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
  return `${date.getUTCFullYear()}-Q${quarter}`;
}

function readStepTimestamps(outputJson: string): Map<number, number> {
  const timestamps = new Map<number, number>();

  let parsed: unknown;
  try {
    parsed = JSON.parse(outputJson);
  } catch {
    return timestamps;
  }

  if (!isRecord(parsed)) {
    return timestamps;
  }

  try {
    const researchRun = parseJsonValue(parsed.researchRun);
    if (!isRecord(researchRun)) {
      return timestamps;
    }

    const backtestResult = parseJsonValue(researchRun.backtestResult);
    if (!isRecord(backtestResult)) {
      return timestamps;
    }

    const replayResult = backtestResult.replayResult;
    const replay = isRecord(replayResult)
      ? replayResult
      : parseJsonValue(replayResult);

    if (!isRecord(replay) || !Array.isArray(replay.results)) {
      return timestamps;
    }

    replay.results.forEach((step, stepIndex) => {
      if (!isRecord(step) || !isRecord(step.engineInput)) {
        return;
      }

      const evaluatedAt = readString(step.engineInput, "evaluatedAt");
      if (!evaluatedAt) {
        return;
      }

      const timestampMs = Date.parse(evaluatedAt);
      if (Number.isFinite(timestampMs)) {
        timestamps.set(stepIndex, timestampMs);
      }
    });
  } catch {
    return timestamps;
  }

  return timestamps;
}

function enrichObservation(
  observation: ReturnType<typeof extractMispricingObservationsFromResearchOutput>["observations"][number],
  timestampMs: number | null,
  volatilityRegime: VolatilityRegimeTag | null,
): EnrichedMispricingObservation {
  return {
    ...observation,
    timestampMs,
    tradingDayUtc: timestampMs === null ? null : toTradingDayUtc(timestampMs),
    calendarMonth: timestampMs === null ? null : toCalendarMonth(timestampMs),
    calendarQuarter: timestampMs === null ? null : toCalendarQuarter(timestampMs),
    volatilityRegime,
  };
}

/** Scans research outputs and returns timestamp-enriched mispricing observations. */
export function collectEnrichedMispricingObservations(input: {
  researchResultsDir: string;
  regimeTagsPath: string;
  io: HypothesisRobustnessIo;
}): EnrichedMispricingObservation[] {
  const calibrationIo: CalibrationIo = {
    readFile: input.io.readFile,
    fileExists: input.io.fileExists,
    readdir: input.io.readdir,
    isDirectory: input.io.isDirectory,
  };

  const scanned = scanCalibrationResearchOutputs(input.researchResultsDir, calibrationIo);
  const regimeVolatilityByMarket = loadRegimeVolatilityByMarket(
    calibrationIo,
    input.regimeTagsPath,
  );

  const enriched: EnrichedMispricingObservation[] = [];

  for (const entry of scanned) {
    const extracted = extractMispricingObservationsFromResearchOutput(
      entry.outputJson,
      entry.outputPath,
      {
        strategyId: entry.strategyId,
        seriesTicker: entry.seriesTicker,
        marketTicker: entry.marketTicker,
      },
    );

    const stepTimestamps = readStepTimestamps(entry.outputJson);
    const joinKey = `${entry.strategyId}/${entry.seriesTicker}/${entry.marketTicker}`;
    const volatilityRegime =
      (regimeVolatilityByMarket.get(joinKey) as VolatilityRegimeTag | undefined) ?? null;

    for (const observation of extracted.observations) {
      enriched.push(
        enrichObservation(
          observation,
          stepTimestamps.get(observation.stepIndex) ?? null,
          volatilityRegime,
        ),
      );
    }
  }

  return enriched.sort((left, right) => {
    const marketCompare = left.marketTicker.localeCompare(right.marketTicker);
    if (marketCompare !== 0) {
      return marketCompare;
    }

    const strategyCompare = left.strategyId.localeCompare(right.strategyId);
    if (strategyCompare !== 0) {
      return strategyCompare;
    }

    return left.stepIndex - right.stepIndex;
  });
}
