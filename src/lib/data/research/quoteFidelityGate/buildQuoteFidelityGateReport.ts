import type { ResearchDatasetSeriesRegistry } from "@/lib/data/research/registry/researchDatasetRegistryTypes";

import { analyzeLadderFeasibility, mapRegistryMarkets } from "./analyzeLadderFeasibility";
import { analyzeQuoteFidelity } from "./analyzeQuoteFidelity";
import { auditFieldAvailability } from "./auditFieldAvailability";
import {
  buildMarketUniverseSummary,
  countResearchOutputMarkets,
  parseDatasetRegistry,
} from "./buildMarketUniverseSummary";
import { computeFeeSmokeCheck } from "./computeFeeSmokeCheck";
import { evaluateQuoteFidelityVerdict } from "./evaluateQuoteFidelityVerdict";
import {
  QUOTE_FIDELITY_GATE_CAVEATS,
  QUOTE_FIDELITY_GATE_DISCLAIMER,
} from "./quoteFidelityGateConfig";
import {
  QuoteFidelityGateError,
  QuoteFidelityGateErrorCode,
  type LoadedQuoteFidelityGateInputs,
  type QuoteFidelityGateConfig,
  type QuoteFidelityGateInputPaths,
  type QuoteFidelityGateIo,
  type QuoteFidelityGateReport,
} from "./quoteFidelityGateTypes";
import { loadFixtureMetadataForMarkets } from "./analyzeLadderFeasibility";

export function buildDefaultQuoteFidelityGateInputPaths(
  overrides?: Partial<QuoteFidelityGateInputPaths>,
): QuoteFidelityGateInputPaths {
  return {
    datasetRegistryPath:
      overrides?.datasetRegistryPath ?? "data/research-datasets/KXBTC15M/dataset-registry.json",
    fixturesDir: overrides?.fixturesDir ?? "data/fixtures/KXBTC15M",
    researchResultsDir: overrides?.researchResultsDir ?? "data/research-results",
  };
}

export function loadQuoteFidelityGateInputs(input: {
  inputPaths: QuoteFidelityGateInputPaths;
  config: QuoteFidelityGateConfig;
  io: QuoteFidelityGateIo;
}): LoadedQuoteFidelityGateInputs {
  if (!input.io.fileExists(input.inputPaths.datasetRegistryPath)) {
    throw new QuoteFidelityGateError(
      `Missing required input: ${input.inputPaths.datasetRegistryPath}`,
      QuoteFidelityGateErrorCode.MISSING_INPUT,
    );
  }

  let registry: ResearchDatasetSeriesRegistry;
  try {
    registry = parseDatasetRegistry(input.io.readFile(input.inputPaths.datasetRegistryPath));
  } catch (error) {
    throw new QuoteFidelityGateError(
      `Invalid dataset registry: ${error instanceof Error ? error.message : "parse error"}`,
      QuoteFidelityGateErrorCode.INVALID_DOCUMENT,
    );
  }

  const markets = mapRegistryMarkets(registry);
  const fixtureSamplePaths = markets
    .slice(0, input.config.fixtureSampleSize)
    .map((market) => market.fixturePath);

  const researchOutputMarketCount =
    input.config.researchOutputSampleSize >= 0
      ? countResearchOutputMarkets(
        input.inputPaths.researchResultsDir,
        input.config.seriesTicker,
        input.io,
      )
      : null;

  return {
    seriesTicker: registry.seriesTicker,
    registryMarketCount: registry.summary.marketCount,
    markets,
    fixtureSamplePaths,
    researchOutputMarketCount,
  };
}

export function buildQuoteFidelityGateReport(input: {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  config: QuoteFidelityGateConfig;
  inputPaths: QuoteFidelityGateInputPaths;
  loadedInputs: LoadedQuoteFidelityGateInputs;
  io: QuoteFidelityGateIo;
}): QuoteFidelityGateReport {
  const { loadedInputs, config, io } = input;
  const fixtureMetadata = loadFixtureMetadataForMarkets({
    markets: loadedInputs.markets,
    io,
    sampleSize: config.fixtureSampleSize,
    fixturesDir: input.inputPaths.fixturesDir,
  });

  const marketUniverse = buildMarketUniverseSummary({
    config,
    markets: loadedInputs.markets,
    registryMarketCount: loadedInputs.registryMarketCount,
    researchOutputMarketCount: loadedInputs.researchOutputMarketCount,
    fixtureMarketCount: loadedInputs.markets.length,
  });

  const quoteFidelity = analyzeQuoteFidelity(loadedInputs.markets);
  const ladderFeasibility = analyzeLadderFeasibility({
    markets: loadedInputs.markets,
    fixtureMetadataByTicker: fixtureMetadata,
  });

  const fieldAvailability = auditFieldAvailability({
    markets: loadedInputs.markets,
    fixtureSampleSize: config.fixtureSampleSize,
    fixturesDir: input.inputPaths.fixturesDir,
    io,
  });

  const feeSmokeCheck = computeFeeSmokeCheck();

  const { verdict, recommendedNextAction } = evaluateQuoteFidelityVerdict({
    config,
    quoteFidelity,
    ladder: ladderFeasibility,
    marketCount: loadedInputs.markets.length,
  });

  const warnings: string[] = [];
  if (ladderFeasibility.eventsWith2PlusStrikes === 0) {
    warnings.push("No historical cross-strike ladder exists: one market per event_ticker.");
  }
  if (quoteFidelity.liveCloseOnlyQuoteShare >= config.highLiveCloseOnlyShareThreshold) {
    warnings.push("Historical Kalshi quotes are live-close-only proxies.");
  }
  if (quoteFidelity.zeroSpreadMarketShare >= config.highZeroSpreadShareThreshold) {
    warnings.push("Registry shows near-100% zero-spread synthesized quotes.");
  }
  if (!feeSmokeCheck.buyBothParityProfitableAfterFees) {
    warnings.push(
      "Fee smoke check: zero-spread yesAsk+noAsk=100¢ is net-negative after taker fees.",
    );
  }
  if (ladderFeasibility.parsedVsFixtureMismatchCount > 0) {
    warnings.push(
      `Parsed vs fixture eventTicker mismatch in ${ladderFeasibility.parsedVsFixtureMismatchCount} sampled events.`,
    );
  }

  return {
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
    disclaimer: QUOTE_FIDELITY_GATE_DISCLAIMER,
    caveats: [...QUOTE_FIDELITY_GATE_CAVEATS],
    config,
    inputPaths: input.inputPaths,
    summary: {
      seriesTicker: loadedInputs.seriesTicker,
      marketCount: loadedInputs.markets.length,
      eventCount: ladderFeasibility.eventCount,
      eventsWith2PlusStrikes: ladderFeasibility.eventsWith2PlusStrikes,
      eventsWith3PlusStrikes: ladderFeasibility.eventsWith3PlusStrikes,
      maxStrikesPerEvent: ladderFeasibility.maxStrikesPerEvent,
      liveCloseOnlyQuoteShare: quoteFidelity.liveCloseOnlyQuoteShare,
      zeroSpreadMarketShare: quoteFidelity.zeroSpreadMarketShare,
      ladderResearchFeasible: ladderFeasibility.ladderResearchFeasible,
      executableParityResearchFeasible: quoteFidelity.executableParityResearchFeasible,
      executableCrossSpreadResearchFeasible:
        quoteFidelity.executableCrossSpreadResearchFeasible
        && ladderFeasibility.ladderResearchFeasible,
      verdict,
      recommendedNextAction,
    },
    marketUniverse,
    quoteFidelity,
    ladderFeasibility,
    fieldAvailability,
    feeSmokeCheck,
    warnings,
  };
}
