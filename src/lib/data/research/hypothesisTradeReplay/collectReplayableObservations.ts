import { enumerateCalibrationResearchOutputPaths } from "@/lib/data/research/calibration/enumerateCalibrationResearchOutputPaths";
import type { CalibrationIo } from "@/lib/data/research/calibration/calibrationTypes";
import { extractMispricingObservationsFromResearchOutput } from "@/lib/data/research/mispricingAtlas/parseMispricingObservations";
import { loadRegimeVolatilityByMarket } from "@/lib/data/research/mispricingAtlas/loadRegimeVolatilityByMarket";
import {
  enrichObservationTimestamps,
  readResearchOutputStepTimestamps,
} from "@/lib/data/research/hypothesisRobustness/readResearchOutputStepTimestamps";
import type { VolatilityRegimeTag } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";

import type {
  HypothesisTradeReplayIo,
  ReplayableObservation,
} from "./hypothesisTradeReplayTypes";
import { readResearchOutputStepQuotes } from "./readResearchOutputStepQuotes";

const DERIVED_SETTLEMENT_MONTH = "2025-12";

function enrichObservation(
  observation: ReturnType<typeof extractMispricingObservationsFromResearchOutput>["observations"][number],
  timestampMs: number | null,
  volatilityRegime: VolatilityRegimeTag | null,
  quote: ReplayableObservation["quote"],
): ReplayableObservation {
  const timestamps = enrichObservationTimestamps(timestampMs);

  return {
    ...observation,
    timestampMs,
    tradingDayUtc: timestamps.tradingDayUtc,
    calendarMonth: timestamps.calendarMonth,
    calendarQuarter: timestamps.calendarQuarter,
    volatilityRegime,
    quote,
  };
}

/** Scans research outputs and returns bucket-matchable observations with step quotes. */
export function collectReplayableObservations(input: {
  researchResultsDir: string;
  regimeTagsPath: string;
  officialOnly: boolean;
  io: HypothesisTradeReplayIo;
}): ReplayableObservation[] {
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

  const replayable: ReplayableObservation[] = [];

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
    const stepQuotes = readResearchOutputStepQuotes(outputJson);
    const joinKey = `${entry.strategyId}/${entry.seriesTicker}/${entry.marketTicker}`;
    const volatilityRegime =
      (regimeVolatilityByMarket.get(joinKey) as VolatilityRegimeTag | undefined) ?? null;

    for (const observation of extracted.observations) {
      const enriched = enrichObservation(
        observation,
        stepTimestamps.get(observation.stepIndex) ?? null,
        volatilityRegime,
        stepQuotes.get(observation.stepIndex) ?? null,
      );

      if (
        input.officialOnly
        && enriched.calendarMonth === DERIVED_SETTLEMENT_MONTH
      ) {
        continue;
      }

      replayable.push(enriched);
    }
  }

  return replayable.sort((left, right) => {
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

export { loadRegimeVolatilityByMarket };
