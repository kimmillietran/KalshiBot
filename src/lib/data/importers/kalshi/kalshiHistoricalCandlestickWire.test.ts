import { describe, expect, it } from "vitest";

import { stableStringify } from "@/lib/trading/config/hashConfig";

import {
  buildKalshiHistoricalCandlestickWire,
  formatKalshiHistoricalCandlestickMissingPriceDiagnostic,
  hasRecoverableKalshiHistoricalCandlestickPrice,
  resolveKalshiHistoricalCandlestickPriceClose,
} from "./kalshiHistoricalCandlestickWire";

describe("kalshiHistoricalCandlestickWire", () => {
  it("omits price from wire when trade close is unavailable", () => {
    const wire = buildKalshiHistoricalCandlestickWire({
      endPeriodTs: 1_735_670_400,
      volume: "0.00",
      openInterest: "12.00",
      priceClose: null,
    });

    expect(wire).toEqual({
      end_period_ts: 1_735_670_400,
      volume: "0.00",
      open_interest: "12.00",
    });
    expect("price" in wire).toBe(false);
    expect(stableStringify(wire)).not.toContain("undefined");
  });

  it("includes price.close when trade close is available", () => {
    const wire = buildKalshiHistoricalCandlestickWire({
      endPeriodTs: 1_735_670_460,
      volume: "12.00",
      openInterest: "45.00",
      priceClose: "0.5500",
    });

    expect(wire.price).toEqual({ close: "0.5500" });
  });

  it("treats blank price.close as missing", () => {
    expect(
      resolveKalshiHistoricalCandlestickPriceClose({
        price: { close: "   " },
      }),
    ).toBeNull();
    expect(
      hasRecoverableKalshiHistoricalCandlestickPrice({
        priceClose: "  ",
      }),
    ).toBe(false);
  });

  it("formats missing-price diagnostics with ticker and timestamp", () => {
    expect(
      formatKalshiHistoricalCandlestickMissingPriceDiagnostic({
        ticker: "KXBTC15M-25DEC311900-00",
        endPeriodTs: 1_735_670_400,
      }),
    ).toContain("KXBTC15M-25DEC311900-00");
    expect(
      formatKalshiHistoricalCandlestickMissingPriceDiagnostic({
        ticker: "KXBTC15M-25DEC311900-00",
        endPeriodTs: 1_735_670_400,
      }),
    ).toContain("price.close");
  });
});
