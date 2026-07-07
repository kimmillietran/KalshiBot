import { enumerateCalibrationResearchOutputPaths } from "@/lib/data/research/calibration/enumerateCalibrationResearchOutputPaths";
import type { CalibrationIo } from "@/lib/data/research/calibration/calibrationTypes";
import type { HypothesisCandidate } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import { observationMatchesAtlasBucket } from "@/lib/data/research/hypothesisEvidence/observationMatchesAtlasBucket";
import { extractMispricingObservationsFromResearchOutput } from "@/lib/data/research/mispricingAtlas/parseMispricingObservations";
import { loadRegimeVolatilityByMarket } from "@/lib/data/research/mispricingAtlas/loadRegimeVolatilityByMarket";
import {
  collectValidationBucketReferences,
  type ValidationObservationAccumulatorIndex,
} from "@/lib/data/research/hypothesisRobustness/buildValidationObservationAccumulators";
import { parseAtlasHypothesisCandidateId } from "@/lib/data/research/hypothesisRobustness/parseAtlasHypothesisCandidateId";
import type {
  HypothesisRobustnessIo,
  ParsedAtlasHypothesisRef,
  VolatilityRegimeTag,
} from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";
import {
  addToGroupAggregate,
  bucketAccumulatorKey,
  createEmptyGroupAggregate,
  createValidationBucketAccumulator,
  recordValidationObservation,
  type ValidationBucketAccumulator,
  type ValidationGroupAggregate,
} from "@/lib/data/research/hypothesisRobustness/validationBucketAccumulator";
import {
  enrichObservationTimestamps,
  readResearchOutputStepTimestamps,
} from "@/lib/data/research/hypothesisRobustness/readResearchOutputStepTimestamps";

import { monthRegimeCrossTabKey, type MonthRegimeCrossTab } from "./analyzeMonthRegimeStability";

export type MonthRegimeObservationIndex = ValidationObservationAccumulatorIndex & {
  getCrossTab: (
    reference: Pick<ParsedAtlasHypothesisRef, "groupId" | "bucketId">,
  ) => MonthRegimeCrossTab | undefined;
};

function getOrCreateCrossTabAggregate(
  crossTab: MonthRegimeCrossTab,
  month: string,
  regime: VolatilityRegimeTag,
): ValidationGroupAggregate {
  const key = monthRegimeCrossTabKey(month, regime);
  const existing = crossTab.get(key);
  if (existing) {
    return existing;
  }

  const created = createEmptyGroupAggregate();
  crossTab.set(key, created);
  return created;
}

/** Scans research outputs and builds validation accumulators plus month×regime cross-tabs. */
export function buildMonthRegimeObservationIndex(input: {
  candidates: readonly HypothesisCandidate[];
  researchResultsDir: string;
  regimeTagsPath: string;
  io: HypothesisRobustnessIo;
}): MonthRegimeObservationIndex {
  const references = collectValidationBucketReferences(input.candidates);
  const accumulators = new Map<string, ValidationBucketAccumulator>();
  const crossTabs = new Map<string, MonthRegimeCrossTab>();

  for (const reference of references) {
    const key = bucketAccumulatorKey(reference);
    accumulators.set(key, createValidationBucketAccumulator(reference));
    crossTabs.set(key, new Map());
  }

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

  for (const ref of outputRefs) {
    const outputJson = input.io.readFile(ref.outputPath);
    const extracted = extractMispricingObservationsFromResearchOutput(
      outputJson,
      ref.outputPath,
      {
        strategyId: ref.strategyId,
        seriesTicker: ref.seriesTicker,
        marketTicker: ref.marketTicker,
      },
    );
    const stepTimestamps = readResearchOutputStepTimestamps(outputJson);
    const joinKey = `${ref.strategyId}/${ref.seriesTicker}/${ref.marketTicker}`;
    const volatilityRegime =
      (regimeVolatilityByMarket.get(joinKey) as VolatilityRegimeTag | undefined) ?? null;

    for (const observation of extracted.observations) {
      for (const reference of references) {
        if (
          !observationMatchesAtlasBucket(
            reference.groupId,
            reference.bucketId,
            observation,
            regimeVolatilityByMarket,
          )
        ) {
          continue;
        }

        const key = bucketAccumulatorKey(reference);
        const accumulator = accumulators.get(key);
        const crossTab = crossTabs.get(key);
        if (!accumulator || !crossTab) {
          continue;
        }

        const timestampMs = stepTimestamps.get(observation.stepIndex) ?? null;
        const timestamps = enrichObservationTimestamps(timestampMs);

        recordValidationObservation(accumulator, {
          predictedProbability: observation.predictedProbability,
          observedOutcome: observation.observedOutcome,
          calendarMonth: timestamps.calendarMonth,
          calendarQuarter: timestamps.calendarQuarter,
          tradingDayUtc: timestamps.tradingDayUtc,
          volatilityRegime,
        });

        if (timestamps.calendarMonth && volatilityRegime) {
          addToGroupAggregate(
            getOrCreateCrossTabAggregate(crossTab, timestamps.calendarMonth, volatilityRegime),
            observation.predictedProbability,
            observation.observedOutcome,
          );
        }
      }
    }
  }

  const skippedUnsupportedCandidates = input.candidates.filter(
    (candidate) => parseAtlasHypothesisCandidateId(candidate.candidateId) === null,
  ).length;

  return {
    getAccumulator(reference) {
      return accumulators.get(bucketAccumulatorKey(reference));
    },
    getCrossTab(reference) {
      return crossTabs.get(bucketAccumulatorKey(reference));
    },
    memoryDiagnostics: {
      hypothesisCandidateCount: input.candidates.length,
      validationCandidateCount: references.length,
      atlasBucketReferenceCount: references.length,
      researchOutputFilesScanned: outputRefs.length,
      observationsProcessed: 0,
      observationsMatched: 0,
      monthBucketCount: 0,
      peakHeapUsedBytes: null,
      largestFileBytes: 0,
      largestFilePath: null,
      largestIntermediateCollection: "month-regime-cross-tab-accumulators",
      skippedUnsupportedCandidates,
    },
  };
}
