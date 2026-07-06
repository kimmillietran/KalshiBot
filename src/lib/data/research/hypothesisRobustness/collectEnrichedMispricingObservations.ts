import { enumerateCalibrationResearchOutputPaths } from "@/lib/data/research/calibration/enumerateCalibrationResearchOutputPaths";
import type { CalibrationIo } from "@/lib/data/research/calibration/calibrationTypes";
import { extractMispricingObservationsFromResearchOutput } from "@/lib/data/research/mispricingAtlas/parseMispricingObservations";
import { loadRegimeVolatilityByMarket } from "@/lib/data/research/mispricingAtlas/loadRegimeVolatilityByMarket";

import type {
  EnrichedMispricingObservation,
  HypothesisRobustnessIo,
  VolatilityRegimeTag,
} from "./hypothesisRobustnessTypes";
import {
  enrichObservationTimestamps,
  readResearchOutputStepTimestamps,
} from "./readResearchOutputStepTimestamps";

function enrichObservation(
  observation: ReturnType<typeof extractMispricingObservationsFromResearchOutput>["observations"][number],
  timestampMs: number | null,
  volatilityRegime: VolatilityRegimeTag | null,
): EnrichedMispricingObservation {
  const timestamps = enrichObservationTimestamps(timestampMs);

  return {
    ...observation,
    timestampMs,
    tradingDayUtc: timestamps.tradingDayUtc,
    calendarMonth: timestamps.calendarMonth,
    calendarQuarter: timestamps.calendarQuarter,
    volatilityRegime,
  };
}

/** Scans research outputs one file at a time and returns enriched observations. */
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

  const outputRefs = enumerateCalibrationResearchOutputPaths(
    input.researchResultsDir,
    calibrationIo,
  );
  const regimeVolatilityByMarket = loadRegimeVolatilityByMarket(
    calibrationIo,
    input.regimeTagsPath,
  );

  const enriched: EnrichedMispricingObservation[] = [];

  for (const entry of outputRefs) {
    const outputJson = input.io.readFile(entry.outputPath);
    const extracted = extractMispricingObservationsFromResearchOutput(
      outputJson,
      entry.outputPath,
      {
        strategyId: entry.strategyId,
        seriesTicker: entry.seriesTicker,
        marketTicker: entry.marketTicker,
      },
    );

    const stepTimestamps = readResearchOutputStepTimestamps(outputJson);
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
