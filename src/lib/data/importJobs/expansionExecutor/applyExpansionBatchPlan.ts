import type { ExpansionBatchPlan } from "@/lib/data/research/expansionBatchPlanner/expansionBatchPlannerTypes";
import type { ExpansionBatchPlanSelectionStrategy } from "@/lib/data/research/expansionBatchPlanner/expansionBatchPlannerTypes";
import { parseExpansionMarketCalendarMonth } from "@/lib/data/research/coveragePlanner/importability/parseExpansionMarketCalendarMonth";
import type { ExpansionDiscoveredMarket } from "./expansionExecutorTypes";
import type {
  ExpansionImportPlanningHistory,
  ExpansionImportSampleStrategy,
  ExpansionImportSelectionCounts,
} from "./expansionImportSelectionTypes";
import { planExpansionImportCandidateQueue } from "./orderExpansionImportCandidates";

export function mapBatchPlanStrategyToSampleStrategy(
  strategy: ExpansionBatchPlanSelectionStrategy,
): ExpansionImportSampleStrategy {
  switch (strategy) {
    case "evenly-spaced":
    case "temporal-balance":
      return "evenly-spaced";
    case "random":
      return "random";
    case "supported-first":
    case "research-value":
    default:
      return "supported-first";
  }
}

/** Selects discovered markets using month allocations from an expansion batch plan. */
export function selectMarketsUsingBatchPlan(input: {
  eligibleMarkets: readonly ExpansionDiscoveredMarket[];
  batchPlan: ExpansionBatchPlan;
  remainingByMonth: Map<string, number>;
  remainingMarketBudget: number | null;
  planningHistory: ExpansionImportPlanningHistory;
  selectionSeed: string;
}): {
  plannedQueue: ExpansionDiscoveredMarket[];
  selection: ExpansionImportSelectionCounts;
} {
  const sampleStrategy = mapBatchPlanStrategyToSampleStrategy(input.batchPlan.selectionStrategy);
  const marketsByMonth = new Map<string, ExpansionDiscoveredMarket[]>();

  for (const market of input.eligibleMarkets) {
    const month = parseExpansionMarketCalendarMonth(market.marketTicker);
    if (!month) {
      continue;
    }

    const remainingForMonth = input.remainingByMonth.get(month) ?? 0;
    if (remainingForMonth <= 0) {
      continue;
    }

    const bucket = marketsByMonth.get(month) ?? [];
    bucket.push(market);
    marketsByMonth.set(month, bucket);
  }

  const plannedQueue: ExpansionDiscoveredMarket[] = [];
  let remainingBudget = input.remainingMarketBudget;
  const aggregateSelection: ExpansionImportSelectionCounts = {
    selectedSupportedMarkets: 0,
    selectedUnknownMarkets: 0,
    selectedUnsupportedMarkets: 0,
  };

  for (const allocation of input.batchPlan.allocations) {
    if (remainingBudget !== null && remainingBudget <= 0) {
      break;
    }

    const monthRemaining = input.remainingByMonth.get(allocation.month) ?? 0;
    if (monthRemaining <= 0) {
      continue;
    }

    const monthMarkets = marketsByMonth.get(allocation.month) ?? [];
    if (monthMarkets.length === 0) {
      continue;
    }

    const monthBudget =
      remainingBudget === null
        ? monthRemaining
        : Math.min(monthRemaining, remainingBudget);

    const { plannedQueue: monthQueue, selection } = planExpansionImportCandidateQueue({
      eligibleMarkets: monthMarkets,
      remainingMarketBudget: monthBudget,
      sampleStrategy,
      planningHistory: input.planningHistory,
      selectionSeed: `${input.selectionSeed}:${allocation.month}`,
    });

    plannedQueue.push(...monthQueue);
    aggregateSelection.selectedSupportedMarkets += selection.selectedSupportedMarkets;
    aggregateSelection.selectedUnknownMarkets += selection.selectedUnknownMarkets;
    aggregateSelection.selectedUnsupportedMarkets += selection.selectedUnsupportedMarkets;

    input.remainingByMonth.set(
      allocation.month,
      monthRemaining - monthQueue.length,
    );

    if (remainingBudget !== null) {
      remainingBudget -= monthQueue.length;
    }
  }

  return {
    plannedQueue,
    selection: aggregateSelection,
  };
}
