import type {
  EventDefinition,
  EventStudyStepPoint,
  EventStudyWindowConfig,
  EventStudyWindowName,
} from "./eventStudyTypes";
import {
  DEFAULT_EVENT_AFTER_WINDOW_MS,
  DEFAULT_EVENT_BEFORE_WINDOW_MS,
  DEFAULT_EVENT_DURING_WINDOW_MS,
} from "./eventStudyTypes";

export function resolveEventStudyWindowConfig(
  partial?: Partial<EventStudyWindowConfig>,
): EventStudyWindowConfig {
  return {
    beforeWindowMs: partial?.beforeWindowMs ?? DEFAULT_EVENT_BEFORE_WINDOW_MS,
    duringWindowMs: partial?.duringWindowMs ?? DEFAULT_EVENT_DURING_WINDOW_MS,
    afterWindowMs: partial?.afterWindowMs ?? DEFAULT_EVENT_AFTER_WINDOW_MS,
  };
}

export function marketOverlapsEventStudySpan(input: {
  marketOpenMs: number | null;
  marketCloseMs: number | null;
  eventTimeMs: number;
  windowConfig: EventStudyWindowConfig;
}): boolean {
  const studyStartMs =
    input.eventTimeMs - input.windowConfig.beforeWindowMs;
  const studyEndMs =
    input.eventTimeMs
    + input.windowConfig.duringWindowMs
    + input.windowConfig.afterWindowMs;

  if (input.marketOpenMs !== null && input.marketCloseMs !== null) {
    return input.marketOpenMs <= studyEndMs && input.marketCloseMs >= studyStartMs;
  }

  return true;
}

export function assignStepToEventWindow(input: {
  stepTimestampMs: number;
  eventTimeMs: number;
  windowConfig: EventStudyWindowConfig;
}): EventStudyWindowName | null {
  const { stepTimestampMs, eventTimeMs, windowConfig } = input;

  if (
    stepTimestampMs >= eventTimeMs - windowConfig.beforeWindowMs
    && stepTimestampMs < eventTimeMs
  ) {
    return "before";
  }

  if (
    stepTimestampMs >= eventTimeMs
    && stepTimestampMs < eventTimeMs + windowConfig.duringWindowMs
  ) {
    return "during";
  }

  if (
    stepTimestampMs >= eventTimeMs + windowConfig.duringWindowMs
    && stepTimestampMs < eventTimeMs + windowConfig.duringWindowMs + windowConfig.afterWindowMs
  ) {
    return "after";
  }

  return null;
}

export function filterStepsForEventWindow(input: {
  steps: readonly EventStudyStepPoint[];
  event: EventDefinition;
  window: EventStudyWindowName;
  windowConfig: EventStudyWindowConfig;
}): EventStudyStepPoint[] {
  return input.steps.filter(
    (step) =>
      assignStepToEventWindow({
        stepTimestampMs: step.timestampMs,
        eventTimeMs: input.event.timestampMs,
        windowConfig: input.windowConfig,
      }) === input.window,
  );
}

export function collectOverlappingEventIds(input: {
  events: readonly EventDefinition[];
  marketOpenMs: number | null;
  marketCloseMs: number | null;
  windowConfig: EventStudyWindowConfig;
}): string[] {
  return input.events
    .filter((event) =>
      marketOverlapsEventStudySpan({
        marketOpenMs: input.marketOpenMs,
        marketCloseMs: input.marketCloseMs,
        eventTimeMs: event.timestampMs,
        windowConfig: input.windowConfig,
      }),
    )
    .map((event) => event.eventId);
}
