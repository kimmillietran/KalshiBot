/**
 * Causal as-of join helpers — never pull future observations into a decision.
 */

export function findLastAtOrBefore<T extends { timestampMs: number }>(
  points: readonly T[],
  timestampMs: number,
): T | null {
  if (points.length === 0) {
    return null;
  }
  let left = 0;
  let right = points.length - 1;
  let result: T | null = null;
  while (left <= right) {
    const middle = Math.floor((left + right) / 2);
    const point = points[middle]!;
    if (point.timestampMs <= timestampMs) {
      result = point;
      left = middle + 1;
    } else {
      right = middle - 1;
    }
  }
  return result;
}

export function assertNoFutureLeakage(input: {
  decisionTimestampMs: number;
  observationTimestampMs: number;
}): void {
  if (input.observationTimestampMs > input.decisionTimestampMs) {
    throw new Error(
      `future-leakage-guard: observation ${input.observationTimestampMs} `
        + `> decision ${input.decisionTimestampMs}`,
    );
  }
}

export function joinAsOf<T extends { timestampMs: number }>(input: {
  series: readonly T[];
  decisionTimestampMs: number;
  maxAgeMs: number;
}): {
  sample: T | null;
  sampleAgeMs: number | null;
  joined: boolean;
  stale: boolean;
  futureLeakageGuardStatus: "pass";
} {
  const sample = findLastAtOrBefore(input.series, input.decisionTimestampMs);
  if (!sample) {
    return {
      sample: null,
      sampleAgeMs: null,
      joined: false,
      stale: false,
      futureLeakageGuardStatus: "pass",
    };
  }
  assertNoFutureLeakage({
    decisionTimestampMs: input.decisionTimestampMs,
    observationTimestampMs: sample.timestampMs,
  });
  const sampleAgeMs = input.decisionTimestampMs - sample.timestampMs;
  if (sampleAgeMs > input.maxAgeMs) {
    return {
      sample,
      sampleAgeMs,
      joined: false,
      stale: true,
      futureLeakageGuardStatus: "pass",
    };
  }
  return {
    sample,
    sampleAgeMs,
    joined: true,
    stale: false,
    futureLeakageGuardStatus: "pass",
  };
}
