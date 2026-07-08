import {
  computeMinimumDetectableEffect,
  computeObservedPower,
  mean,
  roundMetric,
  sampleStandardDeviation,
} from "@/lib/data/research/powerAnalysis/powerAnalysisMath";
import {
  computeTStatistic,
  oneSampleTTestPValueGreaterThanZero,
} from "@/lib/data/research/statisticalSignificance/studentTTest";

export function harmonicNumber(m: number): number {
  if (m <= 0) {
    return 0;
  }

  let sum = 0;
  for (let index = 1; index <= m; index += 1) {
    sum += 1 / index;
  }

  return sum;
}

function clampPValue(value: number): number {
  return roundMetric(Math.min(1, Math.max(0, value)));
}

export type RawPValueEntry = {
  id: string;
  rawPValue: number | null;
};

function sortByRawPValue(entries: readonly RawPValueEntry[]): RawPValueEntry[] {
  return [...entries].sort((left, right) => {
    if (left.rawPValue === null && right.rawPValue === null) {
      return left.id.localeCompare(right.id);
    }
    if (left.rawPValue === null) {
      return 1;
    }
    if (right.rawPValue === null) {
      return -1;
    }
    if (left.rawPValue !== right.rawPValue) {
      return left.rawPValue - right.rawPValue;
    }

    return left.id.localeCompare(right.id);
  });
}

/** Benjamini-Yekutieli FDR under arbitrary dependence (conservative). */
export function computeBenjaminiYekutieliFdr(
  entries: readonly RawPValueEntry[],
  alpha: number,
): Array<{
  id: string;
  rawPValue: number | null;
  qValue: number | null;
  correctedPValue: number | null;
  rejected: boolean;
}> {
  const sorted = sortByRawPValue(entries);
  const validEntries = sorted.filter((entry) => entry.rawPValue !== null);
  const m = validEntries.length;
  const cm = harmonicNumber(m);

  const qValues = new Map<string, number>();
  let runningMinimum = 1;

  for (let index = m - 1; index >= 0; index -= 1) {
    const entry = validEntries[index]!;
    const rank = index + 1;
    const adjusted = clampPValue((entry.rawPValue! * m * cm) / rank);
    runningMinimum = Math.min(runningMinimum, adjusted);
    qValues.set(entry.id, runningMinimum);
  }

  let largestSignificantRank = 0;
  for (let index = 0; index < validEntries.length; index += 1) {
    const entry = validEntries[index]!;
    const rank = index + 1;
    if (entry.rawPValue! <= (alpha * rank) / (m * cm)) {
      largestSignificantRank = rank;
    }
  }

  const significantIds = new Set(
    validEntries.slice(0, largestSignificantRank).map((entry) => entry.id),
  );

  return sorted.map((entry) => {
    if (entry.rawPValue === null || m === 0) {
      return {
        id: entry.id,
        rawPValue: entry.rawPValue,
        qValue: null,
        correctedPValue: null,
        rejected: false,
      };
    }

    const qValue = qValues.get(entry.id) ?? null;

    return {
      id: entry.id,
      rawPValue: entry.rawPValue,
      qValue,
      correctedPValue: qValue,
      rejected: significantIds.has(entry.id),
    };
  });
}

export function computeEffectiveSampleSizeEstimate(input: {
  rawObservationCount: number;
  independentMarketCount: number;
  marketDayCount: number;
}): number {
  if (input.rawObservationCount === 0) {
    return 0;
  }

  const limits = [input.rawObservationCount, input.marketDayCount];
  if (input.independentMarketCount > 0) {
    limits.push(input.independentMarketCount);
  }

  return Math.max(1, Math.min(...limits));
}

export function computeSignedEdgeSamples(
  observations: readonly {
    predictedProbability: number;
    observedOutcome: 0 | 1;
    calibrationDirection: "over" | "under";
  }[],
): number[] {
  return observations.map((observation) => {
    const signedError = observation.observedOutcome - observation.predictedProbability;
    return observation.calibrationDirection === "over" ? signedError : -signedError;
  });
}

export function computeSplitPowerMetrics(input: {
  edgeSamples: readonly number[];
  effectiveSampleSize: number;
  alpha: number;
  targetPower: number;
  minEffectCents: number;
}): {
  observedNetEdge: number | null;
  standardError: number | null;
  confidenceInterval95: { lower: number; upper: number } | null;
  minimumDetectableEffect: number | null;
  tStatistic: number | null;
  uncorrectedPValue: number | null;
  clearsMde: boolean;
  isUnderpowered: boolean;
  underpoweredReason: string | null;
} {
  const rawCount = input.edgeSamples.length;
  const inferenceSampleSize = Math.max(
    1,
    Math.min(rawCount, Math.floor(input.effectiveSampleSize)),
  );

  if (rawCount < 2 || inferenceSampleSize < 2) {
    return {
      observedNetEdge: rawCount === 1 ? roundMetric(input.edgeSamples[0]!) : null,
      standardError: null,
      confidenceInterval95: null,
      minimumDetectableEffect: null,
      tStatistic: null,
      uncorrectedPValue: null,
      clearsMde: false,
      isUnderpowered: true,
      underpoweredReason: "Fewer than two edge samples in split",
    };
  }

  const observedNetEdge = mean(input.edgeSamples);
  const standardDeviation = sampleStandardDeviation(input.edgeSamples);
  const standardError =
    standardDeviation === null
      ? null
      : standardDeviation / Math.sqrt(inferenceSampleSize);
  const confidenceInterval95 =
    observedNetEdge !== null && standardError !== null
      ? {
          lower: roundMetric(observedNetEdge - 1.96 * standardError),
          upper: roundMetric(observedNetEdge + 1.96 * standardError),
        }
      : null;
  const tStatistic =
    observedNetEdge !== null && standardError !== null
      ? computeTStatistic(observedNetEdge, standardError)
      : null;
  const uncorrectedPValue =
    tStatistic !== null
      ? oneSampleTTestPValueGreaterThanZero(tStatistic, inferenceSampleSize - 1)
      : null;

  const minimumDetectableEffect =
    standardDeviation !== null
      ? computeMinimumDetectableEffect({
          sampleSize: inferenceSampleSize,
          standardDeviation,
          alpha: input.alpha,
          targetPower: input.targetPower,
        })
      : null;

  const minEffectProbability = input.minEffectCents / 100;
  const observedPower =
    observedNetEdge !== null && standardDeviation !== null
      ? computeObservedPower({
          sampleSize: inferenceSampleSize,
          meanPnlCents: observedNetEdge * 100,
          standardDeviation: standardDeviation * 100,
          alpha: input.alpha,
        })
      : null;

  const clearsMde =
    observedNetEdge !== null
    && minimumDetectableEffect !== null
    && observedNetEdge >= Math.max(minimumDetectableEffect, minEffectProbability);

  const isUnderpowered =
    observedPower !== null
    && observedPower < input.targetPower
    && !clearsMde;

  let underpoweredReason: string | null = null;
  if (isUnderpowered) {
    underpoweredReason = `Observed power ${observedPower} below target ${input.targetPower}`;
  }

  return {
    observedNetEdge: observedNetEdge === null ? null : roundMetric(observedNetEdge),
    standardError: standardError === null ? null : roundMetric(standardError),
    confidenceInterval95,
    minimumDetectableEffect,
    tStatistic: tStatistic === null ? null : roundMetric(tStatistic),
    uncorrectedPValue:
      uncorrectedPValue === null ? null : roundMetric(uncorrectedPValue),
    clearsMde,
    isUnderpowered,
    underpoweredReason,
  };
}

export type MarketDayBlock<T> = {
  blockKey: string;
  items: T[];
};

export function groupObservationsByMarketDay<T extends {
  marketTicker: string;
  tradingDayUtc?: string | null;
}>(observations: readonly T[]): MarketDayBlock<T>[] {
  const groups = new Map<string, T[]>();

  for (const observation of observations) {
    const day = observation.tradingDayUtc ?? "unknown-day";
    const blockKey = `${observation.marketTicker}:${day}`;
    const existing = groups.get(blockKey) ?? [];
    existing.push(observation);
    groups.set(blockKey, existing);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([blockKey, items]) => ({ blockKey, items }));
}

/** Scaffold for block-bootstrap reality-check correction across candidates. */
export function scaffoldBlockBootstrapRealityCheck(input: {
  candidateIds: readonly string[];
  blockCount: number;
  iterations: number;
  seed: number;
}): {
  status: "scaffolded";
  iterations: number;
  blockCount: number;
  candidateCount: number;
  note: string;
} {
  return {
    status: "scaffolded",
    iterations: input.iterations,
    blockCount: input.blockCount,
    candidateCount: input.candidateIds.length,
    note:
      "Block-bootstrap max-stat reality check is scaffolded; BY correction is the active conservative path.",
  };
}
