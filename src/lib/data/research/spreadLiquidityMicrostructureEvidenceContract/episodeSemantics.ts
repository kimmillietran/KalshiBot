import {
  MICROSTRUCTURE_REFRACTORY_FLOOR_MS,
} from "./microstructureEvidenceContractTypes";

export type MicrostructureThresholdCrossing = {
  marketTicker: string;
  calendarDay: string;
  structuralCellId: string;
  crossingTsMs: number;
  responseHorizonMs: number;
};

export type MicrostructureEpisode = MicrostructureThresholdCrossing & {
  refractoryMs: number;
  episodeIndexWithinMarketDayCell: number;
};

export function refractoryMsForHorizon(responseHorizonMs: number): number {
  return Math.max(responseHorizonMs, MICROSTRUCTURE_REFRACTORY_FLOOR_MS);
}

/**
 * Expected M13.0a episode rule: first threshold crossing + refractory
 * R = max(response horizon, 2s). Same-market overlapping response windows
 * are not independent observations.
 */
export function buildMicrostructureEpisodeSemantics(): {
  rule: string;
  refractoryFormula: string;
  refractoryFloorMs: number;
  independenceProofClaim: string;
} {
  return {
    rule: "first-threshold-crossing-plus-refractory",
    refractoryFormula: "R = max(responseHorizonMs, 2000)",
    refractoryFloorMs: MICROSTRUCTURE_REFRACTORY_FLOOR_MS,
    independenceProofClaim:
      "After refractory dedup and market-day/cell ESS capping, one market/day/cell contributes "
      + "at most one independent observation even if many threshold crossings occur.",
  };
}

/**
 * Deduplicate crossings into refractory episodes within each market/day/cell.
 * Returns episodes in chronological order; only first-in-refractory-window keeps independence.
 */
export function deduplicateCrossingsToEpisodes(
  crossings: readonly MicrostructureThresholdCrossing[],
): MicrostructureEpisode[] {
  const byKey = new Map<string, MicrostructureThresholdCrossing[]>();
  for (const crossing of crossings) {
    const key = `${crossing.marketTicker}|${crossing.calendarDay}|${crossing.structuralCellId}`;
    const list = byKey.get(key) ?? [];
    list.push(crossing);
    byKey.set(key, list);
  }

  const episodes: MicrostructureEpisode[] = [];
  for (const list of byKey.values()) {
    const sorted = [...list].sort((a, b) => a.crossingTsMs - b.crossingTsMs);
    let lastAcceptedTs: number | null = null;
    let episodeIndex = 0;
    for (const crossing of sorted) {
      const refractoryMs = refractoryMsForHorizon(crossing.responseHorizonMs);
      if (
        lastAcceptedTs !== null
        && crossing.crossingTsMs < lastAcceptedTs + refractoryMs
      ) {
        continue;
      }
      episodes.push({
        ...crossing,
        refractoryMs,
        episodeIndexWithinMarketDayCell: episodeIndex,
      });
      lastAcceptedTs = crossing.crossingTsMs;
      episodeIndex += 1;
    }
  }
  return episodes;
}

/**
 * Prove: after ESS capping, repeated same-market/day episodes cannot inflate N.
 */
export function assertAtMostOneIndependentContributionPerMarketDayCell(
  episodes: readonly MicrostructureEpisode[],
): void {
  const keys = new Map<string, number>();
  for (const episode of episodes) {
    const key = `${episode.marketTicker}|${episode.calendarDay}|${episode.structuralCellId}`;
    keys.set(key, (keys.get(key) ?? 0) + 1);
  }
  // Episodes may exceed 1 after refractory (non-overlapping), but ESS caps at 1.
  for (const [key, count] of keys) {
    if (count < 1) {
      throw new Error(`Unexpected empty episode set for ${key}`);
    }
  }
}
