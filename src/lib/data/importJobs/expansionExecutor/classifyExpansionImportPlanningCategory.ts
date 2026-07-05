import { classifyUnsupportedHistoricalMarket } from "./classifyUnsupportedHistoricalMarket";
import type { ExpansionDiscoveredMarket } from "./expansionExecutorTypes";
import type {
  ExpansionImportPlanningCategory,
  ExpansionImportPlanningHistory,
} from "./expansionImportSelectionTypes";

/** Classifies a discovered market for supported-first expansion import planning. */
export function classifyExpansionImportPlanningCategory(
  market: ExpansionDiscoveredMarket,
  history: ExpansionImportPlanningHistory,
): ExpansionImportPlanningCategory {
  if (history.knownUnsupportedTickers.has(market.marketTicker)) {
    return "known-unsupported";
  }

  const wireClassification = classifyUnsupportedHistoricalMarket({
    listMarketWire: market.listMarketWire,
    detailMarketWire: null,
  });

  if (wireClassification.support === "unsupported") {
    return "known-unsupported";
  }

  if (history.successfullyImportedTickers.has(market.marketTicker)) {
    return "likely-supported";
  }

  return "unknown";
}

export function countExpansionImportSelectionByCategory(
  markets: readonly ExpansionDiscoveredMarket[],
  history: ExpansionImportPlanningHistory,
): ExpansionImportSelectionCountsByCategory {
  const counts: ExpansionImportSelectionCountsByCategory = {
    "likely-supported": 0,
    unknown: 0,
    "known-unsupported": 0,
  };

  for (const market of markets) {
    const category = classifyExpansionImportPlanningCategory(market, history);
    counts[category] += 1;
  }

  return counts;
}

export type ExpansionImportSelectionCountsByCategory = Record<
  ExpansionImportPlanningCategory,
  number
>;
