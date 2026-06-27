import { describe, expect, it, vi } from "vitest";

import type { BtcPriceProvider } from "../providers/interface";
import { fetchBtcCandleHistory, fetchBtcSpotPrice } from "./btcServer";

const mockProvider: BtcPriceProvider = {
  id: "mock",
  getCurrentPrice: vi.fn(async () => ({
    price: 64_250.32,
    change24h: 250.32,
    change24hPercent: 0.39,
    updatedAt: "2026-06-26T12:00:00.000Z",
  })),
  getCandles: vi.fn(async () => [
    {
      timestamp: 1,
      time: "12:00",
      open: 64_000,
      high: 64_300,
      low: 63_900,
      close: 64_250.32,
    },
  ]),
};

describe("btcServer", () => {
  it("fetchBtcSpotPrice delegates to the provider", async () => {
    const result = await fetchBtcSpotPrice(mockProvider);
    expect(result.price).toBe(64_250.32);
    expect(mockProvider.getCurrentPrice).toHaveBeenCalled();
  });

  it("fetchBtcCandleHistory wraps provider candles", async () => {
    const result = await fetchBtcCandleHistory(mockProvider);
    expect(result.candles).toHaveLength(1);
    expect(result.candles[0].close).toBe(64_250.32);
    expect(mockProvider.getCandles).toHaveBeenCalledWith("1m", 30);
  });
});
