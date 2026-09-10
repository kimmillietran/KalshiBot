import {
  BTC_MAGNITUDE_BINS,
  BTC_RETURN_HORIZONS_MS,
  IMPLIED_PROBABILITY_BINS,
  RESPONSE_WINDOWS_MS,
  TIME_REMAINING_BINS,
  type LeadLagEventRecord,
} from "../btcKalshiLeadLagAnalysis/btcKalshiLeadLagAnalysisTypes";
import { mean, median } from "../btcKalshiLeadLagAnalysis/leadLagUtils";

import {
  LEAD_LAG_DISCOVERY_HYPOTHESIS_COUNT,
  LEAD_LAG_RESPONSE_DIRECTIONS,
  LEAD_LAG_STRUCTURAL_CELL_COUNT,
  type LeadLagDiscoveryCellMetrics,
  type LeadLagResponseDirection,
  type LeadLagSearchUniverseDeclaration,
} from "./leadLagDiscoveryTypes";

export function declareLeadLagSearchUniverse(): LeadLagSearchUniverseDeclaration {
  return {
    btcReturnHorizonsMs: [...BTC_RETURN_HORIZONS_MS],
    responseWindowsMs: [...RESPONSE_WINDOWS_MS],
    magnitudeBins: [...BTC_MAGNITUDE_BINS],
    timeRemainingBins: [...TIME_REMAINING_BINS],
    impliedProbabilityBins: [...IMPLIED_PROBABILITY_BINS],
    responseDirections: [...LEAD_LAG_RESPONSE_DIRECTIONS],
    structuralCellCount: LEAD_LAG_STRUCTURAL_CELL_COUNT,
    hypothesisCount: LEAD_LAG_DISCOVERY_HYPOTHESIS_COUNT,
    multiplicityDeclaration:
      `${BTC_RETURN_HORIZONS_MS.length} horizons × ${RESPONSE_WINDOWS_MS.length} response windows × `
      + `${BTC_MAGNITUDE_BINS.length} magnitude bins × ${TIME_REMAINING_BINS.length} time-remaining bins × `
      + `${IMPLIED_PROBABILITY_BINS.length} implied-probability bins × `
      + `${LEAD_LAG_RESPONSE_DIRECTIONS.length} declared directions `
      + `= ${LEAD_LAG_DISCOVERY_HYPOTHESIS_COUNT} hypotheses examined (structural cells `
      + `${LEAD_LAG_STRUCTURAL_CELL_COUNT}). Raw training p-values do not establish an edge.`,
  };
}

function cellId(input: {
  btcMoveHorizonMs: number;
  responseWindowMs: number;
  btcMagnitudeBin: string;
  timeRemainingBin: string;
  impliedProbabilityBin: string;
}): string {
  return [
    input.btcMoveHorizonMs,
    input.responseWindowMs,
    input.btcMagnitudeBin,
    input.timeRemainingBin,
    input.impliedProbabilityBin,
  ].join("|");
}

function hypothesisId(
  structuralCellId: string,
  direction: LeadLagResponseDirection,
): string {
  return `${structuralCellId}|${direction}`;
}

function marketDayKey(marketTicker: string, triggerTimestampMs: number): string {
  const day = new Date(triggerTimestampMs).toISOString().slice(0, 10);
  return `${marketTicker}|${day}`;
}

type MutableDirectionStats = {
  eligibleMarketTriggerCount: number;
  uniqueBtcTriggers: Set<number>;
  uniqueMarkets: Set<string>;
  uniqueMarketDays: Set<string>;
  signedMid: number[];
  signedAsk: number[];
  directionalCorrect: number;
  directionalTotal: number;
  executableVisible: number;
};

function createDirectionStats(): MutableDirectionStats {
  return {
    eligibleMarketTriggerCount: 0,
    uniqueBtcTriggers: new Set(),
    uniqueMarkets: new Set(),
    uniqueMarketDays: new Set(),
    signedMid: [],
    signedAsk: [],
    directionalCorrect: 0,
    directionalTotal: 0,
    executableVisible: 0,
  };
}

type MutableStructuralCell = {
  btcMoveHorizonMs: number;
  responseWindowMs: number;
  btcMagnitudeBin: string;
  timeRemainingBin: string;
  impliedProbabilityBin: string;
  follow: MutableDirectionStats;
  reverse: MutableDirectionStats;
};

function finalizeDirection(
  structural: MutableStructuralCell,
  direction: LeadLagResponseDirection,
  stats: MutableDirectionStats,
): LeadLagDiscoveryCellMetrics {
  const structuralKey = cellId(structural);
  const signedMid =
    direction === "follow-btc"
      ? stats.signedMid
      : stats.signedMid.map((value) => -value);
  const signedAsk =
    direction === "follow-btc"
      ? stats.signedAsk
      : stats.signedAsk.map((value) => -value);
  const directionalShare =
    stats.directionalTotal === 0
      ? null
      : direction === "follow-btc"
        ? stats.directionalCorrect / stats.directionalTotal
        : (stats.directionalTotal - stats.directionalCorrect) / stats.directionalTotal;

  return {
    cellId: structuralKey,
    hypothesisId: hypothesisId(structuralKey, direction),
    btcMoveHorizonMs: structural.btcMoveHorizonMs,
    responseWindowMs: structural.responseWindowMs,
    btcMagnitudeBin: structural.btcMagnitudeBin,
    timeRemainingBin: structural.timeRemainingBin,
    impliedProbabilityBin: structural.impliedProbabilityBin,
    direction,
    eligibleMarketTriggerCount: stats.eligibleMarketTriggerCount,
    uniqueBtcTriggerCount: stats.uniqueBtcTriggers.size,
    independentMarketCount: stats.uniqueMarkets.size,
    independentMarketDayCount: stats.uniqueMarketDays.size,
    medianSignedMidResponseCents: median(signedMid),
    meanSignedMidResponseCents: mean(signedMid),
    directionalResponseShare: directionalShare,
    medianSignedExecutableAskResponseCents: median(signedAsk),
    executableObservabilityShare:
      stats.eligibleMarketTriggerCount === 0
        ? null
        : stats.executableVisible / stats.eligibleMarketTriggerCount,
    midpointResponseDistinctFromExecutable: true,
  };
}

/**
 * Enumerate the full declared search universe and accumulate metrics from events.
 * Losing cells are retained (including empty ones).
 *
 * Independence: each market-trigger event contributes once per response window cell.
 * Multiple response windows from one trigger land in different cells and are not
 * counted as repeated independent samples within a cell. Multiple markets sharing
 * one BTC impulse remain dependent — recorded via uniqueBtcTriggerCount vs eligible count.
 */
export function aggregateLeadLagDiscoveryCells(
  events: readonly LeadLagEventRecord[],
): LeadLagDiscoveryCellMetrics[] {
  const cells = new Map<string, MutableStructuralCell>();

  for (const horizonMs of BTC_RETURN_HORIZONS_MS) {
    for (const responseWindowMs of RESPONSE_WINDOWS_MS) {
      for (const magnitudeBin of BTC_MAGNITUDE_BINS) {
        for (const timeRemainingBin of TIME_REMAINING_BINS) {
          for (const impliedProbabilityBin of IMPLIED_PROBABILITY_BINS) {
            const key = cellId({
              btcMoveHorizonMs: horizonMs,
              responseWindowMs,
              btcMagnitudeBin: magnitudeBin,
              timeRemainingBin,
              impliedProbabilityBin,
            });
            cells.set(key, {
              btcMoveHorizonMs: horizonMs,
              responseWindowMs,
              btcMagnitudeBin: magnitudeBin,
              timeRemainingBin,
              impliedProbabilityBin,
              follow: createDirectionStats(),
              reverse: createDirectionStats(),
            });
          }
        }
      }
    }
  }

  for (const event of events) {
    if (!event.contractDirectionResolved) {
      continue;
    }
    if (event.timeRemainingBin === null || event.impliedProbabilityBin === null) {
      continue;
    }

    for (const response of event.responses) {
      const key = cellId({
        btcMoveHorizonMs: event.btcMoveHorizonMs,
        responseWindowMs: response.responseWindowMs,
        btcMagnitudeBin: event.btcMagnitudeBin,
        timeRemainingBin: event.timeRemainingBin,
        impliedProbabilityBin: event.impliedProbabilityBin,
      });
      const cell = cells.get(key);
      if (!cell) {
        continue;
      }

      for (const direction of LEAD_LAG_RESPONSE_DIRECTIONS) {
        const stats = direction === "follow-btc" ? cell.follow : cell.reverse;
        stats.eligibleMarketTriggerCount += 1;
        stats.uniqueBtcTriggers.add(event.triggerTimestampMs);
        stats.uniqueMarkets.add(event.marketTicker);
        stats.uniqueMarketDays.add(marketDayKey(event.marketTicker, event.triggerTimestampMs));

        if (response.signedYesMidResponseCents !== null) {
          stats.signedMid.push(response.signedYesMidResponseCents);
        }
        if (response.signedYesAskResponseCents !== null) {
          stats.signedAsk.push(response.signedYesAskResponseCents);
          if (Math.abs(response.signedYesAskResponseCents) >= 1) {
            stats.executableVisible += 1;
          }
        }
        if (response.directionallyCorrect !== null) {
          stats.directionalTotal += 1;
          if (response.directionallyCorrect) {
            stats.directionalCorrect += 1;
          }
        }
      }
    }
  }

  const results: LeadLagDiscoveryCellMetrics[] = [];
  // Deterministic iteration order: pre-enumerated key insertion order (axes nested loops).
  for (const cell of cells.values()) {
    for (const direction of LEAD_LAG_RESPONSE_DIRECTIONS) {
      const stats = direction === "follow-btc" ? cell.follow : cell.reverse;
      results.push(finalizeDirection(cell, direction, stats));
    }
  }
  return results;
}

export function computeTrainIncidenceFromEvents(input: {
  events: readonly LeadLagEventRecord[];
  btcTriggerCount: number;
  recordsScanned: number;
  btcRecordsScanned: number;
  trainCaptureHours: number | null;
  suppressedOverlappingTriggerCount: number;
}): {
  uniqueMarketCount: number;
  independentMarketDayCount: number;
  eligibleMarketTriggerCount: number;
  uniqueMarkets: Set<string>;
} {
  const uniqueMarkets = new Set<string>();
  const uniqueMarketDays = new Set<string>();
  let eligibleMarketTriggerCount = 0;

  // Events are market×trigger; count eligible once per event (not per response window).
  for (const event of input.events) {
    if (!event.contractDirectionResolved) {
      continue;
    }
    eligibleMarketTriggerCount += 1;
    uniqueMarkets.add(event.marketTicker);
    uniqueMarketDays.add(marketDayKey(event.marketTicker, event.triggerTimestampMs));
  }

  return {
    uniqueMarketCount: uniqueMarkets.size,
    independentMarketDayCount: uniqueMarketDays.size,
    eligibleMarketTriggerCount,
    uniqueMarkets,
  };
}
