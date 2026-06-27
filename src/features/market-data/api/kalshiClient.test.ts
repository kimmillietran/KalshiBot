import { afterEach, describe, expect, it, vi } from "vitest";

import { MarketLifecycle } from "../types";
import { fetchActiveBtcMarket } from "./kalshiClient";

describe("fetchActiveBtcMarket", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns parsed BFF payload on success", async () => {
    const payload = {
      market: {
        ticker: "KXBTC15M-26JUN261930-30",
        title: "BTC price up in next 15 mins?",
        targetPrice: 59990.31,
        lifecycle: MarketLifecycle.ACTIVE,
        openTime: "2026-06-26T23:15:00Z",
        closeTime: "2026-06-26T23:30:00Z",
        timeRemainingMs: 600_000,
        updatedAt: "2026-06-26T23:20:00.000Z",
        source: "kalshi" as const,
        isFallback: false,
      },
      pricing: {
        yes: {
          bidCents: 15,
          askCents: 16,
          midCents: 16,
          lastCents: 16,
          spreadCents: 1,
        },
        no: {
          bidCents: 84,
          askCents: 85,
          midCents: 85,
          lastCents: null,
          spreadCents: 1,
        },
        volumeLabel: "$503K",
        liquidityQuality: "Good" as const,
        updatedAt: "2026-06-26T23:20:00.000Z",
        isFallback: false,
        source: "kalshi" as const,
      },
      noMarket: false,
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: async () => payload,
        } as Response),
      ),
    );

    await expect(fetchActiveBtcMarket()).resolves.toEqual(payload);
  });

  it("throws when BFF response fails validation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ market: null, pricing: null, noMarket: "yes" }),
        } as Response),
      ),
    );

    await expect(fetchActiveBtcMarket()).rejects.toThrow(
      "Invalid active market response from BFF",
    );
  });

  it("throws when BFF returns non-OK status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 502,
          statusText: "Bad Gateway",
          text: async () => "upstream error",
        } as Response),
      ),
    );

    await expect(fetchActiveBtcMarket()).rejects.toThrow("Kalshi BFF 502");
  });
});
