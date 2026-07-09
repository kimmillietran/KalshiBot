import { KALSHI_API_BASE } from "@/features/market-data/constants";
import { fetchWithTimeout } from "@/features/market-data/api/fetchWithTimeout";
import {
  kalshiMarketsResponseSchema,
  type KalshiMarket,
} from "@/features/market-data/schemas";
import { selectOpenMarket, selectUnopenedMarket } from "@/features/market-data/utils";

import type { ForwardCaptureMarketDiscoveryResult } from "./forwardQuoteCaptureTypes";

async function fetchSeriesMarkets(input: {
  seriesTicker: string;
  status: "open" | "unopened" | "closed";
  limit: number;
  fetchImpl: typeof fetch;
}): Promise<KalshiMarket[]> {
  const url = new URL(`${KALSHI_API_BASE}/markets`);
  url.searchParams.set("series_ticker", input.seriesTicker);
  url.searchParams.set("status", input.status);
  url.searchParams.set("limit", String(input.limit));

  const response = await fetchWithTimeout(url.toString(), {
    headers: { Accept: "application/json" },
    cache: "no-store",
    fetchImpl: input.fetchImpl,
  });

  if (!response.ok) {
    throw new Error(`Kalshi markets ${input.status} unavailable (${response.status})`);
  }

  const json: unknown = await response.json();
  const parsed = kalshiMarketsResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error("Invalid Kalshi markets response");
  }

  return parsed.data.markets;
}

function marketMetadataMaps(markets: readonly KalshiMarket[]) {
  const marketStatuses: Record<string, string> = {};
  const eventTickers: Record<string, string | null> = {};
  const closeTimes: Record<string, string | null> = {};

  for (const market of markets) {
    marketStatuses[market.ticker] = market.status;
    eventTickers[market.ticker] = market.event_ticker ?? null;
    closeTimes[market.ticker] = market.close_time ?? null;
  }

  return { marketStatuses, eventTickers, closeTimes };
}

export async function discoverCaptureMarkets(input: {
  seriesTicker: string;
  maxMarkets: number;
  marketTickerOverride?: string;
  fetchImpl?: typeof fetch;
  now?: Date;
}): Promise<ForwardCaptureMarketDiscoveryResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const now = input.now ?? new Date();

  if (input.marketTickerOverride) {
    return {
      attempted: true,
      succeeded: true,
      seriesTicker: input.seriesTicker,
      discoveredMarketCount: 1,
      selectedMarketTickers: [input.marketTickerOverride],
      marketStatuses: { [input.marketTickerOverride]: "override" },
      eventTickers: { [input.marketTickerOverride]: null },
      closeTimes: { [input.marketTickerOverride]: null },
      error: null,
    };
  }

  try {
    const openMarkets = await fetchSeriesMarkets({
      seriesTicker: input.seriesTicker,
      status: "open",
      limit: Math.max(input.maxMarkets * 4, 20),
      fetchImpl,
    });
    const unopenedMarkets = await fetchSeriesMarkets({
      seriesTicker: input.seriesTicker,
      status: "unopened",
      limit: Math.max(input.maxMarkets * 4, 20),
      fetchImpl,
    });

    const discovered = [...openMarkets, ...unopenedMarkets];
    const selectedOpen = selectOpenMarket(openMarkets, now.getTime());
    const selectedUnopened = selectUnopenedMarket(unopenedMarkets);
    const prioritized = [selectedOpen, selectedUnopened].filter(
      (market): market is KalshiMarket => market !== null,
    );

    const selectedMarketTickers = [
      ...new Set(prioritized.map((market) => market.ticker).slice(0, input.maxMarkets)),
    ];

    if (selectedMarketTickers.length === 0) {
      return {
        attempted: true,
        succeeded: false,
        seriesTicker: input.seriesTicker,
        discoveredMarketCount: discovered.length,
        selectedMarketTickers: [],
        marketStatuses: {},
        eventTickers: {},
        closeTimes: {},
        error: `No active markets found for series ${input.seriesTicker}`,
      };
    }

    const metadata = marketMetadataMaps(
      discovered.filter((market) => selectedMarketTickers.includes(market.ticker)),
    );

    return {
      attempted: true,
      succeeded: true,
      seriesTicker: input.seriesTicker,
      discoveredMarketCount: discovered.length,
      selectedMarketTickers,
      ...metadata,
      error: null,
    };
  } catch (error) {
    return {
      attempted: true,
      succeeded: false,
      seriesTicker: input.seriesTicker,
      discoveredMarketCount: 0,
      selectedMarketTickers: [],
      marketStatuses: {},
      eventTickers: {},
      closeTimes: {},
      error: error instanceof Error ? error.message : "Market discovery failed",
    };
  }
}

export async function discoverRolloverMarkets(input: {
  seriesTicker: string;
  maxMarkets: number;
  currentlySubscribed: readonly string[];
  fetchImpl?: typeof fetch;
  now?: Date;
}): Promise<{
  newTickers: string[];
  closedTickers: string[];
  discovery: ForwardCaptureMarketDiscoveryResult;
}> {
  const discovery = await discoverCaptureMarkets({
    seriesTicker: input.seriesTicker,
    maxMarkets: input.maxMarkets,
    fetchImpl: input.fetchImpl,
    now: input.now,
  });

  if (!discovery.succeeded) {
    return { newTickers: [], closedTickers: [], discovery };
  }

  const activeSet = new Set(discovery.selectedMarketTickers);
  const newTickers = discovery.selectedMarketTickers.filter(
    (ticker) => !input.currentlySubscribed.includes(ticker),
  );
  const closedTickers = input.currentlySubscribed.filter(
    (ticker) => !activeSet.has(ticker),
  );

  return { newTickers, closedTickers, discovery };
}
