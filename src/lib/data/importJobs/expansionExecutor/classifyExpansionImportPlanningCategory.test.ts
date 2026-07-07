import { describe, expect, it } from "vitest";

import { classifyExpansionImportPlanningCategory } from "./classifyExpansionImportPlanningCategory";
import type { ExpansionDiscoveredMarket } from "./expansionExecutorTypes";
import type { ExpansionImportPlanningHistory } from "./expansionImportSelectionTypes";

function createMarket(
  overrides: Partial<ExpansionDiscoveredMarket> & Pick<ExpansionDiscoveredMarket, "marketTicker">,
): ExpansionDiscoveredMarket {
  const openTime = overrides.openTime ?? "2026-01-15T12:00:00.000Z";
  const closeTime = overrides.closeTime ?? "2026-01-15T12:15:00.000Z";
  const expirationValue = overrides.expirationValue ?? "60010.25";

  return {
    seriesTicker: "KXBTC15M",
    eventTicker: "KXBTC15M-26JAN151215",
    status: "finalized",
    openTime,
    closeTime,
    settlementTime: null,
    expirationValue,
    title: null,
    subtitle: null,
    listMarketWire: {
      ticker: overrides.marketTicker,
      event_ticker: "KXBTC15M-26JAN151215",
      series_ticker: "KXBTC15M",
      status: "finalized",
      open_time: openTime,
      close_time: closeTime,
      expiration_value: expirationValue,
    },
    provenance: {
      source: "kalshi-historical-api",
      fetchedAt: "2026-07-04T04:00:00.000Z",
      requestPath: "/historical/markets",
    },
    ...overrides,
  };
}

function createHistory(
  overrides?: Partial<ExpansionImportPlanningHistory>,
): ExpansionImportPlanningHistory {
  return {
    summaryPath: "data/research-results/historical-expansion-import-summary.json",
    summaryPresent: true,
    knownUnsupportedTickers: new Set(),
    successfullyImportedTickers: new Set(),
    ...overrides,
  };
}

describe("classifyExpansionImportPlanningCategory", () => {
  it("classifies wire-supported previously imported markets as likely supported", () => {
    const history = createHistory({
      successfullyImportedTickers: new Set(["KXBTC15M-26SUPPORTED-00"]),
    });

    expect(
      classifyExpansionImportPlanningCategory(
        createMarket({ marketTicker: "KXBTC15M-26SUPPORTED-00" }),
        history,
      ),
    ).toBe("likely-supported");
  });

  it("classifies wire-supported unseen markets as unknown", () => {
    expect(
      classifyExpansionImportPlanningCategory(
        createMarket({ marketTicker: "KXBTC15M-26UNKNOWN-00" }),
        createHistory(),
      ),
    ).toBe("unknown");
  });

  it("classifies wire-unsupported and historical unsupported markets as known unsupported", () => {
    const history = createHistory({
      knownUnsupportedTickers: new Set(["KXBTC15M-26HISTORY-00"]),
    });

    expect(
      classifyExpansionImportPlanningCategory(
        createMarket({
          marketTicker: "KXBTC15M-26HISTORY-00",
          expirationValue: "60010.25",
        }),
        history,
      ),
    ).toBe("known-unsupported");

    expect(
      classifyExpansionImportPlanningCategory(
        createMarket({
          marketTicker: "KXBTC15M-26WIRE-00",
          expirationValue: "",
          listMarketWire: {
            ticker: "KXBTC15M-26WIRE-00",
            event_ticker: "KXBTC15M-26WIRE",
            series_ticker: "KXBTC15M",
            status: "finalized",
            open_time: "2026-01-15T12:00:00.000Z",
            close_time: "2026-01-15T12:15:00.000Z",
            expiration_value: "",
          },
        }),
        createHistory(),
      ),
    ).toBe("known-unsupported");
  });

  it("classifies derivation-eligible missing expiration_value markets as unknown when opt-in", () => {
    expect(
      classifyExpansionImportPlanningCategory(
        createMarket({
          marketTicker: "KXBTC15M-25DEC311900-00",
          expirationValue: "",
          listMarketWire: {
            ticker: "KXBTC15M-25DEC311900-00",
            event_ticker: "KXBTC15M-25DEC311900",
            series_ticker: "KXBTC15M",
            status: "finalized",
            result: "yes",
            open_time: "2025-12-31T18:45:00.000Z",
            close_time: "2025-12-31T19:00:00.000Z",
            floor_strike: 94180.12,
          },
        }),
        createHistory(),
        { allowDerivedExpirationValue: true },
      ),
    ).toBe("unknown");
  });
});
