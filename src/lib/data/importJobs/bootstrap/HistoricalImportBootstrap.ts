import { mkdirSync, writeFileSync } from "node:fs";

import { DataSource } from "@/lib/data/provenance";
import {
  BtcHistoricalHttpAdapter,
  BtcHistoricalInterval,
  CoinbaseHistoricalHttpAdapter,
  createBtcHistoricalImporter,
  createCoinbaseHistoricalImporter,
} from "@/lib/data/importers/btc";
import type {
  BtcHistoricalImporter,
  BtcHistoricalImporterBar,
} from "@/lib/data/importers/btc";
import {
  KalshiHistoricalHttpAdapter,
  KalshiHistoricalImporter,
} from "@/lib/data/importers/kalshi";

import {
  HistoricalBronzeImportBtcInterval,
  HistoricalBronzeImportBtcProvider,
} from "../config/historicalBronzeImportConfigTypes";
import type { HistoricalBronzeImportConfig } from "../config/historicalBronzeImportConfigTypes";
import { runConfiguredHistoricalBronzeImport } from "../harness/HistoricalImportHarness";
import type { HistoricalBronzeImportJobResult } from "../historicalBronzeImportJobTypes";
import { createBtcHistoricalBronzeProviderFromImporter } from "../providers/btc";
import { createPrefetchedKalshiHistoricalBronzeProvider } from "../providers/kalshi";

import {
  HistoricalImportBootstrapError,
  HistoricalImportBootstrapErrorCode,
} from "./historicalImportBootstrapTypes";
import type {
  CreateHistoricalImportProvidersFromConfigInput,
  HistoricalImportFetchLike,
  HistoricalImportProviders,
  RunHistoricalImportFromConfigInput,
} from "./historicalImportBootstrapTypes";

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }

  Object.freeze(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreeze(item);
    }
  } else {
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
  }

  return value;
}

function resolveFetchImpl(fetchImpl?: HistoricalImportFetchLike): HistoricalImportFetchLike {
  if (fetchImpl) {
    return fetchImpl;
  }

  if (typeof globalThis.fetch !== "function") {
    throw new HistoricalImportBootstrapError(
      "fetchImpl is required when global fetch is unavailable",
      HistoricalImportBootstrapErrorCode.MISSING_FETCH_IMPL,
    );
  }

  return globalThis.fetch.bind(globalThis);
}

function createBtcImporterFromConfig(
  config: HistoricalBronzeImportConfig,
  fetchImpl: HistoricalImportFetchLike,
): BtcHistoricalImporter {
  if (config.btc.provider === HistoricalBronzeImportBtcProvider.BINANCE_SPOT) {
    const httpAdapter = new BtcHistoricalHttpAdapter({ fetchImpl });
    return createBtcHistoricalImporter({
      httpClient: httpAdapter,
      source: DataSource.BINANCE_SPOT,
    });
  }

  if (config.btc.provider === HistoricalBronzeImportBtcProvider.COINBASE_SPOT) {
    const httpAdapter = new CoinbaseHistoricalHttpAdapter({ fetchImpl });
    return createCoinbaseHistoricalImporter({
      httpClient: httpAdapter,
    });
  }

  throw new HistoricalImportBootstrapError(
    "btc.provider must be a supported BTC import provider",
    HistoricalImportBootstrapErrorCode.UNSUPPORTED_BTC_PROVIDER,
  );
}

function mapBtcInterval(
  interval: HistoricalBronzeImportConfig["btc"]["interval"],
): BtcHistoricalInterval {
  if (interval === HistoricalBronzeImportBtcInterval.ONE_MINUTE) {
    return BtcHistoricalInterval.ONE_MINUTE;
  }

  throw new HistoricalImportBootstrapError(
    "btc.interval must be a supported BTC interval",
    HistoricalImportBootstrapErrorCode.UNSUPPORTED_BTC_INTERVAL,
  );
}

function createPrefetchedBtcHistoricalImporter(
  bars: readonly BtcHistoricalImporterBar[],
): BtcHistoricalImporter {
  const frozenBars = deepFreeze([...bars.map((bar) => deepFreeze({ ...bar }))]);

  return {
    getHistoricalBars: () => frozenBars,
  } as unknown as BtcHistoricalImporter;
}

async function createKalshiProviderFromConfig(
  config: HistoricalBronzeImportConfig,
  fetchImpl: HistoricalImportFetchLike,
) {
  const httpAdapter = new KalshiHistoricalHttpAdapter({ fetchImpl });
  const importer = new KalshiHistoricalImporter({
    httpClient: httpAdapter,
    now: () => new Date(config.collectionTime),
    persistMarketParseDiagnostics: true,
    persistMarketParseDiagnosticsIo: {
      writeFile: (path, data) => {
        writeFileSync(path, data, "utf8");
      },
      mkdirSync: (path, options) => {
        mkdirSync(path, options);
      },
    },
  });

  return createPrefetchedKalshiHistoricalBronzeProvider({
    importer,
    marketTicker: config.marketTicker,
    startTime: config.startTime,
    endTime: config.endTime,
    collectionTime: config.collectionTime,
    observedAt: config.observedAt,
  });
}

async function createBtcProviderFromConfig(
  config: HistoricalBronzeImportConfig,
  fetchImpl: HistoricalImportFetchLike,
) {
  const importer = createBtcImporterFromConfig(config, fetchImpl);
  const interval = mapBtcInterval(config.btc.interval);
  const bars = await importer.getHistoricalBars({
    symbol: config.btc.symbol,
    interval,
    startTime: config.startTime,
    endTime: config.endTime,
  });
  const prefetchedImporter = createPrefetchedBtcHistoricalImporter(bars);

  return createBtcHistoricalBronzeProviderFromImporter({
    importer: prefetchedImporter,
    symbol: config.btc.symbol,
    interval,
  });
}

/**
 * Constructs Kalshi and BTC bronze providers from a validated import config
 * by wiring existing HTTP adapters, importers, and prefetch adapters.
 */
export async function createHistoricalImportProvidersFromConfig(
  input: CreateHistoricalImportProvidersFromConfigInput,
): Promise<HistoricalImportProviders> {
  const fetchImpl = resolveFetchImpl(input.fetchImpl);

  const [kalshiProvider, btcProvider] = await Promise.all([
    createKalshiProviderFromConfig(input.config, fetchImpl),
    createBtcProviderFromConfig(input.config, fetchImpl),
  ]);

  return {
    kalshiProvider,
    btcProvider,
  };
}

/**
 * Bootstraps providers from config and runs the configured historical bronze import.
 */
export async function runHistoricalImportFromConfig(
  input: RunHistoricalImportFromConfigInput,
): Promise<HistoricalBronzeImportJobResult> {
  const { kalshiProvider, btcProvider } = await createHistoricalImportProvidersFromConfig(input);

  return runConfiguredHistoricalBronzeImport({
    config: input.config,
    kalshiProvider,
    btcProvider,
  });
}

export type {
  CreateHistoricalImportProvidersFromConfigInput,
  HistoricalImportFetchLike,
  HistoricalImportProviders,
  RunHistoricalImportFromConfigInput,
} from "./historicalImportBootstrapTypes";

export {
  HistoricalImportBootstrapError,
  HistoricalImportBootstrapErrorCode,
} from "./historicalImportBootstrapTypes";
