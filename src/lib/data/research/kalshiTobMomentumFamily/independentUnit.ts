import {
  computeEffectiveSampleSizeEstimate,
  groupObservationsByMarketDay,
} from "../oosPowerCorrection/oosPowerCorrectionMath";
import type { IndependentUnitPolicy } from "./momentumFamilyTypes";
import type { MomentumCrossingEvent } from "./firstCrossingEvents";

export function buildIndependentUnitPolicy(): IndependentUnitPolicy {
  return {
    primaryUnit:
      "one-qualifying-episode-per-marketTicker-per-utc-calendar-day-per-structural-cell",
    blockKeyFormat: "${marketTicker}:${utcTradingDay}:${structuralCellId}",
    rawQuoteCountIsNeverStatisticalN: true,
    multipleHorizonsFromOneCrossingAreCorrelatedHypotheses: true,
    additionalSameMarketDayEpisodes: "diagnostic-incidence-only",
  };
}

export function utcTradingDayFromTimestampMs(timestampMs: number): string {
  return new Date(timestampMs).toISOString().slice(0, 10);
}

export type MomentumEpisodeObservation = {
  marketTicker: string;
  tradingDayUtc: string;
  eventTimestampMs: number;
  structuralCellId: string;
  countsTowardIndependentN: boolean;
};

/**
 * At most one qualifying episode per marketTicker × UTC calendar day × structural cell.
 * Multiple horizons from one physical crossing remain correlated hypotheses and must
 * not be summed as independent evidence for a single cell's ESS.
 */
export function selectIndependentEpisodes(input: {
  events: readonly MomentumCrossingEvent[];
  structuralCellId: string;
}): {
  observations: MomentumEpisodeObservation[];
  independentObservations: MomentumEpisodeObservation[];
  diagnosticOnlyCount: number;
} {
  const sorted = [...input.events].sort((a, b) => {
    if (a.marketTicker !== b.marketTicker) {
      return a.marketTicker.localeCompare(b.marketTicker);
    }
    return a.eventTimestampMs - b.eventTimestampMs;
  });

  const seenBlocks = new Set<string>();
  const observations: MomentumEpisodeObservation[] = [];

  for (const event of sorted) {
    const tradingDayUtc = utcTradingDayFromTimestampMs(event.eventTimestampMs);
    const blockKey = `${event.marketTicker}:${tradingDayUtc}:${input.structuralCellId}`;
    const countsTowardIndependentN = !seenBlocks.has(blockKey);
    if (countsTowardIndependentN) {
      seenBlocks.add(blockKey);
    }
    observations.push({
      marketTicker: event.marketTicker,
      tradingDayUtc,
      eventTimestampMs: event.eventTimestampMs,
      structuralCellId: input.structuralCellId,
      countsTowardIndependentN,
    });
  }

  const independentObservations = observations.filter((row) => row.countsTowardIndependentN);
  return {
    observations,
    independentObservations,
    diagnosticOnlyCount: observations.length - independentObservations.length,
  };
}

export function computeMomentumEffectiveSampleSize(input: {
  independentObservations: readonly MomentumEpisodeObservation[];
  rawQuoteCount?: number;
}): {
  effectiveSampleSize: number;
  marketDayCount: number;
  independentMarketCount: number;
  rawIndependentEpisodeCount: number;
  rawQuoteCountIsNeverStatisticalN: true;
  quoteCountWouldHaveBeen: number | null;
} {
  const marketDayBlocks = groupObservationsByMarketDay(input.independentObservations);
  const markets = new Set(input.independentObservations.map((row) => row.marketTicker));
  const effectiveSampleSize = computeEffectiveSampleSizeEstimate({
    rawObservationCount: input.independentObservations.length,
    independentMarketCount: markets.size,
    marketDayCount: marketDayBlocks.length,
  });

  return {
    effectiveSampleSize,
    marketDayCount: marketDayBlocks.length,
    independentMarketCount: markets.size,
    rawIndependentEpisodeCount: input.independentObservations.length,
    rawQuoteCountIsNeverStatisticalN: true,
    quoteCountWouldHaveBeen: input.rawQuoteCount ?? null,
  };
}

/**
 * Prove that enumerating multiple H for the same physical crossing does not
 * inflate ESS of a single structural cell.
 */
export function assertMultipleHorizonsDoNotInflateCellEss(input: {
  physicalCrossingCount: number;
  horizonCount: number;
  cellEss: number;
}): void {
  if (input.cellEss > input.physicalCrossingCount) {
    throw new Error(
      `Cell ESS ${input.cellEss} exceeds physical crossings ${input.physicalCrossingCount}; `
        + "multiple horizons must not inflate one cell's ESS",
    );
  }
}
