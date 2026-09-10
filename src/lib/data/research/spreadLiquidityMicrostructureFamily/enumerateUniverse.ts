import {
  DIRECTION_CONVENTION,
  IMBALANCE_THRESHOLD_ABS,
  FAMILY_HYPOTHESIS_COUNT,
  RESPONSE_HORIZONS_MS,
  STRUCTURAL_CELL_COUNT,
  TIME_REMAINING_BINS,
  type MicrostructureHypothesisCell,
  type TimeRemainingBinId,
} from "./microstructureFamilyTypes";

export function buildHypothesisId(input: {
  imbalanceThresholdAbs: number;
  responseHorizonMs: number;
  timeRemainingBin: TimeRemainingBinId;
}): string {
  return [
    `imb-${input.imbalanceThresholdAbs.toFixed(2)}`,
    `h-${input.responseHorizonMs}`,
    input.timeRemainingBin,
    DIRECTION_CONVENTION,
  ].join("|");
}

export function enumerateMicrostructureHypotheses(): readonly MicrostructureHypothesisCell[] {
  const cells: MicrostructureHypothesisCell[] = [];
  for (const imbalanceThresholdAbs of IMBALANCE_THRESHOLD_ABS) {
    for (const responseHorizonMs of RESPONSE_HORIZONS_MS) {
      for (const timeRemaining of TIME_REMAINING_BINS) {
        cells.push({
          hypothesisId: buildHypothesisId({
            imbalanceThresholdAbs,
            responseHorizonMs,
            timeRemainingBin: timeRemaining.binId,
          }),
          imbalanceThresholdAbs,
          responseHorizonMs,
          timeRemainingBin: timeRemaining.binId,
          directionConvention: DIRECTION_CONVENTION,
        });
      }
    }
  }
  cells.sort((left, right) => left.hypothesisId.localeCompare(right.hypothesisId));
  if (cells.length !== FAMILY_HYPOTHESIS_COUNT) {
    throw new Error(
      `Expected ${FAMILY_HYPOTHESIS_COUNT} hypotheses; enumerated ${cells.length}`,
    );
  }
  if (STRUCTURAL_CELL_COUNT * 1 !== FAMILY_HYPOTHESIS_COUNT) {
    throw new Error("Direction count must remain 1 for this lineage");
  }
  return cells;
}

export function classifyTimeRemainingBin(
  timeRemainingMs: number,
): TimeRemainingBinId | null {
  if (!Number.isFinite(timeRemainingMs) || timeRemainingMs < 0) {
    return null;
  }
  for (const bin of TIME_REMAINING_BINS) {
    if (timeRemainingMs >= bin.minMsInclusive && timeRemainingMs < bin.maxMsExclusive) {
      return bin.binId;
    }
  }
  return null;
}
