import type {
  LeadLagDiscoveryCandidate,
  LeadLagDiscoveryCellMetrics,
  LeadLagDiscoveryRankingConfig,
  LeadLagDiscoveryStatus,
} from "./leadLagDiscoveryTypes";
import { DEFAULT_LEAD_LAG_DISCOVERY_RANKING_CONFIG } from "./leadLagDiscoveryTypes";

export const CANDIDATE_RANKING_METHODOLOGY = [
  "Ranking configuration is fixed before train outcomes are consumed for shortlisting.",
  "1) Hard discovery floor: eligible market-triggers, independent markets, independent market-days, "
    + "absolute median midpoint response, and minimum executable observability share.",
  "2) Among floor-clearing cells, score by independent sample support, directional stability, "
    + "absolute median midpoint effect, executable observability, and simpler (shorter) horizons/windows.",
  "3) Direction is an explicit candidate field (follow-btc | reverse-btc); both directions remain in "
    + "the evaluated universe — winners are not silently selected by testing both and dropping losers.",
  "4) Shortlist prefers structurally distinct (horizon, window, magnitude) definitions up to maxShortlistSize.",
  "5) Filesystem / map iteration order cannot change ranks: ties break on hypothesisId lexicographic order.",
  "6) Midpoint response is diagnostic; executable ask observability is recorded separately and is not P&L.",
  "7) No candidate/cell is deleted merely because it lost — full universe is retained in cells JSONL.",
] as const;

function passesDiscoveryFloor(
  cell: LeadLagDiscoveryCellMetrics,
  config: LeadLagDiscoveryRankingConfig,
): boolean {
  if (cell.eligibleMarketTriggerCount < config.minEligibleMarketTriggers) {
    return false;
  }
  if (cell.independentMarketCount < config.minIndependentMarkets) {
    return false;
  }
  if (cell.independentMarketDayCount < config.minIndependentMarketDays) {
    return false;
  }
  if (
    cell.medianSignedMidResponseCents === null
    || Math.abs(cell.medianSignedMidResponseCents) < config.minAbsMedianMidResponseCents
  ) {
    return false;
  }
  if (
    cell.executableObservabilityShare === null
    || cell.executableObservabilityShare < config.minExecutableObservabilityShare
  ) {
    return false;
  }
  return true;
}

function rankingScore(cell: LeadLagDiscoveryCellMetrics): number {
  const sampleSupport = Math.log1p(cell.eligibleMarketTriggerCount)
    + 0.5 * Math.log1p(cell.independentMarketCount)
    + 0.25 * Math.log1p(cell.uniqueBtcTriggerCount);
  const effect = Math.abs(cell.medianSignedMidResponseCents ?? 0);
  const stability = cell.directionalResponseShare ?? 0;
  const executable = cell.executableObservabilityShare ?? 0;
  // Prefer simpler definitions: shorter horizon and shorter response window.
  const simplicity =
    1 / (1 + cell.btcMoveHorizonMs / 60_000) + 1 / (1 + cell.responseWindowMs / 60_000);
  return (
    3 * sampleSupport
    + 2 * effect
    + 2 * stability
    + 1.5 * executable
    + 0.5 * simplicity
  );
}

function structuralKey(cell: LeadLagDiscoveryCellMetrics): string {
  return `${cell.btcMoveHorizonMs}|${cell.responseWindowMs}|${cell.btcMagnitudeBin}`;
}

/**
 * Deterministic shortlist. Declared ranking config must be fixed before calling.
 */
export function rankLeadLagDiscoveryCandidates(input: {
  cells: readonly LeadLagDiscoveryCellMetrics[];
  config?: LeadLagDiscoveryRankingConfig;
}): {
  status: LeadLagDiscoveryStatus;
  candidates: LeadLagDiscoveryCandidate[];
  rankingConfig: LeadLagDiscoveryRankingConfig;
} {
  const config = input.config ?? DEFAULT_LEAD_LAG_DISCOVERY_RANKING_CONFIG;

  const eligible = input.cells
    .filter((cell) => passesDiscoveryFloor(cell, config))
    .map((cell) => ({
      cell,
      score: rankingScore(cell),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.cell.hypothesisId.localeCompare(right.cell.hypothesisId);
    });

  const shortlist: LeadLagDiscoveryCandidate[] = [];
  const seenStructures = new Set<string>();

  for (const entry of eligible) {
    if (shortlist.length >= config.maxShortlistSize) {
      break;
    }
    const key = structuralKey(entry.cell);
    if (seenStructures.has(key)) {
      continue;
    }
    seenStructures.add(key);
    const reasons = [
      `eligibleMarketTriggers=${entry.cell.eligibleMarketTriggerCount}`,
      `independentMarkets=${entry.cell.independentMarketCount}`,
      `medianSignedMidCents=${entry.cell.medianSignedMidResponseCents}`,
      `directionalShare=${entry.cell.directionalResponseShare}`,
      `executableShare=${entry.cell.executableObservabilityShare}`,
      `direction=${entry.cell.direction}`,
      `score=${entry.score.toFixed(6)}`,
    ];
    shortlist.push({
      ...entry.cell,
      rank: shortlist.length + 1,
      rankingScore: entry.score,
      rankingReasons: reasons,
    });
  }

  return {
    status: shortlist.length > 0 ? "candidates-shortlisted" : "no-promising-candidate",
    candidates: shortlist,
    rankingConfig: config,
  };
}
