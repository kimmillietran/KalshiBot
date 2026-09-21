/**
 * M16.2 fixed UTC launch window helpers — DST-independent.
 * Governed capture window: 14:00–18:00Z daily (240m).
 */
import {
  M16_FIXED_UTC_WINDOW_END_HHMM,
  M16_FIXED_UTC_WINDOW_START_HHMM,
  M16_STANDARD_SEGMENT_DURATION_MINUTES,
} from "./m16ProspectiveCohortPlan";
import { M16ValidationCollectionError } from "./m16ValidationCohortTypes";

/** Invoke from 13:55Z (5 minutes before window). */
export const M16_LAUNCH_TOLERANCE_BEFORE_MS = 5 * 60 * 1000;
/** Must begin by 14:05Z else missed-window. */
export const M16_LAUNCH_TOLERANCE_AFTER_MS = 5 * 60 * 1000;

export const M16_GOVERNED_WINDOW_START_HH = 14 as const;
export const M16_GOVERNED_WINDOW_START_MM = 0 as const;
export const M16_GOVERNED_WINDOW_END_HH = 18 as const;
export const M16_GOVERNED_WINDOW_END_MM = 0 as const;

export type M16GovernedWindow = {
  utcDay: string;
  startMs: number;
  endMs: number;
  startIso: string;
  endIso: string;
  durationMinutes: typeof M16_STANDARD_SEGMENT_DURATION_MINUTES;
};

export type M16LaunchWindowEvaluation =
  | {
    status: "too-early";
    utcDay: string;
    window: M16GovernedWindow;
    waitMs: number;
    message: string;
  }
  | {
    status: "in-tolerance-wait-for-start";
    utcDay: string;
    window: M16GovernedWindow;
    waitMs: number;
    message: string;
  }
  | {
    status: "launch-now";
    utcDay: string;
    window: M16GovernedWindow;
    waitMs: 0;
    message: string;
  }
  | {
    status: "missed-window";
    utcDay: string;
    window: M16GovernedWindow;
    waitMs: 0;
    message: string;
  };

function assertUtcDayKey(day: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    throw new M16ValidationCollectionError(
      `utcDay must be YYYY-MM-DD; got ${day}`,
    );
  }
}

/** UTC calendar day key for an instant (DST-independent). */
export function m16UtcDayFromMs(ms: number): string {
  if (!Number.isFinite(ms)) {
    throw new M16ValidationCollectionError(`invalid timestamp ms=${ms}`);
  }
  return new Date(ms).toISOString().slice(0, 10);
}

/** Parse YYYY-MM-DD as UTC midnight. */
export function m16UtcMidnightMs(utcDay: string): number {
  assertUtcDayKey(utcDay);
  const ms = Date.parse(`${utcDay}T00:00:00.000Z`);
  if (!Number.isFinite(ms)) {
    throw new M16ValidationCollectionError(`invalid utcDay ${utcDay}`);
  }
  return ms;
}

export function m16GovernedWindowForUtcDay(utcDay: string): M16GovernedWindow {
  assertUtcDayKey(utcDay);
  const startIso = `${utcDay}T${M16_FIXED_UTC_WINDOW_START_HHMM}:00.000Z`;
  const startMs = Date.parse(startIso);
  const endMs = startMs + M16_STANDARD_SEGMENT_DURATION_MINUTES * 60_000;
  const endIso = new Date(endMs).toISOString();
  const endDay = new Date(endMs - 1).toISOString().slice(0, 10);
  if (endDay !== utcDay) {
    throw new M16ValidationCollectionError(
      `governed window for ${utcDay} would cross UTC midnight `
        + `(${startIso} → ${endIso})`,
    );
  }
  if (
    M16_FIXED_UTC_WINDOW_START_HHMM !== "14:00"
    || M16_FIXED_UTC_WINDOW_END_HHMM !== "18:00"
  ) {
    throw new M16ValidationCollectionError(
      "M16.2 schedule expects sealed 14:00–18:00Z window constants",
    );
  }
  return {
    utcDay,
    startMs,
    endMs,
    startIso,
    endIso,
    durationMinutes: M16_STANDARD_SEGMENT_DURATION_MINUTES,
  };
}

/**
 * Evaluate whether now is within launch tolerance for the governed window.
 * Default utcDay = UTC day of nowMs (never backfills a prior missed day).
 */
export function evaluateM16LaunchWindow(
  nowMs: number,
  utcDay?: string,
): M16LaunchWindowEvaluation {
  const day = utcDay ?? m16UtcDayFromMs(nowMs);
  const window = m16GovernedWindowForUtcDay(day);
  const earliest = window.startMs - M16_LAUNCH_TOLERANCE_BEFORE_MS;
  const latest = window.startMs + M16_LAUNCH_TOLERANCE_AFTER_MS;

  if (nowMs < earliest) {
    return {
      status: "too-early",
      utcDay: day,
      window,
      waitMs: window.startMs - nowMs,
      message:
        `Too early for ${day} window; next launch opens at `
        + `${new Date(earliest).toISOString()} (window ${window.startIso})`,
    };
  }
  if (nowMs < window.startMs) {
    return {
      status: "in-tolerance-wait-for-start",
      utcDay: day,
      window,
      waitMs: window.startMs - nowMs,
      message:
        `Inside pre-launch tolerance for ${day}; wait until ${window.startIso}`,
    };
  }
  if (nowMs <= latest) {
    return {
      status: "launch-now",
      utcDay: day,
      window,
      waitMs: 0,
      message: `Within launch tolerance for ${day}; begin at ${window.startIso}`,
    };
  }
  return {
    status: "missed-window",
    utcDay: day,
    window,
    waitMs: 0,
    message:
      `Missed ${day} launch window (must begin by `
      + `${new Date(latest).toISOString()}); never backfill`,
  };
}

/**
 * Next governed capture start ≥ nowMs.
 * If still before today's latest launch, returns today's 14:00Z;
 * otherwise tomorrow 14:00Z. Never returns a past missed day's start.
 */
export function nextM16GovernedCaptureStart(nowMs: number): {
  utcDay: string;
  startMs: number;
  startIso: string;
} {
  const today = m16UtcDayFromMs(nowMs);
  const todayWindow = m16GovernedWindowForUtcDay(today);
  const todayLatest = todayWindow.startMs + M16_LAUNCH_TOLERANCE_AFTER_MS;
  if (nowMs <= todayLatest) {
    return {
      utcDay: today,
      startMs: todayWindow.startMs,
      startIso: todayWindow.startIso,
    };
  }
  const tomorrowMs = todayWindow.startMs + 24 * 60 * 60 * 1000;
  const tomorrow = m16UtcDayFromMs(tomorrowMs);
  const next = m16GovernedWindowForUtcDay(tomorrow);
  return {
    utcDay: tomorrow,
    startMs: next.startMs,
    startIso: next.startIso,
  };
}
