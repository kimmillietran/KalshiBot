import { classifyUnsupportedHistoricalMarket } from "./classifyUnsupportedHistoricalMarket";
import { isDerivedExpirationValueEligible, isOnlyMissingExpirationValue } from "./deriveMissingExpirationValue";
import type { ExpansionDiscoveredMarket } from "./expansionExecutorTypes";
import type {
  ExpansionImportPlanningCategory,
  ExpansionImportPlanningHistory,
} from "./expansionImportSelectionTypes";

export type ClassifyExpansionImportPlanningCategoryOptions = {
  allowDerivedExpirationValue?: boolean;
};

/** Classifies a discovered market for supported-first expansion import planning. */
export function classifyExpansionImportPlanningCategory(
  market: ExpansionDiscoveredMarket,
  history: ExpansionImportPlanningHistory,
  options?: ClassifyExpansionImportPlanningCategoryOptions,
): ExpansionImportPlanningCategory {
  if (history.knownUnsupportedTickers.has(market.marketTicker)) {
    return "known-unsupported";
  }

  const wireClassification = classifyUnsupportedHistoricalMarket({
    listMarketWire: market.listMarketWire,
    detailMarketWire: null,
  });

  if (wireClassification.support === "unsupported") {
    if (
      options?.allowDerivedExpirationValue
      && isOnlyMissingExpirationValue(wireClassification.missingRequiredFields)
      && isDerivedExpirationValueEligible(market)
    ) {
      return "unknown";
    }

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
  options?: ClassifyExpansionImportPlanningCategoryOptions,
): ExpansionImportSelectionCountsByCategory {
  const counts: ExpansionImportSelectionCountsByCategory = {
    "likely-supported": 0,
    unknown: 0,
    "known-unsupported": 0,
  };

  for (const market of markets) {
    const category = classifyExpansionImportPlanningCategory(market, history, options);
    counts[category] += 1;
  }

  return counts;
}

export type ExpansionImportSelectionCountsByCategory = Record<
  ExpansionImportPlanningCategory,
  number
>;
