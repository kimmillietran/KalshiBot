/** Fixed normal quantiles for deterministic power analysis (one-tailed α, power). */
export const NORMAL_Z_ONE_TAILED_ALPHA_005 = 1.6448536269;
export const NORMAL_Z_POWER_080 = 0.8416212336;
export const NORMAL_Z_POWER_090 = 1.2815515655;
export const NORMAL_Z_POWER_095 = 1.6448536269;
export const NORMAL_Z_TWO_TAILED_975 = 1.9599639845;

const T_CRITICAL_975: readonly number[] = [
  12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228,
  2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086,
  2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045,
];

export function mean(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function sampleVariance(values: readonly number[]): number | null {
  if (values.length < 2) {
    return null;
  }

  const average = mean(values)!;
  return (
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) /
    (values.length - 1)
  );
}

export function sampleStandardDeviation(values: readonly number[]): number | null {
  const variance = sampleVariance(values);
  return variance === null ? null : Math.sqrt(variance);
}

export function roundMetric(value: number, decimals = 6): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function zCriticalForPower(targetPower: number): number {
  if (targetPower === 0.8) {
    return NORMAL_Z_POWER_080;
  }

  if (targetPower === 0.9) {
    return NORMAL_Z_POWER_090;
  }

  if (targetPower === 0.95) {
    return NORMAL_Z_POWER_095;
  }

  throw new Error(`Unsupported target power: ${targetPower}`);
}

export function tCritical975(degreesOfFreedom: number): number {
  if (degreesOfFreedom < 1) {
    return Number.POSITIVE_INFINITY;
  }

  if (degreesOfFreedom <= T_CRITICAL_975.length) {
    return T_CRITICAL_975[degreesOfFreedom - 1]!;
  }

  return NORMAL_Z_TWO_TAILED_975;
}

export function computeMeanConfidenceInterval95(
  values: readonly number[],
): { lower: number; upper: number } | null {
  if (values.length < 2) {
    return null;
  }

  const sampleMean = mean(values)!;
  const standardDeviation = sampleStandardDeviation(values)!;
  const standardError = standardDeviation / Math.sqrt(values.length);
  const critical = tCritical975(values.length - 1);
  const margin = critical * standardError;

  return {
    lower: roundMetric(sampleMean - margin),
    upper: roundMetric(sampleMean + margin),
  };
}

export function computeRequiredSampleSize(input: {
  edgeCents: number;
  standardDeviation: number;
  alpha: number;
  targetPower: number;
}): number | null {
  if (input.edgeCents <= 0 || input.standardDeviation <= 0) {
    return null;
  }

  const zAlpha = NORMAL_Z_ONE_TAILED_ALPHA_005;
  const zBeta = zCriticalForPower(input.targetPower);
  const numerator = (zAlpha + zBeta) ** 2 * input.standardDeviation ** 2;
  const denominator = input.edgeCents ** 2;

  return Math.ceil(numerator / denominator);
}

export function computeMinimumDetectableEffect(input: {
  sampleSize: number;
  standardDeviation: number;
  alpha: number;
  targetPower: number;
}): number | null {
  if (input.sampleSize < 2 || input.standardDeviation <= 0) {
    return null;
  }

  const zAlpha = NORMAL_Z_ONE_TAILED_ALPHA_005;
  const zBeta = zCriticalForPower(input.targetPower);
  const mde =
    ((zAlpha + zBeta) * input.standardDeviation) / Math.sqrt(input.sampleSize);

  return roundMetric(mde);
}

/** Normal-approximation power for one-tailed mean > 0 test. */
export function computeObservedPower(input: {
  sampleSize: number;
  meanPnlCents: number;
  standardDeviation: number;
  alpha: number;
}): number | null {
  if (
    input.sampleSize < 2
    || input.standardDeviation <= 0
    || !Number.isFinite(input.meanPnlCents)
  ) {
    return null;
  }

  if (input.meanPnlCents <= 0) {
    return roundMetric(input.alpha);
  }

  const zAlpha = NORMAL_Z_ONE_TAILED_ALPHA_005;
  const nonCentrality =
    (input.meanPnlCents * Math.sqrt(input.sampleSize)) / input.standardDeviation;
  const zScore = zAlpha - nonCentrality;
  const power = 1 - normalCdf(zScore);

  return roundMetric(Math.max(input.alpha, Math.min(1, power)));
}

function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * absX);
  const y =
    1
    - ((((
      1.061405429 * t
      - 1.453152027
    ) * t
      + 1.421413741) *
      t
      - 0.284496736) *
      t
      + 0.254829592) *
      t *
      Math.exp(-absX * absX);

  return sign * y;
}
