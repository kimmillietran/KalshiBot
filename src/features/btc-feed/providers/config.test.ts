import { describe, expect, it } from "vitest";

import { getBtcProviderMode } from "./config";

describe("getBtcProviderMode", () => {
  it("defaults to auto when unset or invalid", () => {
    expect(getBtcProviderMode({})).toBe("auto");
    expect(getBtcProviderMode({ BTC_PROVIDER: "" })).toBe("auto");
    expect(getBtcProviderMode({ BTC_PROVIDER: "invalid" })).toBe("auto");
  });

  it("accepts coinbase, kraken, and auto", () => {
    expect(getBtcProviderMode({ BTC_PROVIDER: "coinbase" })).toBe("coinbase");
    expect(getBtcProviderMode({ BTC_PROVIDER: "kraken" })).toBe("kraken");
    expect(getBtcProviderMode({ BTC_PROVIDER: "AUTO" })).toBe("auto");
    expect(getBtcProviderMode({ BTC_PROVIDER: " coinbase " })).toBe("coinbase");
  });
});
