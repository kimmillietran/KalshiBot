import { z } from "zod";

import {
  EventStudyError,
  EventStudyErrorCode,
  type EventDefinition,
} from "./eventStudyTypes";

const eventDefinitionSchema = z.object({
  eventId: z.string().trim().min(1),
  timestamp: z.string().trim().min(1),
  type: z.string().trim().min(1),
});

const eventsDocumentSchema = z.array(eventDefinitionSchema);

function parseTimestampMs(timestamp: string): number {
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) {
    throw new EventStudyError(
      `Invalid event timestamp: ${timestamp}`,
      EventStudyErrorCode.INVALID_EVENTS,
    );
  }

  return parsed;
}

/** Parses and validates an external events JSON document. */
export function parseEventsJson(json: string): EventDefinition[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    throw new EventStudyError(
      "events file contains invalid JSON",
      EventStudyErrorCode.INVALID_JSON,
    );
  }

  const result = eventsDocumentSchema.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new EventStudyError(
      issue?.message ?? "events file failed validation",
      EventStudyErrorCode.INVALID_EVENTS,
    );
  }

  return result.data
    .map((event) => ({
      ...event,
      timestampMs: parseTimestampMs(event.timestamp),
    }))
    .sort((left, right) => {
      const timeCompare = left.timestampMs - right.timestampMs;
      if (timeCompare !== 0) {
        return timeCompare;
      }

      return left.eventId.localeCompare(right.eventId);
    });
}

export function readEventsFile(
  eventsPath: string,
  readFile: (path: string) => string,
): EventDefinition[] {
  let json: string;

  try {
    json = readFile(eventsPath);
  } catch {
    throw new EventStudyError(
      `Events file not found: ${eventsPath}`,
      EventStudyErrorCode.MISSING_EVENTS_FILE,
    );
  }

  return parseEventsJson(json.replace(/^\uFEFF/, ""));
}
