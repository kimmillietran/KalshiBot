import type { BtcCandlesResponse, BtcPriceResponse } from "../types";

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`BTC API ${res.status}: ${text || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

/** Fetch live BTC/USD spot + 24h change via the app BFF. */
export async function fetchBtcPrice(): Promise<BtcPriceResponse> {
  const res = await fetch("/api/btc/price", { cache: "no-store" });
  return parseJson<BtcPriceResponse>(res);
}

/** Fetch recent 1-minute BTC candles via the app BFF. */
export async function fetchBtcCandles(): Promise<BtcCandlesResponse> {
  const res = await fetch("/api/btc/candles", { cache: "no-store" });
  return parseJson<BtcCandlesResponse>(res);
}
