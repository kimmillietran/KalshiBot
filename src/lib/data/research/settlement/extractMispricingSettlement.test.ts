import { describe, expect, it } from "vitest";

import { extractMispricingObservationsFromResearchOutput } from "../mispricingAtlas/parseMispricingObservations";

describe("extractMispricingObservationsFromResearchOutput missing settlement", () => {
  it("returns a clear skip reason when expanded snapshots lack settlement", () => {
    const extracted = extractMispricingObservationsFromResearchOutput(
      JSON.stringify({
        dataset: JSON.stringify({
          snapshots: [
            {
              ticker: "KXBTC15M-MARKET-A",
              settlement: null,
              marketWindow: { ticker: "KXBTC15M-MARKET-A", seriesTicker: "KXBTC15M" },
              kalshiCandles: [{ yesBidCents: 40, yesAskCents: 60 }],
            },
            {
              ticker: "KXBTC15M-MARKET-A",
              settlement: null,
              marketWindow: { ticker: "KXBTC15M-MARKET-A", seriesTicker: "KXBTC15M" },
              kalshiCandles: [
                { yesBidCents: 40, yesAskCents: 60 },
                { yesBidCents: 70, yesAskCents: 80 },
              ],
            },
          ],
        }),
        researchRun: JSON.stringify({
          config: { strategyId: "noop" },
          backtestResult: JSON.stringify({ replayResult: { results: [] } }),
        }),
        metadata: { strategyId: "noop" },
      }),
      "data/research-results/noop/KXBTC15M/KXBTC15M-MARKET-A/research-output.json",
    );

    expect(extracted.observations).toHaveLength(0);
    expect(extracted.warnings).toEqual([
      {
        code: "missing-settlement",
        message:
          "Missing settlement for market KXBTC15M-MARKET-A (checked dataset.snapshots[0..1].settlement.result)",
        marketTicker: "KXBTC15M-MARKET-A",
      },
    ]);
  });
});
