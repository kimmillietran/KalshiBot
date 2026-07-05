import type { ExpansionDiscoveredMarket } from "./expansionExecutorTypes";
import {
  classifyExpansionImportPlanningCategory,
  countExpansionImportSelectionByCategory,
} from "./classifyExpansionImportPlanningCategory";
import type {
  ExpansionImportPlanningCategory,
  ExpansionImportPlanningHistory,
  ExpansionImportSampleStrategy,
  ExpansionImportSelectionCounts,
} from "./expansionImportSelectionTypes";
import { EXPANSION_IMPORT_PLANNING_CATEGORY_ORDER } from "./expansionImportSelectionTypes";

function compareMarketTicker(
  left: ExpansionDiscoveredMarket,
  right: ExpansionDiscoveredMarket,
): number {
  return left.marketTicker.localeCompare(right.marketTicker);
}

function compareMarketByOpenTime(
  left: ExpansionDiscoveredMarket,
  right: ExpansionDiscoveredMarket,
): number {
  const leftOpen = left.openTime ?? "";
  const rightOpen = right.openTime ?? "";
  const byOpen = leftOpen.localeCompare(rightOpen);
  if (byOpen !== 0) {
    return byOpen;
  }

  const leftClose = left.closeTime ?? "";
  const rightClose = right.closeTime ?? "";
  const byClose = leftClose.localeCompare(rightClose);
  if (byClose !== 0) {
    return byClose;
  }

  return compareMarketTicker(left, right);
}

function deterministicShuffleKey(seed: string, ticker: string): number {
  let hash = 2166136261;
  const input = `${seed}:${ticker}`;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function orderBucketBySampleStrategy(
  markets: readonly ExpansionDiscoveredMarket[],
  strategy: ExpansionImportSampleStrategy,
  selectionSeed: string,
): ExpansionDiscoveredMarket[] {
  const copy = [...markets];

  switch (strategy) {
    case "earliest":
      return copy.sort(compareMarketByOpenTime);
    case "latest":
      return copy.sort((left, right) => compareMarketByOpenTime(right, left));
    case "random":
      return copy.sort(
        (left, right) =>
          deterministicShuffleKey(selectionSeed, left.marketTicker)
          - deterministicShuffleKey(selectionSeed, right.marketTicker),
      );
    case "evenly-spaced":
    case "supported-first":
    default:
      return copy.sort(compareMarketTicker);
  }
}

function selectEvenlySpaced<T>(items: readonly T[], count: number): T[] {
  if (count <= 0) {
    return [];
  }

  if (count >= items.length) {
    return [...items];
  }

  if (count === 1) {
    return [items[Math.floor(items.length / 2)]!];
  }

  const selected: T[] = [];
  for (let index = 0; index < count; index += 1) {
    const position = Math.floor((index * (items.length - 1)) / (count - 1));
    selected.push(items[position]!);
  }

  return selected;
}

function groupMarketsByPlanningCategory(
  markets: readonly ExpansionDiscoveredMarket[],
  history: ExpansionImportPlanningHistory,
): Record<ExpansionImportPlanningCategory, ExpansionDiscoveredMarket[]> {
  const grouped: Record<ExpansionImportPlanningCategory, ExpansionDiscoveredMarket[]> = {
    "likely-supported": [],
    unknown: [],
    "known-unsupported": [],
  };

  for (const market of markets) {
    const category = classifyExpansionImportPlanningCategory(market, history);
    grouped[category].push(market);
  }

  return grouped;
}

function takeFromOrderedBucket(
  ordered: readonly ExpansionDiscoveredMarket[],
  remainingMarketBudget: number | null,
  strategy: ExpansionImportSampleStrategy,
): ExpansionDiscoveredMarket[] {
  if (ordered.length === 0) {
    return [];
  }

  if (remainingMarketBudget === null) {
    return [...ordered];
  }

  const takeCount = Math.min(remainingMarketBudget, ordered.length);
  if (takeCount <= 0) {
    return [];
  }

  if (strategy === "evenly-spaced") {
    return selectEvenlySpaced(ordered, takeCount);
  }

  return ordered.slice(0, takeCount);
}

/** Orders and selects eligible discovered markets for expansion import planning. */
export function planExpansionImportCandidateQueue(input: {
  eligibleMarkets: readonly ExpansionDiscoveredMarket[];
  remainingMarketBudget: number | null;
  sampleStrategy: ExpansionImportSampleStrategy;
  planningHistory: ExpansionImportPlanningHistory;
  selectionSeed: string;
}): {
  plannedQueue: ExpansionDiscoveredMarket[];
  selection: ExpansionImportSelectionCounts;
} {
  const grouped = groupMarketsByPlanningCategory(
    input.eligibleMarkets,
    input.planningHistory,
  );

  const plannedQueue: ExpansionDiscoveredMarket[] = [];
  let remainingBudget = input.remainingMarketBudget;

  for (const category of EXPANSION_IMPORT_PLANNING_CATEGORY_ORDER) {
    if (remainingBudget !== null && remainingBudget <= 0) {
      break;
    }

    const orderedBucket = orderBucketBySampleStrategy(
      grouped[category],
      input.sampleStrategy,
      input.selectionSeed,
    );
    const selected = takeFromOrderedBucket(
      orderedBucket,
      remainingBudget,
      input.sampleStrategy,
    );

    plannedQueue.push(...selected);

    if (remainingBudget !== null) {
      remainingBudget -= selected.length;
    }
  }

  return {
    plannedQueue,
    selection: buildExpansionImportSelectionCounts(
      plannedQueue,
      input.planningHistory,
    ),
  };
}

export function buildExpansionImportSelectionCounts(
  plannedQueue: readonly ExpansionDiscoveredMarket[],
  planningHistory: ExpansionImportPlanningHistory,
): ExpansionImportSelectionCounts {
  const counts = countExpansionImportSelectionByCategory(
    plannedQueue,
    planningHistory,
  );

  return {
    selectedSupportedMarkets: counts["likely-supported"],
    selectedUnknownMarkets: counts.unknown,
    selectedUnsupportedMarkets: counts["known-unsupported"],
  };
}
