import { enumerateCalibrationResearchOutputPaths } from "@/lib/data/research/calibration/enumerateCalibrationResearchOutputPaths";
import { DEFAULT_REGIME_TAGS_INPUT_PATH } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import { loadRegimeVolatilityByMarket } from "@/lib/data/research/mispricingAtlas/loadRegimeVolatilityByMarket";
import type { MispricingAtlas } from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import {
  buildMispricingAtlasBucketReferences,
  createCostAwareAtlasAccumulatorState,
  finalizeCostAwareBucketEntries,
  ingestCostAwareMarketExtraction,
} from "./costAwareAtlasAccumulator";
import { createCostAwareAtlasConfig } from "./costAwareAtlasConfig";
import { buildCostAwareAtlasReport } from "./buildCostAwareAtlasReport";
import type {
  CostAwareAtlasConfig,
  CostAwareAtlasIo,
  CostAwareAtlasReport,
} from "./costAwareAtlasTypes";
import { extractCostAwareObservationsFromResearchOutput } from "./parseCostAwareObservations";

function parseMispricingAtlasJson(json: string): MispricingAtlas | null {
  try {
    return JSON.parse(json) as MispricingAtlas;
  } catch {
    return null;
  }
}

export function buildCostAwareAtlasFromDirectories(input: {
  inputRoot: string;
  outputPath: string;
  htmlOutputPath: string;
  io: CostAwareAtlasIo;
  generatedAt: string;
  mispricingAtlasPath?: string;
  regimeTagsPath?: string;
  config?: Partial<CostAwareAtlasConfig>;
}): CostAwareAtlasReport {
  const config = createCostAwareAtlasConfig(input.config);
  const refs = enumerateCalibrationResearchOutputPaths(input.inputRoot, input.io);
  const regimeTagsPath = input.regimeTagsPath ?? DEFAULT_REGIME_TAGS_INPUT_PATH;
  const regimeVolatilityByMarket = loadRegimeVolatilityByMarket(input.io, regimeTagsPath);
  const state = createCostAwareAtlasAccumulatorState({ regimeVolatilityByMarket });

  for (const ref of refs) {
    const outputJson = input.io.readFile(ref.outputPath);
    const extracted = extractCostAwareObservationsFromResearchOutput(
      outputJson,
      ref.outputPath,
      {
        strategyId: ref.strategyId,
        seriesTicker: ref.seriesTicker,
        marketTicker: ref.marketTicker,
      },
    );

    ingestCostAwareMarketExtraction(
      state,
      extracted.observations,
      config,
      { regimeVolatilityByMarket },
    );
  }

  const mispricingAtlasPath = input.mispricingAtlasPath ?? null;
  const atlasBucketReferences =
    mispricingAtlasPath && input.io.fileExists(mispricingAtlasPath)
      ? buildMispricingAtlasBucketReferences(
          parseMispricingAtlasJson(input.io.readFile(mispricingAtlasPath)) ?? {
            generatedAt: input.generatedAt,
            inputRoot: input.inputRoot,
            outputPath: mispricingAtlasPath,
            sampleCounts: {
              totalObservations: 0,
              marketCount: 0,
              skippedMissingSettlement: 0,
              skippedMissingProbability: 0,
              skippedMissingContext: 0,
            },
            overallCalibration: {
              bucketId: "overall",
              bucketLabel: "Overall calibration",
              observations: 0,
              averageImpliedProbability: null,
              realizedFrequency: null,
              calibrationError: null,
              brierScore: null,
              averageAbsoluteError: null,
            },
            probabilityBuckets: [],
            timeRemainingBuckets: [],
            moneynessBuckets: [],
            volatilityBuckets: [],
            warnings: [],
          },
        )
      : [];

  const buckets = finalizeCostAwareBucketEntries({
    config,
    atlasBucketReferences,
    state,
  });

  return buildCostAwareAtlasReport({
    generatedAt: input.generatedAt,
    inputRoot: input.inputRoot,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
    mispricingAtlasPath,
    config,
    buckets,
    totalObservations: state.totalObservations,
    derivedObservations: state.derivedObservations,
    officialObservations: state.officialObservations,
  });
}

export function serializeCostAwareAtlasReport(report: CostAwareAtlasReport): string {
  return stableStringify(report);
}
