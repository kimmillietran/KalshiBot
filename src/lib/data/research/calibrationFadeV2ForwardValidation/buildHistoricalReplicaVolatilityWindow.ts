import { estimateRealizedVolatility } from "@/lib/data/strategies/fairValueDiffusion/fairValueDiffusionModel";
import type { EvaluationCandleSnapshot } from "@/types/domain/trading";

import {
  V2_REQUIRED_CLOSE_COUNT,
  V2_REQUIRED_LOOKBACK_BARS,
  type HistoricalReplicaVolatilityWindow,
} from "./calibrationFadeV2ForwardValidationTypes";
import type { CompletedCandleObservationIndex } from "./preloadCompletedBtcCandleObservations";
import { selectCausalClosedMinuteAsOfT } from "./preloadCompletedBtcCandleObservations";

function rightmostCompletedMinuteIndex(
  minutes: CompletedCandleObservationIndex["minutesByCloseTimeMs"],
  timestampMs: number,
): number {
  let low = 0;
  let high = minutes.length - 1;
  let result = -1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const minute = minutes[middle]!;
    if (minute.closeTimeMs < timestampMs) {
      result = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return result;
}

/**
 * Historical-replica v2 window: last 11 distinct exchange minutes that are
 * completed before T and causally observed by T. No adjacency/gap gate.
 * Missing minutes are omitted. As-of-T revisions use the latest
 * observedAtLocal <= T.
 */
export function buildHistoricalReplicaVolatilityWindow(input: {
  index: CompletedCandleObservationIndex;
  timestampMs: number;
}): HistoricalReplicaVolatilityWindow {
  const lastCompletedIndex = rightmostCompletedMinuteIndex(
    input.index.minutesByCloseTimeMs,
    input.timestampMs,
  );
  if (lastCompletedIndex < 0) {
    return {
      available: false,
      annualizedVolatility: null,
      candles: [],
      selectedOpenTimeMs: [],
      rejectionReason: "insufficient-completed-minutes",
    };
  }

  const selected: EvaluationCandleSnapshot[] = [];
  const selectedOpenTimeMs: number[] = [];

  for (let cursor = lastCompletedIndex; cursor >= 0; cursor -= 1) {
    const history = input.index.minutesByCloseTimeMs[cursor]!;
    if (history.closeTimeMs >= input.timestampMs) {
      continue;
    }
    if (history.timingConflict) {
      return {
        available: false,
        annualizedVolatility: null,
        candles: [],
        selectedOpenTimeMs: [],
        rejectionReason: "timing-identity-conflict",
      };
    }
    const observation = selectCausalClosedMinuteAsOfT(history, input.timestampMs);
    if (!observation) {
      continue;
    }
    selected.push({
      timestamp: observation.closeTimeMs,
      open: observation.open,
      high: observation.high,
      low: observation.low,
      close: observation.close,
    });
    selectedOpenTimeMs.push(observation.openTimeMs);
    if (selected.length === V2_REQUIRED_CLOSE_COUNT) {
      break;
    }
  }

  if (selected.length < V2_REQUIRED_CLOSE_COUNT) {
    return {
      available: false,
      annualizedVolatility: null,
      candles: selected.reverse(),
      selectedOpenTimeMs: selectedOpenTimeMs.reverse(),
      rejectionReason: "insufficient-completed-minutes",
    };
  }

  selected.reverse();
  selectedOpenTimeMs.reverse();

  const estimate = estimateRealizedVolatility(selected, V2_REQUIRED_LOOKBACK_BARS);
  if (!estimate) {
    return {
      available: false,
      annualizedVolatility: null,
      candles: selected,
      selectedOpenTimeMs,
      rejectionReason: "volatility-estimate-unavailable",
    };
  }

  return {
    available: true,
    annualizedVolatility: estimate.annualizedVol,
    candles: selected,
    selectedOpenTimeMs,
    rejectionReason: null,
  };
}
