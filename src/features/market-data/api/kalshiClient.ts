import { activeBtcMarketApiResponseSchema } from "../schemas";
import type { ActiveBtcMarketApiResponse } from "../types";

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Kalshi BFF ${res.status}: ${text || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

/** Fetch normalized active BTC market via the app BFF. */
export async function fetchActiveBtcMarket(): Promise<ActiveBtcMarketApiResponse> {
  const res = await fetch("/api/kalshi/markets/active", { cache: "no-store" });
  const data = await parseJson<ActiveBtcMarketApiResponse>(res);

  const parsed = activeBtcMarketApiResponseSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("Invalid active market response from BFF");
  }

  return parsed.data;
}
