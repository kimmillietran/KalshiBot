/**
 * External BTC move event detection (boundary-cross) + diagnostic controls.
 */

import type { BboPoint } from "./bookReplay";
import type { ExternalBtcEvent } from "./types";

function basisPointsChange(start: number, end: number): number {
  if (!(start > 0) || !(end > 0)) {
    return 0;
  }
  return ((end - start) / start) * 10_000;
}

function findLastAtOrBefore(points: readonly BboPoint[], timestampMs: number): BboPoint | null {
  let result: BboPoint | null = null;
  for (const point of points) {
    if (point.timestampMs <= timestampMs) {
      result = point;
    } else {
      break;
    }
  }
  return result;
}

export function detectExternalBtcEvents(input: {
  utcDay: string;
  points: readonly BboPoint[];
  lookbackMs: number;
  boundaryBps: number;
  cooldownMs: number;
}): {
  events: ExternalBtcEvent[];
  suppressedByCooldown: number;
} {
  const events: ExternalBtcEvent[] = [];
  let suppressedByCooldown = 0;
  let lastTriggerMs = Number.NEGATIVE_INFINITY;
  let previousAbsolute = 0;
  let counter = 0;

  for (const point of input.points) {
    if (point.failClosed || point.chainBreak) {
      continue;
    }
    const start = findLastAtOrBefore(input.points, point.timestampMs - input.lookbackMs);
    if (!start || start.timestampMs >= point.timestampMs) {
      continue;
    }
    const returnBps = basisPointsChange(start.mid, point.mid);
    const absolute = Math.abs(returnBps);
    const crossed = previousAbsolute < input.boundaryBps && absolute >= input.boundaryBps;
    previousAbsolute = absolute;
    if (!crossed || returnBps === 0) {
      continue;
    }
    if (point.timestampMs - lastTriggerMs < input.cooldownMs) {
      suppressedByCooldown += 1;
      continue;
    }
    lastTriggerMs = point.timestampMs;
    counter += 1;
    const direction = returnBps > 0 ? "up" : "down";
    events.push({
      eventId: `${input.utcDay}-btc-${counter}`,
      utcDay: input.utcDay,
      eventTimestampMs: point.timestampMs,
      timestampSource: point.timestampSource,
      direction,
      returnBps,
      absoluteReturnBps: absolute,
      lookbackMs: input.lookbackMs,
      btcPriceUsd: point.mid,
      controlKind: "primary",
    });
  }

  return { events, suppressedByCooldown };
}

/** Diagnostic controls: sign-flip + pre-event time sham. Not strategy searches. */
export function buildDiagnosticControls(
  primary: readonly ExternalBtcEvent[],
  holdMs: number,
  delayMs: number,
): ExternalBtcEvent[] {
  const out: ExternalBtcEvent[] = [];
  for (const event of primary) {
    out.push({
      ...event,
      eventId: `${event.eventId}-sign-flip`,
      controlKind: "sign-flip",
      direction: event.direction === "up" ? "down" : "up",
    });
    out.push({
      ...event,
      eventId: `${event.eventId}-time-sham`,
      controlKind: "time-sham",
      eventTimestampMs: event.eventTimestampMs - 2 * holdMs - delayMs,
    });
  }
  return out;
}
