import { describe, expect, it } from "vitest";

import { getBtcProviderMode } from "./config";

describe("getBtcProviderMode", () => {
  it("defaults to coinbase", () => {
    expect(getBtcProviderMode({})).toBe("coinbase");
    expect(getBtcProviderMode({ BTC_PROVIDER: "" })).toBe("coinbase");
    expect(getBtcProviderMode({ BTC_PROVIDER: "invalid" })).toBe("coinbase");
  });

  it("accepts coinbase, kraken, and auto", () => {
    expect(getBtcProviderMode({ BTC_PROVIDER: "kraken" })).toBe("kraken");
    expect(getBtcProviderMode({ BTC_PROVIDER: "AUTO" })).toBe("auto");
    expect(getBtcProviderMode({ BTC_PROVIDER: " coinbase " })).toBe("coinbase");
  });
});
