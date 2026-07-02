/**
 * One-sample Student's t-test helpers for mean > 0.
 * Uses the regularized incomplete beta function for the t CDF.
 */

function logGamma(z: number): number {
  const coefficients = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
  ];

  const x = z;
  let y = z;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);

  let ser = 1.000000000190015;
  for (const coefficient of coefficients) {
    y += 1;
    ser += coefficient / y;
  }

  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

function betacf(a: number, b: number, x: number): number {
  const maxIterations = 200;
  const epsilon = 3e-7;
  const fpmin = 1e-30;

  let am = 1;
  let bm = 1;
  let az = 1;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let bz = 1 - (qab * x) / qap;

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const em = iteration;
    const tem = em + em;
    const d1 = (em * (b - em) * x) / ((qam + tem) * (a + tem));
    const ap = az + d1 * am;
    const bp = bz + d1 * bm;
    const d2 = (-(a + em) * (qab + em) * x) / ((a + tem) * (qap + tem));
    const app = ap + d2 * az;
    const bpp = bp + d2 * bz;
    am = ap / bpp;
    bm = bp / bpp;
    az = app / bpp;
    bz = 1;

    if (Math.abs(az) < fpmin) {
      az = fpmin;
    }
    if (Math.abs(bz) < fpmin) {
      bz = fpmin;
    }

    if (Math.abs(bz - az) < epsilon * Math.abs(az)) {
      return az;
    }
  }

  return az;
}

function incompleteBeta(a: number, b: number, x: number): number {
  if (x <= 0) {
    return 0;
  }
  if (x >= 1) {
    return 1;
  }

  const lnBeta =
    logGamma(a) + logGamma(b) - logGamma(a + b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lnBeta) / a;

  if (x < (a + 1) / (a + b + 2)) {
    return front * betacf(a, b, x);
  }

  return 1 - (Math.exp(Math.log(1 - x) * b + Math.log(x) * a - lnBeta) / b) *
    betacf(b, a, 1 - x);
}

/** CDF of Student's t distribution. */
export function studentTCdf(t: number, degreesOfFreedom: number): number {
  if (!Number.isFinite(t) || degreesOfFreedom < 1) {
    return 0;
  }

  const x = degreesOfFreedom / (degreesOfFreedom + t * t);
  const probability = incompleteBeta(degreesOfFreedom / 2, 0.5, x);

  if (t >= 0) {
    return 1 - probability / 2;
  }

  return probability / 2;
}

/** One-tailed p-value for H1: mean > 0. */
export function oneSampleTTestPValueGreaterThanZero(
  tStatistic: number,
  degreesOfFreedom: number,
): number | null {
  if (!Number.isFinite(tStatistic) || degreesOfFreedom < 1) {
    return null;
  }

  return 1 - studentTCdf(tStatistic, degreesOfFreedom);
}

export function computeStandardError(values: readonly number[]): number | null {
  if (values.length < 2) {
    return null;
  }

  const deviation = values.reduce((sum, value) => {
    const average = values.reduce((innerSum, innerValue) => innerSum + innerValue, 0) /
      values.length;
    return sum + (value - average) ** 2;
  }, 0);

  const variance = deviation / (values.length - 1);
  return Math.sqrt(variance / values.length);
}

export function computeTStatistic(
  sampleMean: number,
  standardError: number | null,
): number | null {
  if (standardError === null || standardError === 0 || !Number.isFinite(sampleMean)) {
    return null;
  }

  return sampleMean / standardError;
}
