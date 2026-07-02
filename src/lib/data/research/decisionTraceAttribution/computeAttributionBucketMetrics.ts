import {
  MIN_ATTRIBUTION_SAMPLE_SIZE,
  type AttributionBucketSummary,
  type AttributionObservation,
} from "./decisionTraceAttributionTypes";

function roundMetric(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function average(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildSparseSampleWarning(count: number): readonly string[] {
  if (count >= MIN_ATTRIBUTION_SAMPLE_SIZE) {
    return [];
  }
  return [
    `Sparse sample: ${count} observation(s); minimum recommended is ${MIN_ATTRIBUTION_SAMPLE_SIZE}.`,
  ];
}

function summarizeBucket(
  bucketId: string,
  bucketLabel: string,
  observations: readonly AttributionObservation[],
  readPnl: (observation: AttributionObservation) => number,
  readFillPrice: (observation: AttributionObservation) => number,
  readIsWin: (observation: AttributionObservation) => boolean,
): AttributionBucketSummary {
  const pnls = observations.map(readPnl);
  const fillPrices = observations.map(readFillPrice);
  const wins = observations.filter(readIsWin).length;
  const avgPnl = average(pnls);
  const avgFill = average(fillPrices);

  return {
    bucketId,
    bucketLabel,
    count: observations.length,
    averagePnlCents: avgPnl === null ? null : roundMetric(avgPnl),
    winRatePct:
      observations.length === 0 ? null : roundMetric((wins / observations.length) * 100),
    averageFillPriceCents: avgFill === null ? null : roundMetric(avgFill),
    warnings: buildSparseSampleWarning(observations.length),
  };
}

type BucketGroup = {
  bucketId: string;
  bucketLabel: string;
  observations: AttributionObservation[];
};

function groupObservations(
  observations: readonly AttributionObservation[],
  readBucketId: (observation: AttributionObservation) => string,
  readBucketLabel: (observation: AttributionObservation) => string,
): BucketGroup[] {
  const groups = new Map<string, BucketGroup>();

  for (const observation of observations) {
    const bucketId = readBucketId(observation);
    const bucketLabel = readBucketLabel(observation);
    const existing = groups.get(bucketId);
    if (existing) {
      existing.observations.push(observation);
      continue;
    }
    groups.set(bucketId, { bucketId, bucketLabel, observations: [observation] });
  }

  return [...groups.values()].sort((left, right) =>
    left.bucketId.localeCompare(right.bucketId),
  );
}

function summarizeGroups(
  groups: readonly BucketGroup[],
): AttributionBucketSummary[] {
  return groups.map((group) =>
    summarizeBucket(
      group.bucketId,
      group.bucketLabel,
      group.observations,
      (observation) => observation.pnlCents,
      (observation) => observation.fillPriceCents,
      (observation) => observation.isWin,
    ),
  );
}

export function computeActionBuckets(
  observations: readonly AttributionObservation[],
): AttributionBucketSummary[] {
  return summarizeGroups(
    groupObservations(
      observations,
      (observation) => observation.action,
      (observation) => observation.action,
    ),
  );
}

export function computeYesMidBuckets(
  observations: readonly AttributionObservation[],
): AttributionBucketSummary[] {
  return summarizeGroups(
    groupObservations(
      observations,
      (observation) => observation.yesMidBucketId,
      (observation) => observation.yesMidBucketLabel,
    ),
  );
}

export function computeTimeRemainingBuckets(
  observations: readonly AttributionObservation[],
): AttributionBucketSummary[] {
  return summarizeGroups(
    groupObservations(
      observations,
      (observation) => observation.timeRemainingBucketId,
      (observation) => observation.timeRemainingBucketLabel,
    ),
  );
}

export function computeBtcReturnBuckets(
  observations: readonly AttributionObservation[],
): AttributionBucketSummary[] {
  return summarizeGroups(
    groupObservations(
      observations,
      (observation) => observation.btcReturnBucketId,
      (observation) => observation.btcReturnBucketLabel,
    ),
  );
}

export function computeRegimeTagBuckets(
  observations: readonly AttributionObservation[],
): AttributionBucketSummary[] {
  return summarizeGroups(
    groupObservations(
      observations,
      (observation) => observation.regimeTagBucketId,
      (observation) => observation.regimeTagBucketLabel,
    ),
  );
}

export function computeStrategyBuckets(
  observations: readonly AttributionObservation[],
): AttributionBucketSummary[] {
  return summarizeGroups(
    groupObservations(
      observations,
      (observation) => observation.strategyId,
      (observation) => observation.strategyId,
    ),
  );
}
