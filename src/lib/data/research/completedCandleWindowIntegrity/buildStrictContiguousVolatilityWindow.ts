import { estimateRealizedVolatility } from "@/lib/data/strategies/fairValueDiffusion/fairValueDiffusionModel";
import type { EvaluationCandleSnapshot } from "@/types/domain/trading";

import type {
  CompletedCandleObservationIndex,
} from "../calibrationFadeV2ForwardValidation/preloadCompletedBtcCandleObservations";
import { selectCausalClosedMinuteAsOfT } from "../calibrationFadeV2ForwardValidation/preloadCompletedBtcCandleObservations";
import { assessCandleWindowContiguity } from "./assessCandleWindowContiguity";
import {
  DEFAULT_STRICT_CONTIGUOUS_1M_CONTRACT,
  type CandleWindowContiguityAssessment,
  type StrictContiguousVolatilityWindowContract,
  type StrictContiguousWindowRejectionReason,
} from "./completedCandleWindowIntegrityTypes";

export type StrictContiguousVolatilityWindow = {
  available: boolean;
  annualizedVolatility: number | null;
  candles: readonly EvaluationCandleSnapshot[];
  selectedOpenTimeMs: readonly number[];
  rejectionReason: StrictContiguousWindowRejectionReason | null;
  contiguity: CandleWindowContiguityAssessment | null;
  contract: StrictContiguousVolatilityWindowContract;
  /**
   * Opt-in future-contract primitive. Must not be used as a silent replacement
   * for frozen calibration-fade v2 historical-replica selection.
   */
  evidenceContractKind: "strict-contiguous-completed-candle-v1";
};

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
 * Future-lineage primitive: build a volatility window that fails closed unless
 * the trailing requiredCloseCount completed minutes are exactly contiguous at
 * expectedBarIntervalMs. Not wired into frozen v2.
 */
export function buildStrictContiguousVolatilityWindow(input: {
  index: CompletedCandleObservationIndex;
  timestampMs: number;
  contract?: Partial<StrictContiguousVolatilityWindowContract>;
}): StrictContiguousVolatilityWindow {
  const contract: StrictContiguousVolatilityWindowContract = {
    ...DEFAULT_STRICT_CONTIGUOUS_1M_CONTRACT,
    ...input.contract,
    requireContiguousWindow: true,
    sourceRecordType: "exchange-completed-1m-ohlc",
  };

  const empty = (
    rejectionReason: StrictContiguousWindowRejectionReason,
    partial?: {
      candles?: readonly EvaluationCandleSnapshot[];
      selectedOpenTimeMs?: readonly number[];
      contiguity?: CandleWindowContiguityAssessment | null;
    },
  ): StrictContiguousVolatilityWindow => ({
    available: false,
    annualizedVolatility: null,
    candles: partial?.candles ?? [],
    selectedOpenTimeMs: partial?.selectedOpenTimeMs ?? [],
    rejectionReason,
    contiguity: partial?.contiguity ?? null,
    contract,
    evidenceContractKind: "strict-contiguous-completed-candle-v1",
  });

  const lastCompletedIndex = rightmostCompletedMinuteIndex(
    input.index.minutesByCloseTimeMs,
    input.timestampMs,
  );
  if (lastCompletedIndex < 0) {
    return empty("insufficient-completed-minutes");
  }

  const selected: EvaluationCandleSnapshot[] = [];
  const selectedOpenTimeMs: number[] = [];

  for (let cursor = lastCompletedIndex; cursor >= 0; cursor -= 1) {
    const history = input.index.minutesByCloseTimeMs[cursor]!;
    if (history.closeTimeMs >= input.timestampMs) {
      continue;
    }
    if (history.timingConflict) {
      return empty("timing-identity-conflict");
    }
    const observation = selectCausalClosedMinuteAsOfT(history, input.timestampMs);
    if (!observation) {
      continue;
    }

    if (selectedOpenTimeMs.length > 0) {
      // selectedOpenTimeMs is built newest-first before reverse.
      const newerOpen = selectedOpenTimeMs[selectedOpenTimeMs.length - 1]!;
      const olderOpen = observation.openTimeMs;
      const delta = newerOpen - olderOpen;
      if (delta <= 0) {
        return empty("invalid-non-monotonic-timestamps", {
          candles: [...selected].reverse(),
          selectedOpenTimeMs: [...selectedOpenTimeMs].reverse(),
        });
      }
      if (delta !== contract.expectedBarIntervalMs) {
        const contiguity = assessCandleWindowContiguity({
          timestampsMs: [...selectedOpenTimeMs, observation.openTimeMs].reverse(),
          expectedIntervalMs: contract.expectedBarIntervalMs,
          timestampKind: "open-time",
          minimumCandleCount: 2,
        });
        return empty("gap-detected", {
          candles: [...selected].reverse(),
          selectedOpenTimeMs: [...selectedOpenTimeMs].reverse(),
          contiguity,
        });
      }
    }

    selected.push({
      timestamp: observation.closeTimeMs,
      open: observation.open,
      high: observation.high,
      low: observation.low,
      close: observation.close,
    });
    selectedOpenTimeMs.push(observation.openTimeMs);

    if (selected.length === contract.requiredCloseCount) {
      break;
    }
  }

  if (selected.length < contract.requiredCloseCount) {
    return empty("insufficient-completed-minutes", {
      candles: selected.reverse(),
      selectedOpenTimeMs: selectedOpenTimeMs.reverse(),
    });
  }

  selected.reverse();
  selectedOpenTimeMs.reverse();

  const contiguity = assessCandleWindowContiguity({
    timestampsMs: selectedOpenTimeMs,
    expectedIntervalMs: contract.expectedBarIntervalMs,
    timestampKind: "open-time",
    minimumCandleCount: contract.requiredCloseCount,
  });

  if (!contiguity.isContiguous) {
    const rejectionReason: StrictContiguousWindowRejectionReason =
      contiguity.status === "invalid-non-monotonic-timestamps"
        ? "invalid-non-monotonic-timestamps"
        : contiguity.status === "insufficient-data"
          ? "insufficient-completed-minutes"
          : "gap-detected";
    return empty(rejectionReason, {
      candles: selected,
      selectedOpenTimeMs,
      contiguity,
    });
  }

  const estimate = estimateRealizedVolatility(selected, contract.lookbackBars);
  if (!estimate) {
    return empty("volatility-estimate-unavailable", {
      candles: selected,
      selectedOpenTimeMs,
      contiguity,
    });
  }

  return {
    available: true,
    annualizedVolatility: estimate.annualizedVol,
    candles: selected,
    selectedOpenTimeMs,
    rejectionReason: null,
    contiguity,
    contract,
    evidenceContractKind: "strict-contiguous-completed-candle-v1",
  };
}

/**
 * Assess an already-selected open-time series under the strict future contract
 * without rebuilding the window.
 */
export function requireContiguousCompletedCandleWindow(input: {
  selectedOpenTimeMs: readonly number[];
  expectedBarIntervalMs?: number;
  requiredCloseCount?: number;
}): CandleWindowContiguityAssessment {
  return assessCandleWindowContiguity({
    timestampsMs: input.selectedOpenTimeMs,
    expectedIntervalMs:
      input.expectedBarIntervalMs ?? DEFAULT_STRICT_CONTIGUOUS_1M_CONTRACT.expectedBarIntervalMs,
    timestampKind: "open-time",
    minimumCandleCount:
      input.requiredCloseCount ?? DEFAULT_STRICT_CONTIGUOUS_1M_CONTRACT.requiredCloseCount,
  });
}
