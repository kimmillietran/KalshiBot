export function joinPath(root: string, child: string): string {
  return `${root.replace(/[\\/]+$/, "")}/${child}`;
}

export function parseIsoTimestampMs(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function roundShare(numerator: number, denominator: number): number | null {
  if (denominator === 0) {
    return null;
  }

  return Math.round((numerator / denominator) * 10_000) / 10_000;
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
