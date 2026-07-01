import { posix } from "node:path";

import type { MarketDiscoveryResult } from "@/lib/data/discovery";
import {
  buildHistoricalBronzeImportConfig,
  HistoricalBronzeImportBtcInterval,
  HistoricalBronzeImportBtcProvider,
  HistoricalBronzeImportKalshiSource,
  HistoricalBronzeImportOutputFormat,
  serializeHistoricalBronzeImportConfig,
} from "@/lib/data/importJobs/config";
import type { BuildHistoricalBronzeImportConfigInput } from "@/lib/data/importJobs/config";

import {
  BatchImportConfigError,
  BatchImportConfigErrorCode,
  type BatchImportConfigFile,
  type BatchImportConfigGenerationResult,
  type BuildBatchImportConfigsInput,
} from "./batchImportConfigTypes";
import { deriveImportWindowFromDiscoveredMarket } from "./deriveImportWindow";
import { parseMarketDiscoveryResultJson } from "./parseMarketDiscoveryResult";

const DEFAULT_OUTPUT_ROOT = "data/import-configs";

const INVALID_PATH_SEGMENT_PATTERN = /[<>:"/\\|?*\u0000-\u001f]/;
const RESERVED_PATH_SEGMENT_PATTERN = /^(?:\.|\.\.)$/;

const DEFAULT_KALSHI_CONFIG: BuildHistoricalBronzeImportConfigInput["kalshi"] = {
  marketSource: HistoricalBronzeImportKalshiSource.KALSHI_REST,
  candleSource: HistoricalBronzeImportKalshiSource.KALSHI_CANDLES,
  settlementSource: HistoricalBronzeImportKalshiSource.KALSHI_REST,
};

const DEFAULT_BTC_CONFIG: BuildHistoricalBronzeImportConfigInput["btc"] = {
  provider: HistoricalBronzeImportBtcProvider.COINBASE_SPOT,
  symbol: "BTC-USD",
  interval: HistoricalBronzeImportBtcInterval.ONE_MINUTE,
};

const DEFAULT_OUTPUT_CONFIG: BuildHistoricalBronzeImportConfigInput["output"] = {
  format: HistoricalBronzeImportOutputFormat.JSON,
  includeValidationReport: true,
  includeFixture: false,
};

function compareDiscoveredMarkets(
  left: MarketDiscoveryResult["markets"][number],
  right: MarketDiscoveryResult["markets"][number],
): number {
  return left.marketTicker.localeCompare(right.marketTicker);
}

function assertSafePathSegment(
  value: string,
  label: string,
  marketTicker?: string,
): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new BatchImportConfigError(
      `${label} is required`,
      BatchImportConfigErrorCode.INVALID_MARKET_TICKER_PATH,
      marketTicker,
    );
  }

  if (
    INVALID_PATH_SEGMENT_PATTERN.test(trimmed)
    || RESERVED_PATH_SEGMENT_PATTERN.test(trimmed)
  ) {
    throw new BatchImportConfigError(
      `${label} contains invalid path characters`,
      BatchImportConfigErrorCode.INVALID_MARKET_TICKER_PATH,
      marketTicker ?? trimmed,
    );
  }

  return trimmed;
}

function buildOutputPath(
  outputRoot: string,
  seriesTicker: string,
  marketTicker: string,
): string {
  const safeSeriesTicker = assertSafePathSegment(seriesTicker, "seriesTicker", marketTicker);
  const safeMarketTicker = assertSafePathSegment(
    marketTicker,
    "marketTicker",
    marketTicker,
  );

  return posix.join(outputRoot, safeSeriesTicker, safeMarketTicker, "config.json");
}

function buildConfigForMarket(
  market: MarketDiscoveryResult["markets"][number],
  outputRoot: string,
): BatchImportConfigFile {
  const window = deriveImportWindowFromDiscoveredMarket(market);
  const configInput: BuildHistoricalBronzeImportConfigInput = {
    jobId: `import-${market.marketTicker}`,
    marketTicker: market.marketTicker,
    startTime: window.startTime,
    endTime: window.endTime,
    collectionTime: window.collectionTime,
    observedAt: window.observedAt,
    kalshi: DEFAULT_KALSHI_CONFIG,
    btc: DEFAULT_BTC_CONFIG,
    output: DEFAULT_OUTPUT_CONFIG,
  };

  const config = buildHistoricalBronzeImportConfig(configInput);

  return {
    marketTicker: market.marketTicker,
    outputPath: buildOutputPath(outputRoot, market.seriesTicker, market.marketTicker),
    config: configInput,
    serialized: serializeHistoricalBronzeImportConfig(config),
  };
}

/** Builds one historical import config per discovered market. */
export function buildBatchImportConfigs(
  input: BuildBatchImportConfigsInput,
): BatchImportConfigGenerationResult {
  const outputRoot = input.outputRoot?.trim() || DEFAULT_OUTPUT_ROOT;
  const markets = [...input.discovery.markets].sort(compareDiscoveredMarkets);
  const seenOutputPaths = new Map<string, string>();
  const files: BatchImportConfigFile[] = [];

  for (const market of markets) {
    const file = buildConfigForMarket(market, outputRoot);
    const existingTicker = seenOutputPaths.get(file.outputPath);
    if (existingTicker !== undefined) {
      throw new BatchImportConfigError(
        `Duplicate output path: ${file.outputPath}`,
        BatchImportConfigErrorCode.DUPLICATE_OUTPUT_PATH,
        market.marketTicker,
      );
    }

    seenOutputPaths.set(file.outputPath, market.marketTicker);
    files.push(file);
  }

  return {
    seriesTicker: input.discovery.metadata.seriesTicker,
    outputRoot: posix.normalize(outputRoot.replace(/\\/g, "/")),
    files,
  };
}

export function buildBatchImportConfigsFromDiscoveryJson(
  json: string,
  options?: { outputRoot?: string },
): BatchImportConfigGenerationResult {
  const discovery = parseMarketDiscoveryResultJson(json);
  return buildBatchImportConfigs({
    discovery,
    outputRoot: options?.outputRoot,
  });
}
