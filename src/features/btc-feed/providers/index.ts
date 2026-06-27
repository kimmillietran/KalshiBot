import { createCoinbaseBtcProvider, coinbaseBtcProvider } from "./coinbase";
import type { BtcPriceProvider } from "./interface";
import { createKrakenBtcProvider } from "./kraken";

export type { BtcCandleInterval, BtcPriceProvider, BtcProviderCandle, BtcProviderPrice } from "./interface";
export {
  BtcProviderMalformedResponseError,
  BtcProviderNetworkError,
  BtcProviderRateLimitError,
  BtcProviderTimeoutError,
  BtcProviderUnavailableError,
} from "./errors";
export { createCoinbaseBtcProvider, coinbaseBtcProvider, COINBASE_EXCHANGE_API_BASE } from "./coinbase";
export { createKrakenBtcProvider } from "./kraken";
export { fetchWithTimeout } from "./fetchWithTimeout";

/** Active BTC market-data provider for server/BFF routes. */
export function getDefaultBtcProvider(): BtcPriceProvider {
  return coinbaseBtcProvider;
}

/** Factory for tests and future provider switching via env/config. */
export function createBtcProvider(id: "coinbase" | "kraken" = "coinbase"): BtcPriceProvider {
  if (id === "kraken") return createKrakenBtcProvider();
  return createCoinbaseBtcProvider();
}
