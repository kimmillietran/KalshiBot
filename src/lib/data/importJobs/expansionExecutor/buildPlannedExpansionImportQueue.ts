import type { ExpansionDiscoveredMarket } from "./expansionExecutorTypes";
import type {
  ExpansionImportPlanningHistory,
  ExpansionImportSampleStrategy,
  ExpansionImportSelectionCounts,
} from "./expansionImportSelectionTypes";
import { DEFAULT_EXPANSION_IMPORT_SAMPLE_STRATEGY } from "./expansionImportSelectionTypes";
import { planExpansionImportCandidateQueue } from "./orderExpansionImportCandidates";

export type PlannedExpansionImportQueuePlan = {
  alreadyCoveredCount: number;
  plannedQueue: readonly ExpansionDiscoveredMarket[];
  selection: ExpansionImportSelectionCounts;
};

export type BuildPlannedExpansionImportQueueOptions = {
  sampleStrategy?: ExpansionImportSampleStrategy;
  planningHistory?: ExpansionImportPlanningHistory | null;
  selectionSeed?: string;
};

/** Builds the explicit post-dedupe import queue with optional global cap and selection policy. */
export function buildPlannedExpansionImportQueue(
  discovered: readonly ExpansionDiscoveredMarket[],
  existingTickers: ReadonlySet<string>,
  remainingMarketBudget: number | null,
  options?: BuildPlannedExpansionImportQueueOptions,
): PlannedExpansionImportQueuePlan {
  let alreadyCoveredCount = 0;
  const eligibleMarkets: ExpansionDiscoveredMarket[] = [];

  for (const market of discovered) {
    if (existingTickers.has(market.marketTicker)) {
      alreadyCoveredCount += 1;
      continue;
    }

    eligibleMarkets.push(market);
  }

  const planningHistory = options?.planningHistory ?? {
    summaryPath: null,
    summaryPresent: false,
    knownUnsupportedTickers: new Set<string>(),
    successfullyImportedTickers: new Set<string>(),
  };

  const { plannedQueue, selection } = planExpansionImportCandidateQueue({
    eligibleMarkets,
    remainingMarketBudget,
    sampleStrategy: options?.sampleStrategy ?? DEFAULT_EXPANSION_IMPORT_SAMPLE_STRATEGY,
    planningHistory,
    selectionSeed: options?.selectionSeed ?? "expansion-import",
  });

  return { alreadyCoveredCount, plannedQueue, selection };
}
