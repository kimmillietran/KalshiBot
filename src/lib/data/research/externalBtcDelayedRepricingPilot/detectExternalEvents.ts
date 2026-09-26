/**
 * External BTC move event detection + diagnostic controls.
 *
 * Controls are labels only — they never share primary position/cooldown state.
 * time-sham is a retrospective placebo (uses a future event's direction at an earlier time).
 */

import type { BboPoint } from "./bookReplay";
import type { ExternalBtcEvent } from "./types";
import { CLOCK_POLICY } from "./timingQuality";

function basisPointsChange(start: number, end: number): number {
  if (!(start > 0) || !(end > 0)) return 0;
  return ((end - start) / start) * 10_000;
}

function findLastAtOrBefore(points: readonly BboPoint[], timestampMs: number): BboPoint | null {
  let result: BboPoint | null = null;
  for (const point of points) {
    if (point.timestampMs <= timestampMs) result = point;
    else break;
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
    if (point.failClosed || point.chainBreak) continue;
    if (point.clockDomain !== CLOCK_POLICY.decisionClockDomain) continue;

    const start = findLastAtOrBefore(input.points, point.timestampMs - input.lookbackMs);
    if (!start || start.timestampMs >= point.timestampMs) continue;

    const returnBps = basisPointsChange(start.mid, point.mid);
    const absolute = Math.abs(returnBps);
    const crossed = previousAbsolute < input.boundaryBps && absolute >= input.boundaryBps;
    previousAbsolute = absolute;
    if (!crossed || returnBps === 0) continue;

    if (point.timestampMs - lastTriggerMs < input.cooldownMs) {
      suppressedByCooldown += 1;
      continue;
    }
    lastTriggerMs = point.timestampMs;
    counter += 1;
    events.push({
      eventId: `${input.utcDay}-btc-${counter}`,
      utcDay: input.utcDay,
      eventTimestampMs: point.timestampMs,
      timestampSource: point.timestampSource,
      clockDomain: point.clockDomain,
      direction: returnBps > 0 ? "up" : "down",
      returnBps,
      absoluteReturnBps: absolute,
      lookbackMs: input.lookbackMs,
      btcPriceUsd: point.mid,
      controlKind: "primary",
      controlNote: null,
    });
  }

  return { events, suppressedByCooldown };
}

/** Diagnostic controls only — do not feed into primary position state. */
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
      controlNote:
        "Outcome-sharing diagnostic (same event time/magnitude, flipped side). "
        + "Not independent evidence.",
    });
    out.push({
      ...event,
      eventId: `${event.eventId}-time-sham-retrospective-placebo`,
      controlKind: "time-sham-retrospective-placebo",
      eventTimestampMs: event.eventTimestampMs - 2 * holdMs - delayMs,
      controlNote:
        "Retrospective placebo: places a future primary event's direction at an earlier "
        + "timestamp. Not a deployable causal strategy.",
    });
  }
  return out;
}
