import { describe, expect, it } from "vitest";

import {
  assessLiquidityQuality,
  computeMidCents,
  computeSpreadCents,
  formatContractVolume,
  mapKalshiMarketToContractPricing,
  mapPricingToOddsViews,
  parseKalshiDollarToCents,
} from "./pricing";

const pricedMarket = {
  ticker: "KXBTC15M-26JUN261930-30",
  title: "BTC price up in next 15 mins?",
  status: "active",
  open_time: "2026-06-26T23:15:00Z",
  close_time: "2026-06-26T23:30:00Z",
  yes_bid_dollars: "0.1500",
  yes_ask_dollars: "0.1600",
  no_bid_dollars: "0.8400",
  no_ask_dollars: "0.8500",
  last_price_dollars: "0.1600",
  volume_fp: "503000",
  liquidity_dollars: "75000.00",
};

describe("parseKalshiDollarToCents", () => {
  it("parses dollar strings to whole cents", () => {
    expect(parseKalshiDollarToCents("0.1500")).toBe(15);
    expect(parseKalshiDollarToCents("0.8450")).toBe(85);
  });

  it("returns null for missing or invalid values", () => {
    expect(parseKalshiDollarToCents(undefined)).toBeNull();
    expect(parseKalshiDollarToCents("")).toBeNull();
    expect(parseKalshiDollarToCents("bad")).toBeNull();
  });
});

describe("computeMidCents", () => {
  it("averages bid and ask", () => {
    expect(computeMidCents(15, 16)).toBe(16);
    expect(computeMidCents(84, 85)).toBe(85);
  });

  it("returns null when bid or ask is missing", () => {
    expect(computeMidCents(null, 16)).toBeNull();
    expect(computeMidCents(15, null)).toBeNull();
  });
});

describe("computeSpreadCents", () => {
  it("subtracts bid from ask", () => {
    expect(computeSpreadCents(15, 16)).toBe(1);
  });

  it("returns null when bid or ask is missing", () => {
    expect(computeSpreadCents(null, 16)).toBeNull();
  });
});

describe("formatContractVolume", () => {
  it("formats large volume_fp values", () => {
    expect(formatContractVolume("503000", undefined)).toBe("$503K");
  });

  it("falls back to liquidity dollars", () => {
    expect(formatContractVolume(undefined, "75000.00")).toBe("$75K");
  });

  it("returns em dash when both are missing", () => {
    expect(formatContractVolume(undefined, undefined)).toBe("—");
  });
});

describe("assessLiquidityQuality", () => {
  it("returns Good for healthy depth and tight spread", () => {
    expect(assessLiquidityQuality("75000.00", 1)).toBe("Good");
  });

  it("returns Poor for sparse markets without depth", () => {
    expect(assessLiquidityQuality(undefined, 8)).toBe("Poor");
  });
});

describe("mapKalshiMarketToContractPricing", () => {
  it("maps YES/NO bid/ask/mid/spread and volume", () => {
    const pricing = mapKalshiMarketToContractPricing(
      pricedMarket,
      new Date("2026-06-26T23:20:00.000Z"),
    );

    expect(pricing.yes).toEqual({
      bidCents: 15,
      askCents: 16,
      midCents: 16,
      lastCents: 16,
      spreadCents: 1,
    });
    expect(pricing.no.lastCents).toBeNull();
    expect(pricing.volumeLabel).toBe("$503K");
    expect(pricing.liquidityQuality).toBe("Good");
    expect(pricing.source).toBe("kalshi");
  });

  it("handles missing pricing fields without throwing", () => {
    const pricing = mapKalshiMarketToContractPricing({
      ticker: "KXBTC15M-SPARSE",
      title: "Sparse",
      status: "active",
      open_time: "2026-06-26T23:15:00Z",
      close_time: "2026-06-26T23:30:00Z",
    });

    expect(pricing.yes.midCents).toBeNull();
    expect(pricing.no.midCents).toBeNull();
    expect(pricing.volumeLabel).toBe("—");
    expect(pricing.liquidityQuality).toBe("Poor");
  });
});

describe("mapPricingToOddsViews", () => {
  it("maps YES to UP and NO to DOWN contract cards", () => {
    const pricing = mapKalshiMarketToContractPricing(pricedMarket);
    const views = mapPricingToOddsViews(pricing);

    expect(views.up.price).toBe(16);
    expect(views.up.bid).toBe(15);
    expect(views.up.ask).toBe(16);
    expect(views.down.price).toBe(85);
    expect(views.down.volume).toBe("$503K");
  });
});
