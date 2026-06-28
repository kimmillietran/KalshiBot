import { kalshiRestOrderbookSchema } from "../orderbook/schemas";
import type { OrderbookLevel } from "../orderbook/types";

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Kalshi orderbook BFF ${res.status}: ${text || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export type KalshiOrderbookApiResponse = {
  ticker: string;
  yesLevels: OrderbookLevel[];
  noLevels: OrderbookLevel[];
};

/** Fetch normalized Kalshi orderbook snapshot via the app BFF. */
export async function fetchKalshiOrderbook(
  ticker: string,
): Promise<KalshiOrderbookApiResponse> {
  const url = new URL("/api/kalshi/markets/orderbook", window.location.origin);
  url.searchParams.set("ticker", ticker);

  const res = await fetch(url.toString(), { cache: "no-store" });
  const data = await parseJson<KalshiOrderbookApiResponse>(res);

  const parsed = kalshiRestOrderbookSchema.safeParse({
    orderbook_fp: {
      yes_dollars: data.yesLevels,
      no_dollars: data.noLevels,
    },
  });

  if (!parsed.success || data.ticker !== ticker) {
    throw new Error("Invalid orderbook response from BFF");
  }

  return data;
}
