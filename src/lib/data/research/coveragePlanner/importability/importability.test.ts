import { describe, expect, it } from "vitest";

import { classifyExpansionImportMarketOutcome } from "./classifyExpansionImportMarketOutcome";
import { parseExpansionMarketCalendarMonth } from "./parseExpansionMarketCalendarMonth";

describe("parseExpansionMarketCalendarMonth", () => {
  it("parses Kalshi historical tickers into YYYY-MM months", () => {
    expect(parseExpansionMarketCalendarMonth("KXBTC15M-26JAN151215-00")).toBe("2026-01");
    expect(parseExpansionMarketCalendarMonth("KXBTC15M-26MAR010000-00")).toBe("2026-03");
  });
});

describe("classifyExpansionImportMarketOutcome", () => {
  it("marks compatibility failures as unsupported import outcomes", () => {
    expect(
      classifyExpansionImportMarketOutcome({
        status: "failed",
        errorMessage: "Kalshi historical market response missing required fields: expiration_value",
        skipReason: null,
      }),
    ).toBe("compatibility-failure");
  });

  it("marks successful imports separately from planned dry-run rows", () => {
    expect(
      classifyExpansionImportMarketOutcome({
        status: "imported",
        errorMessage: null,
        skipReason: null,
      }),
    ).toBe("successful-import");
    expect(
      classifyExpansionImportMarketOutcome({
        status: "planned",
        errorMessage: null,
        skipReason: null,
      }),
    ).toBe("planned");
  });
});
