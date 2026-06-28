import {
  BTC_15M_SERIES_TICKER,
  KALSHI_API_BASE,
} from "../constants";
import { mapKalshiMarketToContractPricing } from "../pricing";
import {
  kalshiMarketsResponseSchema,
  type KalshiMarket,
} from "../schemas";
import { kalshiRestOrderbookSchema } from "../orderbook/schemas";
import type { OrderbookLevel } from "../orderbook/types";
import type { ActiveBtcMarket, MarketContractPricing } from "../types";
import {
  mapKalshiMarketToActiveBtc,
  selectOpenMarket,
  selectUnopenedMarket,
} from "../utils";
import { fetchWithTimeout, KalshiRequestTimeoutError } from "./fetchWithTimeout";

export type DiscoverActiveMarketResult =
  | { kind: "market"; market: ActiveBtcMarket; pricing: MarketContractPricing | null }
  | { kind: "no-market"; message: string };

type FetchKalshiMarketsOptions = {
  status: "open" | "unopened";
  limit?: number;
  fetchImpl?: typeof fetch;
};

export async function fetchKalshiMarkets({
  status,
  limit = 20,
  fetchImpl = fetch,
}: FetchKalshiMarketsOptions): Promise<KalshiMarket[]> {
  const url = new URL(`${KALSHI_API_BASE}/markets`);
  url.searchParams.set("series_ticker", BTC_15M_SERIES_TICKER);
  url.searchParams.set("status", status);
  url.searchParams.set("limit", String(limit));

  let res: Response;

  try {
    res = await fetchWithTimeout(url.toString(), {
      headers: { Accept: "application/json" },
      cache: "no-store",
      fetchImpl,
    });
  } catch (err) {
    if (err instanceof KalshiRequestTimeoutError) {
      console.error(`[kalshi] markets/${status} request timed out`);
      throw err;
    }
    throw err;
  }

  if (res.status === 429) {
    throw new Error("Kalshi rate limit exceeded");
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Kalshi markets ${status} unavailable (${res.status}): ${text || res.statusText}`,
    );
  }

  const json: unknown = await res.json();
  const parsed = kalshiMarketsResponseSchema.safeParse(json);

  if (!parsed.success) {
    throw new Error("Invalid Kalshi markets response");
  }

  return parsed.data.markets;
}

export type KalshiOrderbookSnapshot = {
  yesLevels: OrderbookLevel[];
  noLevels: OrderbookLevel[];
};

/** Server-side REST orderbook snapshot for initial state / resync / fallback. */
export async function fetchKalshiOrderbook(
  ticker: string,
  fetchImpl: typeof fetch = fetch,
): Promise<KalshiOrderbookSnapshot> {
  const url = `${KALSHI_API_BASE}/markets/${encodeURIComponent(ticker)}/orderbook`;

  let res: Response;

  try {
    res = await fetchWithTimeout(url.toString(), {
      headers: { Accept: "application/json" },
      cache: "no-store",
      fetchImpl,
    });
  } catch (err) {
    if (err instanceof KalshiRequestTimeoutError) {
      console.error(`[kalshi] orderbook/${ticker} request timed out`);
      throw err;
    }
    throw err;
  }

  if (res.status === 429) {
    throw new Error("Kalshi rate limit exceeded");
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Kalshi orderbook unavailable (${res.status}): ${text || res.statusText}`,
    );
  }

  const json: unknown = await res.json();
  const parsed = kalshiRestOrderbookSchema.safeParse(json);

  if (!parsed.success) {
    throw new Error("Invalid Kalshi orderbook response");
  }

  return {
    yesLevels: parsed.data.orderbook_fp.yes_dollars,
    noLevels: parsed.data.orderbook_fp.no_dollars,
  };
}

/** Server-side discovery: open market first, then earliest unopened slot. */
export async function discoverActiveBtcMarket(
  fetchImpl: typeof fetch = fetch,
  now: Date = new Date(),
): Promise<DiscoverActiveMarketResult> {
  const openMarkets = await fetchKalshiMarkets({ status: "open", fetchImpl });
  const selectedOpen = selectOpenMarket(openMarkets, now.getTime());

  if (selectedOpen) {
    return {
      kind: "market",
      market: mapKalshiMarketToActiveBtc(selectedOpen, now),
      pricing: mapKalshiMarketToContractPricing(selectedOpen, now),
    };
  }

  const unopenedMarkets = await fetchKalshiMarkets({
    status: "unopened",
    fetchImpl,
  });
  const selectedUnopened = selectUnopenedMarket(unopenedMarkets);

  if (selectedUnopened) {
    return {
      kind: "market",
      market: mapKalshiMarketToActiveBtc(selectedUnopened, now),
      pricing: mapKalshiMarketToContractPricing(selectedUnopened, now),
    };
  }

  return {
    kind: "no-market",
    message: "No active BTC 15m market",
  };
}

export { KalshiRequestTimeoutError };
