import { afterEach, describe, expect, it, vi } from "vitest";

import { createCoinbaseBtcProvider } from "./coinbase";
import {
  createBtcProvider,
  getDefaultBtcProvider,
  resetDefaultBtcProviderCache,
  resolveBtcProvider,
} from "./index";
import {
  createRegisteredBtcProvider,
  listRegisteredBtcProviderIds,
  registerBtcProvider,
} from "./registry";
import type { BtcPriceProvider } from "./interface";

afterEach(() => {
  registerBtcProvider("coinbase", () => createCoinbaseBtcProvider());
  resetDefaultBtcProviderCache();
});

describe("resolveBtcProvider", () => {
  it("returns coinbase by default", () => {
    const provider = resolveBtcProvider({});
    expect(provider.id).toBe("coinbase");
  });

  it("returns kraken when configured", () => {
    const provider = resolveBtcProvider({ BTC_PROVIDER: "kraken" });
    expect(provider.id).toBe("kraken");
  });

  it("returns composite auto chain", () => {
    const provider = resolveBtcProvider({ BTC_PROVIDER: "auto" });
    expect(provider.id).toBe("coinbase→kraken→fallback");
  });

  it("caches default provider until reset", () => {
    const first = getDefaultBtcProvider();
    const second = getDefaultBtcProvider();
    expect(first).toBe(second);

    resetDefaultBtcProviderCache();
    expect(getDefaultBtcProvider()).not.toBe(first);
  });
});

describe("registry", () => {
  it("lists registered provider ids", () => {
    expect(listRegisteredBtcProviderIds()).toEqual([
      "coinbase",
      "kraken",
      "fallback",
    ]);
  });

  it("allows test overrides via registerBtcProvider", async () => {
    const stub: BtcPriceProvider = {
      id: "coinbase",
      getCurrentPrice: vi.fn(async () => ({
        price: 1,
        change24h: 0,
        change24hPercent: 0,
        updatedAt: "2026-01-01T00:00:00.000Z",
      })),
      getCandles: vi.fn(async () => []),
    };

    registerBtcProvider("coinbase", () => stub);
    const provider = createBtcProvider("coinbase");
    await provider.getCurrentPrice();
    expect(stub.getCurrentPrice).toHaveBeenCalled();
  });
});

describe("createRegisteredBtcProvider", () => {
  it("creates fallback provider", () => {
    const provider = createRegisteredBtcProvider("fallback");
    expect(provider.id).toBe("fallback");
  });
});
