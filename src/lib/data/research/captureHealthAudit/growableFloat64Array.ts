/**
 * Compact O(N) scalar buffer for exact percentile calculations.
 *
 * Memory: 8 bytes/value plus unused capacity (grows by doubling).
 * At 11.25M values a filled buffer is ~90 MB; a JS number[] of the same
 * length is substantially larger due to holey/boxed-element overhead.
 *
 * Do not use this to retain ParsedTopOfBookRecord objects.
 */
export class GrowableFloat64Array {
  private data: Float64Array;
  private _length = 0;

  constructor(initialCapacity = 4_096) {
    this.data = new Float64Array(Math.max(1, initialCapacity));
  }

  get length(): number {
    return this._length;
  }

  get capacity(): number {
    return this.data.length;
  }

  push(value: number): void {
    if (this._length === this.data.length) {
      const grown = new Float64Array(this.data.length * 2);
      grown.set(this.data);
      this.data = grown;
    }
    this.data[this._length] = value;
    this._length += 1;
  }

  /** Copy the filled prefix. Caller may sort the snapshot in place. */
  snapshot(): Float64Array {
    return this.data.slice(0, this._length);
  }
}

/** Exact match for `computeSortedGaps` on a compact timestamp buffer. */
export function computeSortedGapsFromTimestamps(timestamps: Float64Array): Float64Array {
  if (timestamps.length < 2) {
    return new Float64Array(0);
  }

  const sorted = timestamps.slice();
  sorted.sort();
  const gaps = new Float64Array(sorted.length - 1);
  for (let index = 1; index < sorted.length; index += 1) {
    gaps[index - 1] = sorted[index]! - sorted[index - 1]!;
  }
  return gaps;
}

/** Exact match for `median` on an already-sorted numeric buffer. */
export function medianSorted(sorted: Float64Array): number | null {
  if (sorted.length === 0) {
    return null;
  }

  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }

  return sorted[mid]!;
}

/** Exact match for `percentile` on an already-sorted numeric buffer. */
export function percentileSorted(sorted: Float64Array, p: number): number | null {
  if (sorted.length === 0) {
    return null;
  }

  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))] ?? null;
}

export function medianFromUnsorted(values: Float64Array): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = values.slice();
  sorted.sort();
  return medianSorted(sorted);
}

export function continuityFromTimestamps(timestamps: Float64Array): {
  medianTopOfBookGapMs: number | null;
  p90TopOfBookGapMs: number | null;
  maxTopOfBookGapMs: number | null;
} {
  const gaps = computeSortedGapsFromTimestamps(timestamps);
  if (gaps.length === 0) {
    return {
      medianTopOfBookGapMs: null,
      p90TopOfBookGapMs: null,
      maxTopOfBookGapMs: null,
    };
  }

  gaps.sort();
  return {
    medianTopOfBookGapMs: medianSorted(gaps),
    p90TopOfBookGapMs: percentileSorted(gaps, 90),
    maxTopOfBookGapMs: gaps[gaps.length - 1] ?? null,
  };
}

export function medianGapFromTimestamps(timestamps: Float64Array): number | null {
  const gaps = computeSortedGapsFromTimestamps(timestamps);
  return medianFromUnsorted(gaps);
}
