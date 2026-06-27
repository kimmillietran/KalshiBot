import type { BtcPriceProvider } from "./interface";

/**
 * Kraken BTC/USD provider stub — implement in a future milestone when
 * multi-provider failover is required beyond Coinbase.
 */
export function createKrakenBtcProvider(): BtcPriceProvider {
  return {
    id: "kraken",

    async getCurrentPrice() {
      throw new Error("Kraken BTC provider is not implemented");
    },

    async getCandles() {
      throw new Error("Kraken BTC provider is not implemented");
    },
  };
}
