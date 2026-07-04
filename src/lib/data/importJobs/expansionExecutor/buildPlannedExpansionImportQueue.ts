import type { ExpansionDiscoveredMarket } from "./expansionExecutorTypes";

export type PlannedExpansionImportQueuePlan = {
  alreadyCoveredCount: number;
  plannedQueue: readonly ExpansionDiscoveredMarket[];
};

/** Builds the explicit post-dedupe import queue with an optional global cap. */
export function buildPlannedExpansionImportQueue(
  discovered: readonly ExpansionDiscoveredMarket[],
  existingTickers: ReadonlySet<string>,
  remainingMarketBudget: number | null,
): PlannedExpansionImportQueuePlan {
  let alreadyCoveredCount = 0;
  const plannedQueue: ExpansionDiscoveredMarket[] = [];

  for (const market of discovered) {
    if (existingTickers.has(market.marketTicker)) {
      alreadyCoveredCount += 1;
      continue;
    }

    if (remainingMarketBudget !== null && plannedQueue.length >= remainingMarketBudget) {
      break;
    }

    plannedQueue.push(market);
  }

  return { alreadyCoveredCount, plannedQueue };
}
