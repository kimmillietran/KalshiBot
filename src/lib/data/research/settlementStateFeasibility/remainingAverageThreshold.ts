/**
 * Arithmetic remaining-average threshold for a fixed 60-sample settlement window.
 *
 * This is not a probability model and does not prove an outcome is unreachable.
 * It answers: what average of the remaining samples would make the full-window
 * mean equal the strike.
 */

export const SETTLEMENT_WINDOW_SAMPLE_COUNT = 60 as const;

export class RemainingAverageThresholdError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RemainingAverageThresholdError";
  }
}

export type RemainingAverageThresholdInput = {
  /** Locked strike / open-reference level (USD). */
  strike: number;
  /** Observed BRTI samples inside the active settlement window (in order). */
  observedSamples: readonly number[];
  /**
   * Total samples in the official window (default 60).
   * Must match Kalshi settlement sample count for the product under study.
   */
  totalSamples?: number;
};

export type RemainingAverageThresholdResult =
  | {
      kind: "remaining-threshold";
      totalSamples: number;
      observedCount: number;
      remainingCount: number;
      observedSum: number;
      /** Average the remaining samples must equal for full-window mean == strike. */
      remainingAverageThreshold: number;
      formula:
        "(totalSamples * strike - sum(observedSamples)) / remainingCount";
    }
  | {
      kind: "completed-window";
      totalSamples: number;
      observedCount: number;
      remainingCount: 0;
      observedSum: number;
      observedMean: number;
      /** Full-window mean relative to strike (arithmetic only). */
      meanMinusStrike: number;
      note: "Window complete; remaining-average threshold is not defined.";
    };

function assertFinitePositiveStrike(strike: number): void {
  if (!Number.isFinite(strike) || strike <= 0) {
    throw new RemainingAverageThresholdError(
      "strike must be a finite positive number",
    );
  }
}

function assertSamples(
  samples: readonly number[],
  totalSamples: number,
): void {
  if (!Number.isInteger(totalSamples) || totalSamples <= 0) {
    throw new RemainingAverageThresholdError(
      "totalSamples must be a positive integer",
    );
  }
  if (samples.length > totalSamples) {
    throw new RemainingAverageThresholdError(
      `observedSamples length ${samples.length} exceeds totalSamples ${totalSamples}`,
    );
  }
  for (let i = 0; i < samples.length; i += 1) {
    const v = samples[i];
    if (!Number.isFinite(v)) {
      throw new RemainingAverageThresholdError(
        `observedSamples[${i}] must be a finite number`,
      );
    }
  }
}

/**
 * Compute the remaining-average threshold, or summarize a completed window.
 *
 * For the 60-sample case:
 *   (60 × strike − sum(observed)) / remainingCount
 */
export function computeRemainingAverageThreshold(
  input: RemainingAverageThresholdInput,
): RemainingAverageThresholdResult {
  const totalSamples = input.totalSamples ?? SETTLEMENT_WINDOW_SAMPLE_COUNT;
  assertFinitePositiveStrike(input.strike);
  assertSamples(input.observedSamples, totalSamples);

  const observedCount = input.observedSamples.length;
  const observedSum = input.observedSamples.reduce((a, b) => a + b, 0);
  const remainingCount = totalSamples - observedCount;

  if (remainingCount === 0) {
    const observedMean = observedSum / totalSamples;
    return {
      kind: "completed-window",
      totalSamples,
      observedCount,
      remainingCount: 0,
      observedSum,
      observedMean,
      meanMinusStrike: observedMean - input.strike,
      note: "Window complete; remaining-average threshold is not defined.",
    };
  }

  return {
    kind: "remaining-threshold",
    totalSamples,
    observedCount,
    remainingCount,
    observedSum,
    remainingAverageThreshold:
      (totalSamples * input.strike - observedSum) / remainingCount,
    formula:
      "(totalSamples * strike - sum(observedSamples)) / remainingCount",
  };
}
