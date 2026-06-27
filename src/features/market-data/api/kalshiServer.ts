import {
  BTC_15M_SERIES_TICKER,
  KALSHI_API_BASE,
} from "../constants";
import {
  kalshiMarketsResponseSchema,
  type KalshiMarket,
} from "../schemas";
import {
  mapKalshiMarketToActiveBtc,
  selectOpenMarket,
  selectUnopenedMarket,
} from "../utils";
import type { ActiveBtcMarket } from "../types";
import { fetchWithTimeout, KalshiRequestTimeoutError } from "./fetchWithTimeout";

export type DiscoverActiveMarketResult =
  | { kind: "market"; market: ActiveBtcMarket }
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
    };
  }

  return {
    kind: "no-market",
    message: "No active BTC 15m market",
  };
}

export { KalshiRequestTimeoutError };
