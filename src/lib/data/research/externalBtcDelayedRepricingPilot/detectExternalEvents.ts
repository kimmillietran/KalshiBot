/**
 * O(n) event detection with rolling lookback — same semantics as full-array scan.
 */

import type { BboPoint } from "./bookReplay";
import type { ExternalBtcEvent } from "./types";
import { CLOCK_POLICY } from "./timingQuality";

function basisPointsChange(start: number, end: number): number {
  if (!(start > 0) || !(end > 0)) return 0;
  return ((end - start) / start) * 10_000;
}

/**
 * Detect events while streaming points in timestamp order.
 * Keeps only a lookback window (+ one prior point) in memory.
 */
export function detectExternalBtcEventsFromIterable(input: {
  utcDay: string;
  points: Iterable<BboPoint>;
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

  // Chronological buffer; lookbackStartIdx tracks last point at-or-before (t - lookback).
  const window: BboPoint[] = [];
  let lookbackStartIdx = 0;

  for (const point of input.points) {
    window.push(point);
    const lookbackTarget = point.timestampMs - input.lookbackMs;
    while (
      lookbackStartIdx + 1 < window.length - 1
      && window[lookbackStartIdx + 1]!.timestampMs <= lookbackTarget
    ) {
      lookbackStartIdx += 1;
    }
    // Drop points that can no longer be a lookback start or current point.
    if (lookbackStartIdx > 0) {
      window.splice(0, lookbackStartIdx);
      lookbackStartIdx = 0;
    }

    if (point.failClosed || point.chainBreak) continue;
    if (point.clockDomain !== CLOCK_POLICY.decisionClockDomain) continue;

    const start =
      window.length >= 2 && window[0]!.timestampMs <= lookbackTarget
        ? window[0]!
        : null;
    // If the first remaining point is still after lookbackTarget, no valid start.
    if (!start || start.timestampMs > lookbackTarget) continue;
    // Ensure we use the last point at-or-before lookbackTarget within window.
    let lookbackPoint = start;
    for (let i = 0; i < window.length - 1; i += 1) {
      const candidate = window[i]!;
      if (candidate.timestampMs <= lookbackTarget) lookbackPoint = candidate;
      else break;
    }
    if (lookbackPoint.timestampMs >= point.timestampMs) continue;

    const returnBps = basisPointsChange(lookbackPoint.mid, point.mid);
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
  return detectExternalBtcEventsFromIterable({
    utcDay: input.utcDay,
    points: input.points,
    lookbackMs: input.lookbackMs,
    boundaryBps: input.boundaryBps,
    cooldownMs: input.cooldownMs,
  });
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
