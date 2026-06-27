import { getBtcProviderMode } from "./config";
import { createCompositeBtcPriceProvider } from "./composite";
import type { BtcPriceProvider } from "./interface";
import {
  createDefaultProviderMetricsPipeline,
  resetProviderMetricsObservers,
  type ProviderMetricsObserver,
} from "./providerMetrics";
import { resetProviderHealth } from "./providerHealth";
import {
  createRegisteredBtcProvider,
  type BtcProviderId,
} from "./registry";

export type { BtcCandleInterval, BtcPriceProvider, BtcProviderCandle, BtcProviderPrice } from "./interface";
export {
  BtcProviderChainError,
  BtcProviderMalformedResponseError,
  BtcProviderNetworkError,
  BtcProviderRateLimitError,
  BtcProviderTimeoutError,
  BtcProviderUnavailableError,
} from "./errors";
export { createCoinbaseBtcProvider, coinbaseBtcProvider, COINBASE_EXCHANGE_API_BASE } from "./coinbase";
export { createKrakenBtcProvider, krakenBtcProvider, KRAKEN_API_BASE } from "./kraken";
export { createFallbackBtcPriceProvider } from "./fallback";
export {
  createCompositeBtcPriceProvider,
  type CompositeBtcPriceProviderOptions,
  type ProviderFailureHandler,
} from "./composite";
export { getBtcProviderMode, type BtcProviderMode } from "./config";
export {
  createRegisteredBtcProvider,
  listRegisteredBtcProviderIds,
  registerBtcProvider,
  type BtcProviderId,
} from "./registry";
export {
  configureProviderHealth,
  getAllProviderHealth,
  getProviderHealth,
  isProviderCircuitOpen,
  resetProviderHealth,
  type ProviderHealthSnapshot,
  type ProviderHealthStatus,
} from "./providerHealth";
export {
  createDefaultProviderMetricsPipeline,
  emitProviderMetric,
  logProviderMetric,
  resetProviderMetricsObservers,
  subscribeProviderMetrics,
  type ProviderMetricEvent,
  type ProviderMetricsObserver,
} from "./providerMetrics";
export { fetchWithTimeout } from "./fetchWithTimeout";

let cachedDefaultProvider: BtcPriceProvider | null = null;
let defaultMetricsObserver: ProviderMetricsObserver | null = null;

function getDefaultMetricsObserver(): ProviderMetricsObserver {
  if (!defaultMetricsObserver) {
    defaultMetricsObserver = createDefaultProviderMetricsPipeline();
  }
  return defaultMetricsObserver;
}

function logProviderFailure(providerId: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[btc-feed] provider "${providerId}" failed: ${message}`);
}

export function resolveBtcProvider(
  env: NodeJS.ProcessEnv = process.env,
): BtcPriceProvider {
  const mode = getBtcProviderMode(env);

  switch (mode) {
    case "kraken":
      return createRegisteredBtcProvider("kraken");
    case "auto":
      return createCompositeBtcPriceProvider(
        [
          createRegisteredBtcProvider("coinbase"),
          createRegisteredBtcProvider("kraken"),
          createRegisteredBtcProvider("fallback"),
        ],
        {
          onProviderFailure: logProviderFailure,
          onMetric: getDefaultMetricsObserver(),
        },
      );
    case "coinbase":
    default:
      return createRegisteredBtcProvider("coinbase");
  }
}

export function getDefaultBtcProvider(): BtcPriceProvider {
  if (!cachedDefaultProvider) {
    cachedDefaultProvider = resolveBtcProvider();
  }
  return cachedDefaultProvider;
}

export function createBtcProvider(id: BtcProviderId = "coinbase"): BtcPriceProvider {
  return createRegisteredBtcProvider(id);
}

export function resetDefaultBtcProviderCache(): void {
  cachedDefaultProvider = null;
  defaultMetricsObserver = null;
  resetProviderHealth();
  resetProviderMetricsObservers();
}
