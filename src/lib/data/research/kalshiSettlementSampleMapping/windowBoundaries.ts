import { parseOfficialNumericString, roundUsdToTwoDecimals } from "@/lib/data/research/kalshiBrtiAccessProbe";

import type { AggregationKind, TimedObservation, WindowBoundaryKind } from "./types";

/**
 * Fixed sampling interpretations. These are documented or timestamp-semantic
 * windows, not offsets fitted to official expiration.
 *
 * Documented live accumulation (`last_60s_windowed_average_15min`):
 *   (close−60s, close] — exclusive start, inclusive close.
 * Live payload window identity fields:
 *   [window_start_ts_ms, window_end_ts_exclusive) — inclusive start, exclusive end.
 * Official help text: 60 one-second RTI readings in the expiration minute.
 *
 * A matching average on one example is exploratory, not the official rule.
 */
export const WINDOW_BOUNDARY_KINDS: readonly WindowBoundaryKind[] = [
  "documented-live-accumulation",
  "payload-start-inclusive-end-exclusive",
  "closed-both",
  "open-both",
] as const;

export const AGGREGATION_KINDS: readonly AggregationKind[] = [
  "last-tick-per-second",
  "all-5hz-mean",
] as const;

export function windowStartMs(closeMs: number): number {
  return closeMs - 60_000;
}

export function observationInWindow(
  timeMs: number,
  closeMs: number,
  kind: WindowBoundaryKind,
): boolean {
  const start = windowStartMs(closeMs);
  switch (kind) {
    case "documented-live-accumulation":
      return timeMs > start && timeMs <= closeMs;
    case "payload-start-inclusive-end-exclusive":
      return timeMs >= start && timeMs < closeMs;
    case "closed-both":
      return timeMs >= start && timeMs <= closeMs;
    case "open-both":
      return timeMs > start && timeMs < closeMs;
  }
}

export function selectWindowObservations(
  observations: readonly TimedObservation[],
  closeMs: number,
  kind: WindowBoundaryKind,
): TimedObservation[] {
  return observations.filter((observation) => (
    observation.timeMs != null
    && observation.value != null
    && observationInWindow(observation.timeMs, closeMs, kind)
  ));
}

export function lastTickPerSecond(observations: readonly TimedObservation[]): TimedObservation[] {
  const latest = new Map<number, TimedObservation>();
  for (const observation of observations) {
    if (observation.timeMs == null || observation.value == null) {
      continue;
    }
    const bucket = Math.floor(observation.timeMs / 1000);
    const existing = latest.get(bucket);
    if (existing == null || existing.timeMs == null || observation.timeMs >= existing.timeMs) {
      latest.set(bucket, observation);
    }
  }
  return [...latest.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([, observation]) => observation);
}

export function meanOf(observations: readonly TimedObservation[]): {
  count: number;
  sum: number | null;
  mean: number | null;
  meanRaw: string | null;
  roundedUsd: string | null;
} {
  const values = observations
    .map((observation) => observation.value)
    .filter((value): value is number => value != null && Number.isFinite(value));
  if (values.length === 0) {
    return { count: 0, sum: null, mean: null, meanRaw: null, roundedUsd: null };
  }
  const sum = values.reduce((total, value) => total + value, 0);
  const mean = sum / values.length;
  return {
    count: values.length,
    sum,
    mean,
    meanRaw: String(mean),
    roundedUsd: roundUsdToTwoDecimals(mean),
  };
}

export function inspectPhaseAlignment(observations: readonly TimedObservation[]): {
  uniqueSecondBuckets: number;
  duplicateTimeCount: number;
  missingSecondBuckets: number[];
  phaseResiduesMs: number[];
  dominantPhaseMs: number | null;
  looksFiveHz: boolean;
  firstTimeMs: number | null;
  lastTimeMs: number | null;
} {
  const timed = observations
    .map((observation) => observation.timeMs)
    .filter((time): time is number => time != null)
    .sort((left, right) => left - right);
  const buckets = new Set(timed.map((time) => Math.floor(time / 1000)));
  let duplicateTimeCount = 0;
  for (let index = 1; index < timed.length; index += 1) {
    if (timed[index] === timed[index - 1]) {
      duplicateTimeCount += 1;
    }
  }
  const firstTimeMs = timed[0] ?? null;
  const lastTimeMs = timed.at(-1) ?? null;
  const missingSecondBuckets: number[] = [];
  if (firstTimeMs != null && lastTimeMs != null) {
    const firstBucket = Math.floor(firstTimeMs / 1000);
    const lastBucket = Math.floor(lastTimeMs / 1000);
    for (let bucket = firstBucket; bucket <= lastBucket; bucket += 1) {
      if (!buckets.has(bucket)) {
        missingSecondBuckets.push(bucket);
      }
    }
  }
  const phaseResiduesMs = timed.map((time) => time % 1000);
  const phaseCounts = new Map<number, number>();
  for (const residue of phaseResiduesMs) {
    phaseCounts.set(residue, (phaseCounts.get(residue) ?? 0) + 1);
  }
  const dominant = [...phaseCounts.entries()].sort((left, right) => right[1] - left[1])[0];
  const intervals: number[] = [];
  for (let index = 1; index < timed.length; index += 1) {
    const delta = timed[index]! - timed[index - 1]!;
    if (delta > 0) {
      intervals.push(delta);
    }
  }
  const median = intervals.length === 0
    ? null
    : [...intervals].sort((left, right) => left - right)[Math.floor((intervals.length - 1) / 2)] ?? null;
  return {
    uniqueSecondBuckets: buckets.size,
    duplicateTimeCount,
    missingSecondBuckets,
    phaseResiduesMs: [...new Set(phaseResiduesMs)].sort((left, right) => left - right),
    dominantPhaseMs: dominant?.[0] ?? null,
    looksFiveHz: median != null && median >= 150 && median <= 250,
    firstTimeMs,
    lastTimeMs,
  };
}

export function compareRoundedUsd(candidateRaw: string | null, officialRaw: string | null): {
  status: "agree" | "disagree" | "not-compared";
  candidateRounded: string | null;
  officialRounded: string | null;
  officialRaw: string | null;
} {
  const candidate = parseOfficialNumericString(candidateRaw);
  const official = parseOfficialNumericString(officialRaw);
  if (candidate.kind !== "ok" || official.kind !== "ok") {
    return {
      status: "not-compared",
      candidateRounded: candidate.kind === "ok" ? roundUsdToTwoDecimals(candidate.value) : null,
      officialRounded: official.kind === "ok" ? roundUsdToTwoDecimals(official.value) : null,
      officialRaw,
    };
  }
  const candidateRounded = roundUsdToTwoDecimals(candidate.value);
  const officialRounded = roundUsdToTwoDecimals(official.value);
  return {
    status: candidateRounded === officialRounded ? "agree" : "disagree",
    candidateRounded,
    officialRounded,
    officialRaw,
  };
}

export function describeWindow(kind: WindowBoundaryKind): {
  notation: string;
  startInclusive: boolean;
  endInclusive: boolean;
  justification: string;
} {
  switch (kind) {
    case "documented-live-accumulation":
      return {
        notation: "(close−60s, close]",
        startInclusive: false,
        endInclusive: true,
        justification: "Kalshi WS docs for last_60s_windowed_average_15min accumulation",
      };
    case "payload-start-inclusive-end-exclusive":
      return {
        notation: "[close−60s, close)",
        startInclusive: true,
        endInclusive: false,
        justification: "Live payload window_start_ts_ms / window_end_ts_exclusive fields",
      };
    case "closed-both":
      return {
        notation: "[close−60s, close]",
        startInclusive: true,
        endInclusive: true,
        justification: "Inclusive endpoints if both boundary ticks are settlement samples",
      };
    case "open-both":
      return {
        notation: "(close−60s, close)",
        startInclusive: false,
        endInclusive: false,
        justification: "Exclusive endpoints; same duration, different endpoint ticks",
      };
  }
}
