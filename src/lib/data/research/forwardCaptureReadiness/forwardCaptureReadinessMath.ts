export function percentile(values: readonly number[], percentileValue: number): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1),
  );
  return sorted[index] ?? null;
}

export function median(values: readonly number[]): number | null {
  return percentile(values, 50);
}

export function parseIsoTimestampMs(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function utcDateKey(value: string | null | undefined): string | null {
  const timestampMs = parseIsoTimestampMs(value);
  if (timestampMs === null) {
    return null;
  }

  return new Date(timestampMs).toISOString().slice(0, 10);
}

export function computeTopOfBookGapsMs(
  receivedAtLocalValues: readonly string[],
): number[] {
  const timestamps = receivedAtLocalValues
    .map((value) => parseIsoTimestampMs(value))
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right);

  const gaps: number[] = [];
  for (let index = 1; index < timestamps.length; index += 1) {
    gaps.push(timestamps[index]! - timestamps[index - 1]!);
  }

  return gaps;
}

export function safeShare(numerator: number, denominator: number): number | null {
  if (denominator <= 0) {
    return null;
  }

  return numerator / denominator;
}

export function minMaxTimestampsMs(
  values: readonly number[],
): { min: number | null; max: number | null } {
  let min: number | null = null;
  let max: number | null = null;

  for (const value of values) {
    if (min === null || value < min) {
      min = value;
    }
    if (max === null || value > max) {
      max = value;
    }
  }

  return { min, max };
}

export function appendOrderedGapMs(
  gaps: number[],
  previousTimestampMs: number | null,
  timestampMs: number,
): number {
  if (previousTimestampMs !== null && timestampMs >= previousTimestampMs) {
    gaps.push(timestampMs - previousTimestampMs);
  }

  return timestampMs;
}
