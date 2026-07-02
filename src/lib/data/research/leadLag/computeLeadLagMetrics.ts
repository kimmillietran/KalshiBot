import {
  DEFAULT_LEAD_LAG_MAX_LAG,
  type LeadLagCandlePoint,
  type LeadLagDirection,
  type LeadLagLagMetrics,
} from "./leadLagTypes";

const CORRELATION_DECIMALS = 6;

function roundCorrelation(value: number): number {
  const factor = 10 ** CORRELATION_DECIMALS;
  return Math.round(value * factor) / factor;
}

function computePctChanges(values: readonly number[]): number[] {
  const changes: number[] = [];

  for (let index = 1; index < values.length; index += 1) {
    const previous = values[index - 1]!;
    const current = values[index]!;

    if (previous === 0) {
      continue;
    }

    changes.push((current - previous) / previous);
  }

  return changes;
}

function computeAbsoluteChanges(values: readonly number[]): number[] {
  const changes: number[] = [];

  for (let index = 1; index < values.length; index += 1) {
    changes.push(values[index]! - values[index - 1]!);
  }

  return changes;
}

function pearsonCorrelation(left: readonly number[], right: readonly number[]): number | null {
  if (left.length !== right.length || left.length < 2) {
    return null;
  }

  const count = left.length;
  const meanLeft = left.reduce((sum, value) => sum + value, 0) / count;
  const meanRight = right.reduce((sum, value) => sum + value, 0) / count;

  let numerator = 0;
  let denominatorLeft = 0;
  let denominatorRight = 0;

  for (let index = 0; index < count; index += 1) {
    const deltaLeft = left[index]! - meanLeft;
    const deltaRight = right[index]! - meanRight;
    numerator += deltaLeft * deltaRight;
    denominatorLeft += deltaLeft * deltaLeft;
    denominatorRight += deltaRight * deltaRight;
  }

  if (denominatorLeft === 0 || denominatorRight === 0) {
    return null;
  }

  return roundCorrelation(numerator / Math.sqrt(denominatorLeft * denominatorRight));
}

function resolveDirection(lag: number, observationCount: number): LeadLagDirection {
  if (observationCount < 2) {
    return "insufficient-data";
  }

  if (lag === 0) {
    return "synchronous";
  }

  return "btc-leads-kalshi";
}

function alignLagSeries(
  btcChanges: readonly number[],
  probabilityChanges: readonly number[],
  lag: number,
): { btcSeries: number[]; probabilitySeries: number[] } {
  const pairCount = Math.min(btcChanges.length, probabilityChanges.length) - lag;

  if (pairCount < 2) {
    return { btcSeries: [], probabilitySeries: [] };
  }

  const btcSeries: number[] = [];
  const probabilitySeries: number[] = [];

  for (let index = 0; index < pairCount; index += 1) {
    btcSeries.push(btcChanges[index]!);
    probabilitySeries.push(probabilityChanges[index + lag]!);
  }

  return { btcSeries, probabilitySeries };
}

function buildLagMetric(
  lag: number,
  btcChanges: readonly number[],
  probabilityChanges: readonly number[],
): LeadLagLagMetrics {
  const { btcSeries, probabilitySeries } = alignLagSeries(
    btcChanges,
    probabilityChanges,
    lag,
  );
  const observationCount = btcSeries.length;
  const correlation = pearsonCorrelation(btcSeries, probabilitySeries);
  const crossCorrelation = correlation;

  return {
    lag,
    correlation,
    crossCorrelation,
    direction: resolveDirection(lag, observationCount),
    observationCount,
  };
}

export function computeLeadLagMetricsForCandles(
  candles: readonly LeadLagCandlePoint[],
  maxLag: number = DEFAULT_LEAD_LAG_MAX_LAG,
): LeadLagLagMetrics[] {
  const btcChanges = computePctChanges(candles.map((candle) => candle.btcPrice));
  const probabilityChanges = computeAbsoluteChanges(
    candles.map((candle) => candle.impliedProbability),
  );

  const effectiveMaxLag = Math.max(
    0,
    Math.min(maxLag, Math.min(btcChanges.length, probabilityChanges.length) - 1),
  );

  const metrics: LeadLagLagMetrics[] = [];

  for (let lag = 0; lag <= maxLag; lag += 1) {
    if (lag <= effectiveMaxLag) {
      metrics.push(buildLagMetric(lag, btcChanges, probabilityChanges));
    } else {
      metrics.push({
        lag,
        correlation: null,
        crossCorrelation: null,
        direction: "insufficient-data",
        observationCount: 0,
      });
    }
  }

  return metrics;
}

export function computeAggregateLeadLagMetrics(
  candleSeries: readonly (readonly LeadLagCandlePoint[])[],
  maxLag: number = DEFAULT_LEAD_LAG_MAX_LAG,
): LeadLagLagMetrics[] {
  const btcChanges: number[] = [];
  const probabilityChanges: number[] = [];

  for (const candles of candleSeries) {
    const marketBtcChanges = computePctChanges(candles.map((candle) => candle.btcPrice));
    const marketProbabilityChanges = computeAbsoluteChanges(
      candles.map((candle) => candle.impliedProbability),
    );
    const pairCount = Math.min(marketBtcChanges.length, marketProbabilityChanges.length);

    for (let index = 0; index < pairCount; index += 1) {
      btcChanges.push(marketBtcChanges[index]!);
      probabilityChanges.push(marketProbabilityChanges[index]!);
    }
  }

  const effectiveMaxLag = Math.max(
    0,
    Math.min(maxLag, Math.min(btcChanges.length, probabilityChanges.length) - 1),
  );

  const metrics: LeadLagLagMetrics[] = [];

  for (let lag = 0; lag <= maxLag; lag += 1) {
    if (lag <= effectiveMaxLag) {
      metrics.push(buildLagMetric(lag, btcChanges, probabilityChanges));
    } else {
      metrics.push({
        lag,
        correlation: null,
        crossCorrelation: null,
        direction: "insufficient-data",
        observationCount: 0,
      });
    }
  }

  return metrics;
}

export function selectBestLag(
  metrics: readonly LeadLagLagMetrics[],
): { bestLag: number | null; bestDirection: LeadLagDirection } {
  let bestLag: number | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const metric of metrics) {
    if (metric.crossCorrelation === null) {
      continue;
    }

    const score = Math.abs(metric.crossCorrelation);
    if (score > bestScore || (score === bestScore && (bestLag ?? Infinity) > metric.lag)) {
      bestScore = score;
      bestLag = metric.lag;
    }
  }

  if (bestLag === null) {
    return { bestLag: null, bestDirection: "insufficient-data" };
  }

  const bestMetric = metrics.find((metric) => metric.lag === bestLag);
  return {
    bestLag,
    bestDirection: bestMetric?.direction ?? "insufficient-data",
  };
}
