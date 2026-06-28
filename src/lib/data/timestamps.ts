import { z } from "zod";

/**
 * UTC-only ISO-8601 instant with a `Z` suffix.
 * Local timezone offsets are rejected — store and validate UTC only.
 */
export const UTC_ISO_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

export function isUtcIsoTimestamp(value: string): boolean {
  if (!UTC_ISO_PATTERN.test(value)) {
    return false;
  }
  return Number.isFinite(Date.parse(value));
}

export const utcTimestampSchema = z
  .string()
  .min(1, "Timestamp is required")
  .refine(isUtcIsoTimestamp, {
    message: "Timestamp must be a valid UTC ISO-8601 instant with Z suffix",
  });

/** When the market event or bar interval occurred (exchange/window time). */
export const eventTimeSchema = utcTimestampSchema.brand<"EventTime">();
export type EventTime = z.infer<typeof eventTimeSchema>;

/** When the record was collected or fetched from a source. */
export const collectionTimeSchema = utcTimestampSchema.brand<"CollectionTime">();
export type CollectionTime = z.infer<typeof collectionTimeSchema>;

/**
 * When the observation became known (knowledge time).
 * May differ from collectionTime when ingesting delayed or backfilled data.
 */
export const observedAtSchema = utcTimestampSchema.brand<"ObservedAt">();
export type ObservedAt = z.infer<typeof observedAtSchema>;

export const temporalFieldsSchema = z.object({
  eventTime: eventTimeSchema,
  collectionTime: collectionTimeSchema,
  observedAt: observedAtSchema,
});

export type TemporalFields = z.infer<typeof temporalFieldsSchema>;
