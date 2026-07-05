import { describe, expect, it } from "vitest";

import { loadExpansionImportPlanningHistory } from "./loadExpansionImportPlanningHistory";

describe("loadExpansionImportPlanningHistory", () => {
  it("returns empty history when summary file is missing", () => {
    const history = loadExpansionImportPlanningHistory(
      {
        fileExists: () => false,
        readFile: () => "",
      },
      "data/research-results/historical-expansion-import-summary.json",
    );

    expect(history.summaryPresent).toBe(false);
    expect(history.knownUnsupportedTickers.size).toBe(0);
    expect(history.successfullyImportedTickers.size).toBe(0);
  });

  it("loads unsupported and imported tickers from prior summary", () => {
    const history = loadExpansionImportPlanningHistory(
      {
        fileExists: () => true,
        readFile: () =>
          JSON.stringify({
            jobs: [
              {
                markets: [
                  {
                    marketTicker: "KXBTC15M-26IMPORTED-00",
                    status: "imported",
                  },
                  {
                    marketTicker: "KXBTC15M-26UNSUPPORTED-00",
                    status: "skipped",
                    skipReason:
                      "Unsupported historical market: Missing expiration_value from Kalshi historical API.",
                  },
                  {
                    marketTicker: "KXBTC15M-26FAILED-00",
                    status: "failed",
                    errorMessage: "missing required fields: expiration_value",
                  },
                ],
              },
            ],
          }),
      },
      "data/research-results/historical-expansion-import-summary.json",
    );

    expect(history.summaryPresent).toBe(true);
    expect(history.successfullyImportedTickers.has("KXBTC15M-26IMPORTED-00")).toBe(
      true,
    );
    expect(history.knownUnsupportedTickers.has("KXBTC15M-26UNSUPPORTED-00")).toBe(
      true,
    );
    expect(history.knownUnsupportedTickers.has("KXBTC15M-26FAILED-00")).toBe(true);
  });
});
