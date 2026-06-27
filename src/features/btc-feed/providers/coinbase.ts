import { z } from "zod";

import {
  BtcProviderMalformedResponseError,
  BtcProviderNetworkError,
  BtcProviderRateLimitError,
  BtcProviderTimeoutError,
  BtcProviderUnavailableError,
} from "./errors";
import { fetchWithTimeout } from "./fetchWithTimeout";
import { mapCoinbaseCandleRows, parseCoinbaseCandlesJson } from "./coinbaseCandles";
import type {
  BtcCandleInterval,
  BtcPriceProvider,
  BtcProviderCandle,
  BtcProviderPrice,
} from "./interface";

/** Coinbase Exchange public REST base (no API key). */
export const COINBASE_EXCHANGE_API_BASE = "https://api.exchange.coinbase.com";

const PRODUCT_ID = "BTC-USD";

const coinbaseStatsSchema = z.object({
  open: z.string(),
  last: z.string(),
});

const INTERVAL_GRANULARITY: Record<BtcCandleInterval, number> = {
  "1m": 60,
};

function parsePositiveNumber(value: string, field: string): number {
  const parsed = Number.parseFloat(value);
  if (Number.isNaN(parsed)) {
    throw new BtcProviderMalformedResponseError(
      `Coinbase ${field} is not a valid number`,
    );
  }
  return parsed;
}

async function handleUpstreamResponse(res: Response, context: string): Promise<Response> {
  if (res.status === 429) {
    throw new BtcProviderRateLimitError(`Coinbase ${context} rate limit exceeded`);
  }

  if (res.status >= 500) {
    throw new BtcProviderUnavailableError(
      res.status,
      `Coinbase ${context} unavailable (${res.status})`,
    );
  }

  if (res.status === 451) {
    throw new BtcProviderUnavailableError(
      451,
      `Coinbase ${context} unavailable in this region (451)`,
    );
  }

  if (!res.ok) {
    throw new BtcProviderUnavailableError(
      res.status,
      `Coinbase ${context} request failed (${res.status})`,
    );
  }

  return res;
}

export type CoinbaseProviderOptions = {
  fetchImpl?: typeof fetch;
};

/**
 * Coinbase Exchange BTC-USD provider.
 *
 * 24h change: derived from `GET /products/BTC-USD/stats` — `last` minus rolling
 * `open`. Coinbase does not expose a Binance-style `priceChangePercent` field;
 * we compute percent from those two values.
 */
export function createCoinbaseBtcProvider(
  options: CoinbaseProviderOptions = {},
): BtcPriceProvider {
  const resolveFetch = () => options.fetchImpl ?? globalThis.fetch;

  return {
    id: "coinbase",

    async getCurrentPrice(): Promise<BtcProviderPrice> {
      const url = `${COINBASE_EXCHANGE_API_BASE}/products/${PRODUCT_ID}/stats`;

      let res: Response;
      try {
        res = await fetchWithTimeout(url, {
          headers: { Accept: "application/json" },
          cache: "no-store",
          fetchImpl: resolveFetch(),
        });
      } catch (err) {
        if (err instanceof BtcProviderTimeoutError) throw err;
        throw new BtcProviderNetworkError(
          err instanceof Error ? err.message : "Coinbase stats network error",
        );
      }

      await handleUpstreamResponse(res, "stats");

      let json: unknown;
      try {
        json = await res.json();
      } catch {
        throw new BtcProviderMalformedResponseError("Coinbase stats response is not JSON");
      }

      const parsed = coinbaseStatsSchema.safeParse(json);
      if (!parsed.success) {
        throw new BtcProviderMalformedResponseError("Coinbase stats payload missing fields");
      }

      const open = parsePositiveNumber(parsed.data.open, "open");
      const last = parsePositiveNumber(parsed.data.last, "last");
      const change24h = last - open;
      const change24hPercent = open === 0 ? 0 : (change24h / open) * 100;

      return {
        price: last,
        change24h,
        change24hPercent,
        updatedAt: new Date().toISOString(),
      };
    },

    async getCandles(
      interval: BtcCandleInterval,
      limit: number,
    ): Promise<BtcProviderCandle[]> {
      const granularity = INTERVAL_GRANULARITY[interval];
      const url = new URL(
        `${COINBASE_EXCHANGE_API_BASE}/products/${PRODUCT_ID}/candles`,
      );
      url.searchParams.set("granularity", String(granularity));
      url.searchParams.set("limit", String(limit));

      let res: Response;
      try {
        res = await fetchWithTimeout(url.toString(), {
          headers: { Accept: "application/json" },
          cache: "no-store",
          fetchImpl: resolveFetch(),
        });
      } catch (err) {
        if (err instanceof BtcProviderTimeoutError) throw err;
        throw new BtcProviderNetworkError(
          err instanceof Error ? err.message : "Coinbase candles network error",
        );
      }

      await handleUpstreamResponse(res, "candles");

      let json: unknown;
      try {
        json = await res.json();
      } catch {
        throw new BtcProviderMalformedResponseError(
          "Coinbase candles response is not JSON",
        );
      }

      const parsed = parseCoinbaseCandlesJson(json);
      return mapCoinbaseCandleRows(parsed);
    },
  };
}

/** Default Coinbase provider instance for server/BFF use. */
export const coinbaseBtcProvider = createCoinbaseBtcProvider();
