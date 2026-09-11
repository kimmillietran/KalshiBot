import {
  BACKWARD_WINDOWS_MS,
  DIRECTION_CONVENTION,
  DIRECTION_COUNT,
  FAMILY_HYPOTHESIS_COUNT,
  FORWARD_HORIZONS_MS,
  RETURN_THRESHOLDS_CENTS,
  STRUCTURAL_CELL_COUNT,
  type MomentumHypothesisCell,
} from "./momentumFamilyTypes";
import { MomentumFamilyError } from "./momentumFamilyTypes";

export function buildHypothesisId(input: {
  backwardWindowMs: number;
  returnThresholdCents: number;
  forwardHorizonMs: number;
}): string {
  return [
    `W-${input.backwardWindowMs}`,
    `X-${input.returnThresholdCents}`,
    `H-${input.forwardHorizonMs}`,
    DIRECTION_CONVENTION,
  ].join("|");
}

export function enumerateMomentumHypotheses(): readonly MomentumHypothesisCell[] {
  const cells: MomentumHypothesisCell[] = [];
  for (const backwardWindowMs of BACKWARD_WINDOWS_MS) {
    for (const returnThresholdCents of RETURN_THRESHOLDS_CENTS) {
      for (const forwardHorizonMs of FORWARD_HORIZONS_MS) {
        cells.push({
          hypothesisId: buildHypothesisId({
            backwardWindowMs,
            returnThresholdCents,
            forwardHorizonMs,
          }),
          backwardWindowMs,
          returnThresholdCents,
          forwardHorizonMs,
          directionConvention: DIRECTION_CONVENTION,
        });
      }
    }
  }
  cells.sort((left, right) => left.hypothesisId.localeCompare(right.hypothesisId));
  if (cells.length !== FAMILY_HYPOTHESIS_COUNT) {
    throw new MomentumFamilyError(
      `Expected ${FAMILY_HYPOTHESIS_COUNT} hypotheses; enumerated ${cells.length}`,
    );
  }
  if (STRUCTURAL_CELL_COUNT * DIRECTION_COUNT !== FAMILY_HYPOTHESIS_COUNT) {
    throw new MomentumFamilyError("Direction count must remain 1 for this lineage");
  }
  return cells;
}

export function assertNoReversalInUniverse(
  cells: readonly MomentumHypothesisCell[],
): void {
  for (const cell of cells) {
    if (cell.directionConvention !== "continuation") {
      throw new MomentumFamilyError(
        `Reversal candidate cannot be enumerated; got ${cell.directionConvention}`,
      );
    }
    if (/reversal/i.test(cell.hypothesisId)) {
      throw new MomentumFamilyError(`Reversal hypothesis id forbidden: ${cell.hypothesisId}`);
    }
  }
}

export function assertNoProbabilityOrTimeBinAxes(
  cells: readonly MomentumHypothesisCell[],
): void {
  for (const cell of cells) {
    const keys = Object.keys(cell);
    if (keys.some((key) => /probability|timeRemainingBin|hour|volatility/i.test(key))) {
      throw new MomentumFamilyError("Probability/time-bin/hour/volatility axes are forbidden");
    }
  }
}
