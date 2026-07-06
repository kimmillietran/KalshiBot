import { enumerateCalibrationResearchOutputPaths } from "@/lib/data/research/calibration/enumerateCalibrationResearchOutputPaths";
import type { CalibrationIo } from "@/lib/data/research/calibration/calibrationTypes";
import type { HypothesisCandidate } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import { observationMatchesAtlasBucket } from "@/lib/data/research/hypothesisEvidence/observationMatchesAtlasBucket";
import { extractMispricingObservationsFromResearchOutput } from "@/lib/data/research/mispricingAtlas/parseMispricingObservations";
import { loadRegimeVolatilityByMarket } from "@/lib/data/research/mispricingAtlas/loadRegimeVolatilityByMarket";
import type { RegimeVolatilityByMarketKey } from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";

import type { HypothesisValidationMemoryDiagnostics } from "./hypothesisValidationMemoryTypes";
import { parseAtlasHypothesisCandidateId } from "./parseAtlasHypothesisCandidateId";
import type { HypothesisRobustnessIo, ParsedAtlasHypothesisRef, VolatilityRegimeTag } from "./hypothesisRobustnessTypes";
import {
  enrichObservationTimestamps,
  readResearchOutputStepTimestamps,
} from "./readResearchOutputStepTimestamps";
import {
  bucketAccumulatorKey,
  createValidationBucketAccumulator,
  recordValidationObservation,
  type ValidationBucketAccumulator,
} from "./validationBucketAccumulator";

function readHeapUsedBytes(): number | null {
  if (typeof process === "undefined" || typeof process.memoryUsage !== "function") {
    return null;
  }

  return process.memoryUsage().heapUsed;
}

/** Collects unique atlas bucket references required for hypothesis validation. */
export function collectValidationBucketReferences(
  candidates: readonly HypothesisCandidate[],
): ParsedAtlasHypothesisRef[] {
  const seen = new Set<string>();
  const references: ParsedAtlasHypothesisRef[] = [];

  for (const candidate of candidates) {
    const reference = parseAtlasHypothesisCandidateId(candidate.candidateId);
    if (!reference) {
      continue;
    }

    const key = bucketAccumulatorKey(reference);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    references.push(reference);
  }

  return references;
}

export type ValidationObservationAccumulatorIndex = {
  getAccumulator: (
    reference: Pick<ParsedAtlasHypothesisRef, "groupId" | "bucketId">,
  ) => ValidationBucketAccumulator | undefined;
  memoryDiagnostics: HypothesisValidationMemoryDiagnostics;
};

/** Scans research outputs once and accumulates validation metrics per atlas bucket. */
export function buildValidationObservationAccumulators(input: {
  candidates: readonly HypothesisCandidate[];
  researchResultsDir: string;
  regimeTagsPath: string;
  io: HypothesisRobustnessIo;
  memoryReport?: boolean;
}): ValidationObservationAccumulatorIndex {
  const references = collectValidationBucketReferences(input.candidates);
  const accumulators = new Map<string, ValidationBucketAccumulator>();

  for (const reference of references) {
    accumulators.set(
      bucketAccumulatorKey(reference),
      createValidationBucketAccumulator(reference),
    );
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

  let filesProcessed = 0;
  let observationsProcessed = 0;
  let observationsMatched = 0;
  let largestFileBytes = 0;
  let largestFilePath: string | null = null;
  let peakHeapUsedBytes = input.memoryReport ? readHeapUsedBytes() : null;
  const monthBuckets = new Set<string>();

  for (const ref of outputRefs) {
    const outputJson = input.io.readFile(ref.outputPath);
    filesProcessed += 1;

    if (outputJson.length > largestFileBytes) {
      largestFileBytes = outputJson.length;
      largestFilePath = ref.outputPath;
    }

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
      observationsProcessed += 1;

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

        const accumulator = accumulators.get(bucketAccumulatorKey(reference));
        if (!accumulator) {
          continue;
        }

        observationsMatched += 1;
        const timestampMs = stepTimestamps.get(observation.stepIndex) ?? null;
        const timestamps = enrichObservationTimestamps(timestampMs);
        if (timestamps.calendarMonth) {
          monthBuckets.add(timestamps.calendarMonth);
        }

        recordValidationObservation(accumulator, {
          predictedProbability: observation.predictedProbability,
          observedOutcome: observation.observedOutcome,
          calendarMonth: timestamps.calendarMonth,
          calendarQuarter: timestamps.calendarQuarter,
          tradingDayUtc: timestamps.tradingDayUtc,
          volatilityRegime,
        });
      }
    }

    if (input.memoryReport) {
      const heapUsed = readHeapUsedBytes();
      if (heapUsed !== null) {
        peakHeapUsedBytes =
          peakHeapUsedBytes === null
            ? heapUsed
            : Math.max(peakHeapUsedBytes, heapUsed);
      }
    }
  }

  const skippedUnsupportedCandidates = input.candidates.filter(
    (candidate) => parseAtlasHypothesisCandidateId(candidate.candidateId) === null,
  ).length;

  const memoryDiagnostics: HypothesisValidationMemoryDiagnostics = {
    hypothesisCandidateCount: input.candidates.length,
    validationCandidateCount: references.length,
    atlasBucketReferenceCount: references.length,
    researchOutputFilesScanned: filesProcessed,
    observationsProcessed,
    observationsMatched,
    monthBucketCount: monthBuckets.size,
    peakHeapUsedBytes,
    largestFileBytes,
    largestFilePath,
    largestIntermediateCollection: "validation-bucket-accumulators",
    skippedUnsupportedCandidates,
  };

  return {
    getAccumulator(reference) {
      return accumulators.get(bucketAccumulatorKey(reference));
    },
    memoryDiagnostics,
  };
}

export type { RegimeVolatilityByMarketKey };
