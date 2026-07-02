import type { ResearchMarketResultSummary } from "../aggregation/researchAggregateTypes";

import type { CompletedMarketPnlSample } from "./powerAnalysisTypes";

/** Extracts completed per-market PnL samples for power analysis. */
export function extractCompletedMarketPnlSamples(
  markets: readonly ResearchMarketResultSummary[],
): CompletedMarketPnlSample[] {
  return markets
    .filter((market) => market.status === "completed" && market.metrics !== undefined)
    .map((market) => ({
      marketTicker: market.marketTicker,
      totalPnlCents: market.metrics!.totalPnlCents,
    }))
    .sort((left, right) => left.marketTicker.localeCompare(right.marketTicker));
}
