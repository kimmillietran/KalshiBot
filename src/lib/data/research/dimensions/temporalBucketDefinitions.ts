import type { MispricingObservation } from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";

import type { NumericBucketDefinition } from "./types";

/** UTC hour blocks (6-hour windows) for temporal calibration. */
export const HOUR_UTC_BUCKET_DEFINITIONS: readonly NumericBucketDefinition[] = [
  {
    bucketId: "hour-utc-0-5",
    bucketLabel: "00:00–05:59 UTC",
    minInclusive: 0,
    maxExclusive: 6,
  },
  {
    bucketId: "hour-utc-6-11",
    bucketLabel: "06:00–11:59 UTC",
    minInclusive: 6,
    maxExclusive: 12,
  },
  {
    bucketId: "hour-utc-12-17",
    bucketLabel: "12:00–17:59 UTC",
    minInclusive: 12,
    maxExclusive: 18,
  },
  {
    bucketId: "hour-utc-18-23",
    bucketLabel: "18:00–23:59 UTC",
    minInclusive: 18,
    maxExclusive: 24,
  },
];

/** UTC day-of-week buckets (0 = Sunday). */
export const DAY_OF_WEEK_UTC_BUCKET_DEFINITIONS: readonly NumericBucketDefinition[] = [
  { bucketId: "dow-0", bucketLabel: "Sunday UTC", minInclusive: 0, maxExclusive: 1 },
  { bucketId: "dow-1", bucketLabel: "Monday UTC", minInclusive: 1, maxExclusive: 2 },
  { bucketId: "dow-2", bucketLabel: "Tuesday UTC", minInclusive: 2, maxExclusive: 3 },
  { bucketId: "dow-3", bucketLabel: "Wednesday UTC", minInclusive: 3, maxExclusive: 4 },
  { bucketId: "dow-4", bucketLabel: "Thursday UTC", minInclusive: 4, maxExclusive: 5 },
  { bucketId: "dow-5", bucketLabel: "Friday UTC", minInclusive: 5, maxExclusive: 6 },
  { bucketId: "dow-6", bucketLabel: "Saturday UTC", minInclusive: 6, maxExclusive: 7 },
];

/** Optional UTC session buckets (encoded 0–3). */
export const SESSION_BUCKET_DEFINITIONS: readonly NumericBucketDefinition[] = [
  { bucketId: "session-late", bucketLabel: "Late (22:00–05:59 UTC)", minInclusive: 0, maxExclusive: 1 },
  { bucketId: "session-morning", bucketLabel: "Morning (06:00–10:59 UTC)", minInclusive: 1, maxExclusive: 2 },
  { bucketId: "session-midday", bucketLabel: "Midday (11:00–15:59 UTC)", minInclusive: 2, maxExclusive: 3 },
  { bucketId: "session-evening", bucketLabel: "Evening (16:00–21:59 UTC)", minInclusive: 3, maxExclusive: 4 },
];

/** Weekend vs weekday flag (0 = weekday, 1 = weekend). */
export const WEEKEND_FLAG_BUCKET_DEFINITIONS: readonly NumericBucketDefinition[] = [
  { bucketId: "weekday", bucketLabel: "Weekday UTC", minInclusive: 0, maxExclusive: 1 },
  { bucketId: "weekend", bucketLabel: "Weekend UTC", minInclusive: 1, maxExclusive: 2 },
];

export function extractHourUtc(observation: MispricingObservation): number | null {
  if (observation.timestampMs === null || observation.timestampMs === undefined) {
    return null;
  }

  return new Date(observation.timestampMs).getUTCHours();
}

export function extractDayOfWeekUtc(observation: MispricingObservation): number | null {
  if (observation.timestampMs === null || observation.timestampMs === undefined) {
    return null;
  }

  return new Date(observation.timestampMs).getUTCDay();
}

export function extractSessionBucketCode(observation: MispricingObservation): number | null {
  const hour = extractHourUtc(observation);
  if (hour === null) {
    return null;
  }

  if (hour >= 22 || hour < 6) {
    return 0;
  }

  if (hour < 11) {
    return 1;
  }

  if (hour < 16) {
    return 2;
  }

  return 3;
}

export function extractWeekendFlag(observation: MispricingObservation): number | null {
  const day = extractDayOfWeekUtc(observation);
  if (day === null) {
    return null;
  }

  return day === 0 || day === 6 ? 1 : 0;
}

export function integerFitsBucket(
  value: number,
  bucket: NumericBucketDefinition,
): boolean {
  if (value < bucket.minInclusive) {
    return false;
  }

  if (bucket.maxExclusive === null) {
    return true;
  }

  return value < bucket.maxExclusive;
}
