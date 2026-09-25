/**
 * Pre-entry Coinbase completed-1m realized volatility (frozen v2 window).
 * Candles eligible only when closeTimeMs < entryTimestampMs.
 */

import { estimateRealizedVolatility } from "@/lib/data/strategies/fairValueDiffusion/fairValueDiffusionModel";
import type { EvaluationCandleSnapshot } from "@/types/domain/trading";

import {
  M17_PREENTRY_VOLATILITY_CONTRACT,
  type VolatilityFeatureStatus,
} from "./types";

export type CompletedMinuteBar = {
  openTimeMs: number;
  closeTimeMs: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type PreentryVolatilityResult = {
  annualizedRealizedVolatility: number | null;
  status: VolatilityFeatureStatus;
  candleCount: number;
  selectedOpenTimeMs: readonly number[];
  selectedCandles: readonly EvaluationCandleSnapshot[];
};

function rightmostEligibleIndex(
  bars: readonly CompletedMinuteBar[],
  entryTimestampMs: number,
): number {
  let low = 0;
  let high = bars.length - 1;
  let result = -1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const bar = bars[mid]!;
    if (bar.closeTimeMs < entryTimestampMs) {
      result = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return result;
}

/**
 * Historical-replica window: last `requiredCloseCount` completed minutes with
 * closeTimeMs < entryTimestampMs. Missing minutes are omitted (no gap gate).
 * Matches buildHistoricalReplicaVolatilityWindow selection semantics.
 */
export function computePreentryRealizedVolatility(input: {
  barsAscendingByClose: readonly CompletedMinuteBar[];
  entryTimestampMs: number;
  requiredCloseCount?: number;
  lookbackBars?: number;
}): PreentryVolatilityResult {
  const requiredCloseCount =
    input.requiredCloseCount ?? M17_PREENTRY_VOLATILITY_CONTRACT.requiredCloseCount;
  const lookbackBars =
    input.lookbackBars ?? M17_PREENTRY_VOLATILITY_CONTRACT.lookbackBars;

  if (!Number.isFinite(input.entryTimestampMs)) {
    return {
      annualizedRealizedVolatility: null,
      status: "estimate-unavailable",
      candleCount: 0,
      selectedOpenTimeMs: [],
      selectedCandles: [],
    };
  }

  if (input.barsAscendingByClose.length === 0) {
    return {
      annualizedRealizedVolatility: null,
      status: "candles-unavailable",
      candleCount: 0,
      selectedOpenTimeMs: [],
      selectedCandles: [],
    };
  }

  const last = rightmostEligibleIndex(
    input.barsAscendingByClose,
    input.entryTimestampMs,
  );
  if (last < 0) {
    return {
      annualizedRealizedVolatility: null,
      status: "insufficient-completed-minutes",
      candleCount: 0,
      selectedOpenTimeMs: [],
      selectedCandles: [],
    };
  }

  const selected: EvaluationCandleSnapshot[] = [];
  const selectedOpenTimeMs: number[] = [];

  for (let cursor = last; cursor >= 0; cursor -= 1) {
    const bar = input.barsAscendingByClose[cursor]!;
    if (bar.closeTimeMs >= input.entryTimestampMs) {
      continue;
    }
    selected.push({
      timestamp: bar.closeTimeMs,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
    });
    selectedOpenTimeMs.push(bar.openTimeMs);
    if (selected.length === requiredCloseCount) {
      break;
    }
  }

  if (selected.length < requiredCloseCount) {
    return {
      annualizedRealizedVolatility: null,
      status: "insufficient-completed-minutes",
      candleCount: selected.length,
      selectedOpenTimeMs: selectedOpenTimeMs.reverse(),
      selectedCandles: selected.reverse(),
    };
  }

  selected.reverse();
  selectedOpenTimeMs.reverse();

  const estimate = estimateRealizedVolatility(selected, lookbackBars);
  if (!estimate) {
    return {
      annualizedRealizedVolatility: null,
      status: "estimate-unavailable",
      candleCount: selected.length,
      selectedOpenTimeMs,
      selectedCandles: selected,
    };
  }

  return {
    annualizedRealizedVolatility: estimate.annualizedVol,
    status: "ok",
    candleCount: selected.length,
    selectedOpenTimeMs,
    selectedCandles: selected,
  };
}

/** True when any selected candle closes at or after entry (leakage). */
export function volatilityWindowLeaksFuture(
  selectedCloseTimeMs: readonly number[],
  entryTimestampMs: number,
): boolean {
  return selectedCloseTimeMs.some(
    (closeTimeMs) => closeTimeMs >= entryTimestampMs,
  );
}
