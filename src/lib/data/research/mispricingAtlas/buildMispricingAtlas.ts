import { stableStringify } from "@/lib/trading/config/hashConfig";

import type { CalibrationResearchOutputRef } from "@/lib/data/research/calibration/enumerateCalibrationResearchOutputPaths";
import { enumerateCalibrationResearchOutputPaths } from "@/lib/data/research/calibration/enumerateCalibrationResearchOutputPaths";
import { DEFAULT_REGIME_TAGS_INPUT_PATH } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";

import { collectMispricingAtlasBucketGroups, computeMispricingAtlasCoverageDiagnostics } from "./computeMispricingAtlasCoverage";
import { loadRegimeVolatilityByMarket } from "./loadRegimeVolatilityByMarket";
import {
  createMispricingAtlasIncrementalState,
  finalizeMispricingAtlasIncrementalState,
  ingestMispricingMarketExtraction,
} from "./mispricingAtlasIncrementalAccumulator";
import {
  DEFAULT_MISPRICING_ATLAS_MIN_SAMPLE_THRESHOLD,
  type BuildMispricingAtlasInput,
  type MispricingAtlas,
  type MispricingAtlasIo,
  type MispricingAtlasMemoryDiagnostics,
} from "./mispricingAtlasTypes";
import { extractMispricingObservationsFromResearchOutput } from "./parseMispricingObservations";

function readHeapUsedBytes(): number | null {
  if (typeof process === "undefined" || typeof process.memoryUsage !== "function") {
    return null;
  }

  return process.memoryUsage().heapUsed;
}

function createMemoryDiagnosticsTracker(): {
  recordFile: (outputPath: string, fileBytes: number) => void;
  finalize: (totalObservations: number) => MispricingAtlasMemoryDiagnostics;
} {
  let filesProcessed = 0;
  let peakHeapUsedBytes = readHeapUsedBytes();
  let largestFileBytes = 0;
  let largestFilePath: string | null = null;

  return {
    recordFile(outputPath: string, fileBytes: number) {
      filesProcessed += 1;
      const heapUsed = readHeapUsedBytes();
      if (heapUsed !== null) {
        peakHeapUsedBytes =
          peakHeapUsedBytes === null
            ? heapUsed
            : Math.max(peakHeapUsedBytes, heapUsed);
      }

      if (fileBytes > largestFileBytes) {
        largestFileBytes = fileBytes;
        largestFilePath = outputPath;
      }
    },
    finalize(totalObservations: number) {
      return {
        filesProcessed,
        peakHeapUsedBytes,
        largestFileBytes,
        largestFilePath,
        totalObservations,
      };
    },
  };
}

function processResearchOutputJson(
  state: ReturnType<typeof createMispricingAtlasIncrementalState>,
  outputJson: string,
  ref: Pick<
    CalibrationResearchOutputRef,
    "strategyId" | "seriesTicker" | "marketTicker" | "outputPath"
  >,
  regimeVolatilityByMarket?: BuildMispricingAtlasInput["regimeVolatilityByMarket"],
): void {
  const extracted = extractMispricingObservationsFromResearchOutput(
    outputJson,
    ref.outputPath,
    {
      strategyId: ref.strategyId,
      seriesTicker: ref.seriesTicker,
      marketTicker: ref.marketTicker,
    },
  );

  ingestMispricingMarketExtraction(
    state,
    {
      strategyId: extracted.strategyId,
      seriesTicker: extracted.seriesTicker,
      marketTicker: extracted.marketTicker,
      observations: extracted.observations,
      warnings: extracted.warnings,
    },
    { regimeVolatilityByMarket },
  );
}

function buildAtlasFromIncrementalState(
  input: Pick<
    BuildMispricingAtlasInput,
    "generatedAt" | "inputRoot" | "outputPath" | "minSampleThreshold"
  >,
  state: ReturnType<typeof createMispricingAtlasIncrementalState>,
  memoryDiagnostics?: MispricingAtlasMemoryDiagnostics,
): MispricingAtlas {
  const finalized = finalizeMispricingAtlasIncrementalState(state);
  const minSampleThreshold =
    input.minSampleThreshold ?? DEFAULT_MISPRICING_ATLAS_MIN_SAMPLE_THRESHOLD;
  const coverageDiagnostics = computeMispricingAtlasCoverageDiagnostics({
    bucketGroups: collectMispricingAtlasBucketGroups({
      probabilityBuckets: finalized.probabilityBuckets,
      timeRemainingBuckets: finalized.timeRemainingBuckets,
      moneynessBuckets: finalized.moneynessBuckets,
      volatilityBuckets: finalized.volatilityBuckets,
      momentumBuckets: finalized.momentumBuckets,
      hourUtcBuckets: finalized.hourUtcBuckets,
      dayOfWeekUtcBuckets: finalized.dayOfWeekUtcBuckets,
      sessionBucketBuckets: finalized.sessionBucketBuckets,
      weekendFlagBuckets: finalized.weekendFlagBuckets,
      coarseBuckets: finalized.coarseBuckets,
    }),
    sampleCounts: finalized.sampleCounts,
    minSampleThreshold,
  });

  return {
    generatedAt: input.generatedAt,
    inputRoot: input.inputRoot,
    outputPath: input.outputPath,
    sampleCounts: finalized.sampleCounts,
    overallCalibration: finalized.overallCalibration,
    probabilityBuckets: finalized.probabilityBuckets,
    timeRemainingBuckets: finalized.timeRemainingBuckets,
    moneynessBuckets: finalized.moneynessBuckets,
    volatilityBuckets: finalized.volatilityBuckets,
    momentumBuckets: finalized.momentumBuckets,
    hourUtcBuckets: finalized.hourUtcBuckets,
    dayOfWeekUtcBuckets: finalized.dayOfWeekUtcBuckets,
    sessionBucketBuckets: finalized.sessionBucketBuckets,
    weekendFlagBuckets: finalized.weekendFlagBuckets,
    coarseBuckets: finalized.coarseBuckets,
    coverageDiagnostics,
    ...(memoryDiagnostics ? { memoryDiagnostics } : {}),
    warnings: finalized.warnings,
  };
}

function processResearchOutputRefsIncrementally(
  refs: readonly CalibrationResearchOutputRef[],
  io: MispricingAtlasIo,
  options: {
    regimeVolatilityByMarket?: BuildMispricingAtlasInput["regimeVolatilityByMarket"];
    memoryReport?: boolean;
  },
): {
  state: ReturnType<typeof createMispricingAtlasIncrementalState>;
  memoryDiagnostics?: MispricingAtlasMemoryDiagnostics;
} {
  const state = createMispricingAtlasIncrementalState({
    regimeVolatilityByMarket: options.regimeVolatilityByMarket,
  });
  const memoryTracker = options.memoryReport
    ? createMemoryDiagnosticsTracker()
    : null;

  for (const ref of refs) {
    const outputJson = io.readFile(ref.outputPath);
    if (memoryTracker) {
      memoryTracker.recordFile(ref.outputPath, outputJson.length);
    }

    processResearchOutputJson(state, outputJson, ref, options.regimeVolatilityByMarket);
  }

  return {
    state,
    memoryDiagnostics: memoryTracker
      ? memoryTracker.finalize(state.totalObservations)
      : undefined,
  };
}

/** Builds a deterministic mispricing atlas from scanned research outputs. */
export function buildMispricingAtlas(
  input: BuildMispricingAtlasInput,
): MispricingAtlas {
  const state = createMispricingAtlasIncrementalState({
    regimeVolatilityByMarket: input.regimeVolatilityByMarket,
  });
  const memoryTracker = input.memoryReport
    ? createMemoryDiagnosticsTracker()
    : null;

  for (const entry of input.scanned) {
    if (memoryTracker) {
      memoryTracker.recordFile(entry.outputPath, entry.outputJson.length);
    }

    processResearchOutputJson(
      state,
      entry.outputJson,
      entry,
      input.regimeVolatilityByMarket,
    );
  }

  return buildAtlasFromIncrementalState(
    input,
    state,
    memoryTracker ? memoryTracker.finalize(state.totalObservations) : undefined,
  );
}

export function buildMispricingAtlasFromDirectories(
  inputRoot: string,
  outputPath: string,
  io: MispricingAtlasIo,
  options: {
    generatedAt: string;
    regimeTagsPath?: string;
    minSampleThreshold?: number;
    memoryReport?: boolean;
  },
): MispricingAtlas {
  const refs = enumerateCalibrationResearchOutputPaths(inputRoot, io);
  const regimeTagsPath = options.regimeTagsPath ?? DEFAULT_REGIME_TAGS_INPUT_PATH;
  const regimeVolatilityByMarket = loadRegimeVolatilityByMarket(io, regimeTagsPath);
  const { state, memoryDiagnostics } = processResearchOutputRefsIncrementally(refs, io, {
    regimeVolatilityByMarket,
    memoryReport: options.memoryReport,
  });

  return buildAtlasFromIncrementalState(
    {
      generatedAt: options.generatedAt,
      inputRoot,
      outputPath,
      minSampleThreshold: options.minSampleThreshold,
    },
    state,
    memoryDiagnostics,
  );
}

export function serializeMispricingAtlas(atlas: MispricingAtlas): string {
  return stableStringify(atlas);
}
