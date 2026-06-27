const EPSILON = 1e-9;

/** Clamp a value into [0, 1] using stable min/max bounds. */
export function normalizeToUnit(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  const span = max - min;
  if (Math.abs(span) < EPSILON) return 0;
  const normalized = (value - min) / span;
  return clamp01(normalized);
}

/** Map signed values into [-1, 1] using a stable absolute bound. */
export function normalizeSigned(value: number, maxAbs: number): number {
  if (!Number.isFinite(value) || maxAbs <= EPSILON) return 0;
  return clampSigned(value / maxAbs);
}

export function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

export function clampSigned(value: number): number {
  if (value <= -1) return -1;
  if (value >= 1) return 1;
  return value;
}

/** Stable mean for small arrays — avoids mutation. */
export function stableMean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const value of values) {
    sum += value;
  }
  return sum / values.length;
}

/** Population standard deviation. Returns 0 for fewer than 2 samples. */
export function stableStdDev(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const mean = stableMean(values);
  let sumSquares = 0;
  for (const value of values) {
    const delta = value - mean;
    sumSquares += delta * delta;
  }
  return Math.sqrt(sumSquares / values.length);
}
