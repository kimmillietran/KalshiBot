import { createCoinbaseBtcProvider } from "./coinbase";
import { createFallbackBtcPriceProvider } from "./fallback";
import type { BtcPriceProvider } from "./interface";
import { createKrakenBtcProvider } from "./kraken";

export type BtcProviderId = "coinbase" | "kraken" | "fallback";

export type BtcProviderFactory = () => BtcPriceProvider;

const registry = new Map<BtcProviderId, BtcProviderFactory>([
  ["coinbase", () => createCoinbaseBtcProvider()],
  ["kraken", () => createKrakenBtcProvider()],
  ["fallback", () => createFallbackBtcPriceProvider()],
]);

export function registerBtcProvider(
  id: BtcProviderId,
  factory: BtcProviderFactory,
): void {
  registry.set(id, factory);
}

export function createRegisteredBtcProvider(id: BtcProviderId): BtcPriceProvider {
  const factory = registry.get(id);
  if (!factory) {
    throw new Error(`Unknown BTC provider: ${id}`);
  }
  return factory();
}

export function listRegisteredBtcProviderIds(): BtcProviderId[] {
  return [...registry.keys()];
}
