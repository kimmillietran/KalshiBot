import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BtcProviderChainError,
  BtcProviderMalformedResponseError,
  BtcProviderTimeoutError,
  BtcProviderUnavailableError,
} from "./errors";
import { createCompositeBtcPriceProvider } from "./composite";
import { createFallbackBtcPriceProvider } from "./fallback";
import type { BtcPriceProvider } from "./interface";
import {
  configureProviderHealth,
  getProviderHealth,
  isProviderCircuitOpen,
  recordProviderFailure,
  resetProviderHealth,
} from "./providerHealth";

function createMockProvider(
  id: string,
  handlers: { price?: () => Promise<unknown> },
): BtcPriceProvider {
  return {
    id,
    getCurrentPrice: vi.fn(handlers.price ?? (async () => ({}))),
    getCandles: vi.fn(async () => []),
  };
}

const krakenPrice = {
  price: 65_000,
  change24h: 200,
  change24hPercent: 0.3,
  updatedAt: "2026-06-26T12:00:00.000Z",
};

afterEach(() => {
  resetProviderHealth();
});

describe("createCompositeBtcPriceProvider", () => {
  it("returns first successful provider in chain order", async () => {
    const coinbase = createMockProvider("coinbase", {
      price: async () => {
        throw new BtcProviderUnavailableError(503, "down");
      },
    });
    const kraken = createMockProvider("kraken", {
      price: async () => krakenPrice,
    });

    const composite = createCompositeBtcPriceProvider([coinbase, kraken]);
    const result = await composite.getCurrentPrice();

    expect(result).toEqual(krakenPrice);
    expect(coinbase.getCurrentPrice).toHaveBeenCalledOnce();
    expect(kraken.getCurrentPrice).toHaveBeenCalledOnce();
  });

  it("failovers from Coinbase timeout to Kraken", async () => {
    const coinbase = createMockProvider("coinbase", {
      price: async () => {
        throw new BtcProviderTimeoutError();
      },
    });
    const kraken = createMockProvider("kraken", {
      price: async () => krakenPrice,
    });

    const composite = createCompositeBtcPriceProvider([coinbase, kraken]);
    await expect(composite.getCurrentPrice()).resolves.toEqual(krakenPrice);
  });

  it("failovers from Coinbase malformed response to Kraken", async () => {
    const coinbase = createMockProvider("coinbase", {
      price: async () => {
        throw new BtcProviderMalformedResponseError();
      },
    });
    const kraken = createMockProvider("kraken", {
      price: async () => krakenPrice,
    });

    const composite = createCompositeBtcPriceProvider([coinbase, kraken]);
    await expect(composite.getCurrentPrice()).resolves.toEqual(krakenPrice);
  });

  it("falls through to fallback when upstream providers fail", async () => {
    const coinbase = createMockProvider("coinbase", {
      price: async () => {
        throw new BtcProviderTimeoutError();
      },
    });
    const kraken = createMockProvider("kraken", {
      price: async () => {
        throw new BtcProviderMalformedResponseError();
      },
    });
    const fallback = createFallbackBtcPriceProvider();

    const composite = createCompositeBtcPriceProvider([coinbase, kraken, fallback]);
    const result = await composite.getCurrentPrice();

    expect(result.price).toBeGreaterThan(0);
  });

  it("throws BtcProviderChainError when every provider fails", async () => {
    const coinbase = createMockProvider("coinbase", {
      price: async () => {
        throw new BtcProviderUnavailableError(503, "down");
      },
    });
    const kraken = createMockProvider("kraken", {
      price: async () => {
        throw new BtcProviderTimeoutError();
      },
    });

    const composite = createCompositeBtcPriceProvider([coinbase, kraken]);

    await expect(composite.getCurrentPrice()).rejects.toBeInstanceOf(BtcProviderChainError);
  });

  it("uses provider id order in composite id", () => {
    const composite = createCompositeBtcPriceProvider([
      createMockProvider("coinbase", {}),
      createMockProvider("kraken", {}),
      createFallbackBtcPriceProvider(),
    ]);

    expect(composite.id).toBe("coinbase→kraken→fallback");
  });

  it("emits metrics on failure and success", async () => {
    const onMetric = vi.fn();
    const coinbase = createMockProvider("coinbase", {
      price: async () => {
        throw new BtcProviderUnavailableError(503, "down");
      },
    });
    const kraken = createMockProvider("kraken", {
      price: async () => krakenPrice,
    });

    const composite = createCompositeBtcPriceProvider([coinbase, kraken], { onMetric });
    await composite.getCurrentPrice();

    expect(onMetric).toHaveBeenCalledWith(
      expect.objectContaining({ type: "provider_failure", providerId: "coinbase" }),
    );
    expect(onMetric).toHaveBeenCalledWith(
      expect.objectContaining({ type: "provider_success", providerId: "kraken" }),
    );
  });

  it("skips providers with open circuit", async () => {
    configureProviderHealth({ failureThreshold: 1, cooldownMs: 60_000 });
    const now = vi.fn(() => 10_000);

    const coinbase = createMockProvider("coinbase", {
      price: async () => krakenPrice,
    });
    const kraken = createMockProvider("kraken", {
      price: async () => krakenPrice,
    });

    recordProviderFailure("coinbase", new Error("fail"), 9_000);
    expect(isProviderCircuitOpen("coinbase", 10_000)).toBe(true);

    const onMetric = vi.fn();
    const composite = createCompositeBtcPriceProvider([coinbase, kraken], {
      onMetric,
      now,
    });

    await composite.getCurrentPrice();

    expect(coinbase.getCurrentPrice).not.toHaveBeenCalled();
    expect(kraken.getCurrentPrice).toHaveBeenCalledOnce();
    expect(onMetric).toHaveBeenCalledWith(
      expect.objectContaining({ type: "circuit_skipped", providerId: "coinbase" }),
    );
  });

  it("records health on success after failures", async () => {
    const coinbase = createMockProvider("coinbase", {
      price: async () => {
        throw new BtcProviderUnavailableError(503, "down");
      },
    });
    const kraken = createMockProvider("kraken", {
      price: async () => krakenPrice,
    });

    const composite = createCompositeBtcPriceProvider([coinbase, kraken]);
    await composite.getCurrentPrice();

    expect(getProviderHealth("coinbase").failureCount).toBe(1);
    expect(getProviderHealth("kraken").successCount).toBe(1);
  });
});
