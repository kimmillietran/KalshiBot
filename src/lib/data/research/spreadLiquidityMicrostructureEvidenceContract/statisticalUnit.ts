import type { MicrostructureIndependentUnitDefinition } from "./microstructureEvidenceContractTypes";

export type MicrostructureCountLadder = {
  rawTobRows: number;
  rawQualifyingEvents: number;
  refractoryDeduplicatedEpisodes: number;
  independentMarketDays: number;
  effectiveSampleSize: number;
};

/**
 * Promotion-facing independent unit:
 * at most one qualifying episode per marketTicker per calendar day per structural cell.
 * Raw quote count is never independent N.
 */
export function buildMicrostructureStatisticalUnitContract(): {
  primaryIndependentUnit: MicrostructureIndependentUnitDefinition;
  notIndependent: readonly string[];
  dependenceModel: string;
  clusteringRule: string;
  effectiveSampleSizeRule: string;
  countLadderLabels: readonly (keyof MicrostructureCountLadder)[];
} {
  return {
    primaryIndependentUnit: "at-most-one-qualifying-episode-per-market-day-per-cell",
    notIndependent: [
      "raw TOB quote rows",
      "raw threshold crossings before refractory dedup",
      "overlapping response-window observations within the same market/day/cell",
      "multiple same-market same-day crossings after the first independent episode",
    ],
    dependenceModel:
      "Same-market overlapping response windows are dependent. First-crossing + refractory "
      + "deduplication yields episodes; promotion ESS further collapses to ≤1 per market/day/cell.",
    clusteringRule:
      "Cluster key = marketTicker|calendarDay|structuralCellId. Cap contribution at 1 for ESS.",
    effectiveSampleSizeRule:
      "ESS = number of distinct (marketTicker, calendarDay, structuralCell) keys with ≥1 usable "
      + "independent episode after refractory dedup and response observability filters. "
      + "Raw TobRows never substitute for ESS.",
    countLadderLabels: [
      "rawTobRows",
      "rawQualifyingEvents",
      "refractoryDeduplicatedEpisodes",
      "independentMarketDays",
      "effectiveSampleSize",
    ],
  };
}

export function assertRawQuotesAreNotIndependentN(rawTobRows: number, claimedEss: number): void {
  if (claimedEss === rawTobRows && rawTobRows > 0) {
    throw new Error(
      "Raw TOB quote count cannot equal claimed effective sample size; quotes are not independent N.",
    );
  }
}

/**
 * Conservative ESS from episode keys: at most one contribution per market/day/cell.
 */
export function computeMicrostructureEffectiveSampleSize(
  episodes: ReadonlyArray<{
    marketTicker: string;
    calendarDay: string;
    structuralCellId: string;
    usable: boolean;
  }>,
): number {
  const keys = new Set<string>();
  for (const episode of episodes) {
    if (!episode.usable) continue;
    keys.add(`${episode.marketTicker}|${episode.calendarDay}|${episode.structuralCellId}`);
  }
  return keys.size;
}

export function buildCountLadder(input: {
  rawTobRows: number;
  rawQualifyingEvents: number;
  refractoryDeduplicatedEpisodes: number;
  independentMarketDays: number;
  effectiveSampleSize: number;
}): MicrostructureCountLadder {
  if (input.effectiveSampleSize > input.independentMarketDays) {
    throw new Error("ESS cannot exceed independent market-days under market-day/cell capping.");
  }
  if (input.effectiveSampleSize > input.refractoryDeduplicatedEpisodes) {
    throw new Error("ESS cannot exceed refractory-deduplicated episode count.");
  }
  if (input.refractoryDeduplicatedEpisodes > input.rawQualifyingEvents) {
    throw new Error("Deduplicated episodes cannot exceed raw qualifying events.");
  }
  assertRawQuotesAreNotIndependentN(input.rawTobRows, input.effectiveSampleSize);
  return { ...input };
}
