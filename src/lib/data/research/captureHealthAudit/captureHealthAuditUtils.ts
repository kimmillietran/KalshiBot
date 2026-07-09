export function percentile(sorted: readonly number[], p: number): number | null {
  if (sorted.length === 0) {
    return null;
  }

  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))] ?? null;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }

  return sorted[mid]!;
}

export function roundShare(numerator: number, denominator: number): number | null {
  if (denominator === 0) {
    return null;
  }

  return Math.round((numerator / denominator) * 10_000) / 10_000;
}

export function parseIsoTimestampMs(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function hourBucketFromIso(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return "unknown";
  }

  return new Date(parsed).toISOString().slice(0, 13);
}

export function parseJsonlLines<T>(
  raw: string,
  parseLine: (line: string, lineNumber: number) => T | null,
): { records: T[]; invalidLineCount: number } {
  const records: T[] = [];
  let invalidLineCount = 0;

  for (const [index, line] of raw.split("\n").entries()) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    try {
      const record = parseLine(trimmed, index + 1);
      if (record) {
        records.push(record);
      } else {
        invalidLineCount += 1;
      }
    } catch {
      invalidLineCount += 1;
    }
  }

  return { records, invalidLineCount };
}

export function computeSortedGaps(timestampsMs: readonly number[]): number[] {
  if (timestampsMs.length < 2) {
    return [];
  }

  const sorted = [...timestampsMs].sort((left, right) => left - right);
  const gaps: number[] = [];
  for (let index = 1; index < sorted.length; index += 1) {
    gaps.push(sorted[index]! - sorted[index - 1]!);
  }

  return gaps;
}

export function resolveKalshiTimestampMs(record: {
  exchangeTimestampMs: number | null;
  receivedAtMs: number;
}): number {
  return record.exchangeTimestampMs ?? record.receivedAtMs;
}

export function findNearestBtcDistanceMs(
  kalshiTimestampMs: number,
  btcTimestampsMs: readonly number[],
): number | null {
  if (btcTimestampsMs.length === 0) {
    return null;
  }

  let nearest = btcTimestampsMs[0]!;
  let nearestDistance = Math.abs(kalshiTimestampMs - nearest);

  for (const timestamp of btcTimestampsMs) {
    const distance = Math.abs(kalshiTimestampMs - timestamp);
    if (distance < nearestDistance) {
      nearest = timestamp;
      nearestDistance = distance;
    }
  }

  return nearestDistance;
}
