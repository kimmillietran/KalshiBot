import {
  computeEffectiveSampleSizeEstimate,
  groupObservationsByMarketDay,
} from "../oosPowerCorrection/oosPowerCorrectionMath";
import type { IndependentUnitPolicy } from "./microstructureFamilyTypes";
import type { TobImbalanceCrossingEvent } from "./firstCrossingEvents";

export function buildIndependentUnitPolicy(): IndependentUnitPolicy {
  return {
    primaryUnit: "one-qualifying-episode-per-marketTicker-per-calendar-day-per-structural-cell",
    blockKeyFormat: "${marketTicker}:${utcTradingDay}",
    rawQuoteCountIsNeverStatisticalN: true,
    reuseStack: "oosPowerCorrection.computeEffectiveSampleSizeEstimate",
    additionalSameMarketDayEpisodes: "diagnostic-incidence-only",
  };
}

export function utcTradingDayFromTimestampMs(timestampMs: number): string {
  return new Date(timestampMs).toISOString().slice(0, 10);
}

export type MicrostructureEpisodeObservation = {
  marketTicker: string;
  tradingDayUtc: string;
  eventTimestampMs: number;
  structuralCellId: string;
  /** When false, retained only as diagnostic incidence. */
  countsTowardIndependentN: boolean;
};

/**
 * Promotion/power-facing independent units: at most one qualifying episode per
 * marketTicker × calendar day × structural cell. Extra same-day episodes are
 * diagnostic incidence only and must not inflate ESS.
 */
export function selectIndependentEpisodes(input: {
  events: readonly TobImbalanceCrossingEvent[];
  structuralCellId: string;
}): {
  observations: MicrostructureEpisodeObservation[];
  independentObservations: MicrostructureEpisodeObservation[];
  diagnosticOnlyCount: number;
} {
  const sorted = [...input.events].sort((a, b) => {
    if (a.marketTicker !== b.marketTicker) {
      return a.marketTicker.localeCompare(b.marketTicker);
    }
    return a.eventTimestampMs - b.eventTimestampMs;
  });

  const seenBlocks = new Set<string>();
  const observations: MicrostructureEpisodeObservation[] = [];

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

/**
 * ESS for power/promotion evidence. Raw TOB quote count is never statistical N —
 * pass quoteCount only to prove it cannot inflate ESS when independent N is smaller.
 */
export function computeMicrostructureEffectiveSampleSize(input: {
  independentObservations: readonly MicrostructureEpisodeObservation[];
  /** If supplied, used only as a non-authority diagnostic; never as ESS. */
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
