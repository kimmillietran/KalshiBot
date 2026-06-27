import { BTC_CANDLES_LIMIT } from "../constants";
import type { BtcCandlesResponse, BtcPriceResponse } from "../types";
import {
  BtcProviderMalformedResponseError,
  BtcProviderNetworkError,
  BtcProviderRateLimitError,
  BtcProviderTimeoutError,
  BtcProviderUnavailableError,
  getDefaultBtcProvider,
  type BtcPriceProvider,
} from "../providers";

export {
  BtcProviderMalformedResponseError,
  BtcProviderNetworkError,
  BtcProviderRateLimitError,
  BtcProviderTimeoutError,
  BtcProviderUnavailableError,
};

/** Server-side BTC spot fetch via the configured provider. */
export async function fetchBtcSpotPrice(
  provider: BtcPriceProvider = getDefaultBtcProvider(),
): Promise<BtcPriceResponse> {
  return provider.getCurrentPrice();
}

/** Server-side 1-minute candle history via the configured provider. */
export async function fetchBtcCandleHistory(
  provider: BtcPriceProvider = getDefaultBtcProvider(),
): Promise<BtcCandlesResponse> {
  const candles = await provider.getCandles("1m", BTC_CANDLES_LIMIT);
  return { candles };
}
