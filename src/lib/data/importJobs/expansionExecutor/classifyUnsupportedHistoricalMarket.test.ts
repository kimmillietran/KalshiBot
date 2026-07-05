import { describe, expect, it } from "vitest";

import fixture from "@/lib/data/importers/kalshi/fixtures/KXBTC15M-25DEC311900-00-market-responses.json";

import {
  buildUnsupportedHistoricalMarketSkipReason,
  classifyUnsupportedHistoricalMarket,
  countUnsupportedHistoricalMarketResults,
  formatUnsupportedHistoricalMarketFieldReason,
  isUnsupportedHistoricalMarketSkipReason,
} from "./classifyUnsupportedHistoricalMarket";

describe("classifyUnsupportedHistoricalMarket", () => {
  it("classifies supported markets when required wire fields are present", () => {
    const result = classifyUnsupportedHistoricalMarket({
      listMarketWire: fixture.listMarket,
      detailMarketWire: fixture.detailMarket,
    });

    expect(result.support).toBe("supported");
    expect(result.skipReason).toBeNull();
  });

  it("classifies unsupported markets when expiration_value is missing from API wires", () => {
    const result = classifyUnsupportedHistoricalMarket({
      listMarketWire: {
        ticker: fixture.ticker,
        open_time: fixture.listMarket.open_time,
        close_time: fixture.listMarket.close_time,
        expiration_value: "",
      },
      detailMarketWire: fixture.detailMarket,
    });

    expect(result.support).toBe("unsupported");
    expect(result.missingRequiredFields).toEqual(["expiration_value"]);
    expect(result.reason).toBe(
      formatUnsupportedHistoricalMarketFieldReason("expiration_value"),
    );
    expect(result.skipReason).toBe(
      buildUnsupportedHistoricalMarketSkipReason(["expiration_value"]),
    );
  });

  it("counts skipped unsupported markets in expansion results", () => {
    const skipReason = buildUnsupportedHistoricalMarketSkipReason(["expiration_value"]);
    const counts = countUnsupportedHistoricalMarketResults([
      {
        marketTicker: fixture.ticker,
        seriesTicker: "KXBTC15M",
        status: "skipped",
        configPath: null,
        importResultPath: null,
        errorMessage: null,
        skipReason,
        durationMs: 1,
      },
      {
        marketTicker: "OTHER",
        seriesTicker: "KXBTC15M",
        status: "imported",
        configPath: null,
        importResultPath: null,
        errorMessage: null,
        skipReason: null,
        durationMs: 1,
      },
    ]);

    expect(counts.unsupportedCount).toBe(1);
    expect(counts.skippedUnsupportedCount).toBe(1);
    expect(isUnsupportedHistoricalMarketSkipReason(skipReason)).toBe(true);
  });
});
