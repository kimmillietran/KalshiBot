import type { BtcCandleInterval, BtcPriceProvider, BtcProviderCandle, BtcProviderPrice } from "./interface";
import { BtcProviderChainError } from "./errors";
import {
  getProviderHealth,
  isProviderCircuitOpen,
  recordProviderFailure,
  recordProviderSuccess,
} from "./providerHealth";
import type { ProviderMetricsObserver } from "./providerMetrics";

export type ProviderFailureHandler = (providerId: string, error: unknown) => void;

export type CompositeBtcPriceProviderOptions = {
  onProviderFailure?: ProviderFailureHandler;
  onMetric?: ProviderMetricsObserver;
  now?: () => number;
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Tries providers sequentially — first success wins; skips open circuits. */
export function createCompositeBtcPriceProvider(
  providers: BtcPriceProvider[],
  options: CompositeBtcPriceProviderOptions = {},
): BtcPriceProvider {
  const { onProviderFailure, onMetric, now = () => Date.now() } = options;
  const chainId = providers.map((provider) => provider.id).join("→");

  async function tryChain<T>(
    operation: (provider: BtcPriceProvider) => Promise<T>,
  ): Promise<T> {
    const failures: Array<{ providerId: string; error: unknown }> = [];
    const timestamp = now();

    for (const provider of providers) {
      if (isProviderCircuitOpen(provider.id, timestamp)) {
        const health = getProviderHealth(provider.id, timestamp);
        const skipError = new Error(
          `Provider "${provider.id}" circuit open until ${new Date(health.circuitOpenUntil ?? timestamp).toISOString()}`,
        );
        failures.push({ providerId: provider.id, error: skipError });

        onMetric?.({
          type: "circuit_skipped",
          providerId: provider.id,
          openUntil: health.circuitOpenUntil ?? timestamp,
          health,
        });
        continue;
      }

      try {
        const result = await operation(provider);
        const success = recordProviderSuccess(provider.id, now());

        onMetric?.({
          type: "provider_success",
          providerId: provider.id,
          health: success.health,
        });

        if (success.circuitClosed) {
          onMetric?.({
            type: "circuit_closed",
            providerId: provider.id,
            health: success.health,
          });
        }

        return result;
      } catch (error) {
        failures.push({ providerId: provider.id, error });
        onProviderFailure?.(provider.id, error);

        const failure = recordProviderFailure(provider.id, error, now());
        onMetric?.({
          type: "provider_failure",
          providerId: provider.id,
          errorName: failure.errorName,
          message: getErrorMessage(error),
          health: failure.health,
        });

        if (failure.circuitOpened && failure.health.circuitOpenUntil !== null) {
          onMetric?.({
            type: "circuit_opened",
            providerId: provider.id,
            openUntil: failure.health.circuitOpenUntil,
            health: failure.health,
          });
        }
      }
    }

    throw new BtcProviderChainError(failures);
  }

  return {
    id: chainId || "composite",

    getCurrentPrice(): Promise<BtcProviderPrice> {
      return tryChain((provider) => provider.getCurrentPrice());
    },

    getCandles(interval: BtcCandleInterval, limit: number): Promise<BtcProviderCandle[]> {
      return tryChain((provider) => provider.getCandles(interval, limit));
    },
  };
}
