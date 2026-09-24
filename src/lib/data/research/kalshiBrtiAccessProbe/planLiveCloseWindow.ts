import { KalshiBrtiAccessProbeError } from "./types";

export const LIVE_PRE_CLOSE_MS = 70_000;
export const LIVE_POST_CLOSE_MS = 20_000;
export const LIVE_MAX_DURATION_MS = 90_000;
export const LIVE_MAX_CONNECTIONS = 2;

export type LiveCloseWindow = {
  closeMs: number;
  startMs: number;
  stopMs: number;
  durationMs: number;
  closeIso: string;
  startIso: string;
  stopIso: string;
};

export function nextQuarterHourCloseMs(nowMs: number): number {
  const quarter = 15 * 60 * 1000;
  const remainder = nowMs % quarter;
  const close = remainder === 0 ? nowMs + quarter : nowMs + (quarter - remainder);
  return close;
}

export function planLiveCloseWindow(nowMs: number): LiveCloseWindow {
  const closeMs = nextQuarterHourCloseMs(nowMs);
  const startMs = closeMs - LIVE_PRE_CLOSE_MS;
  const stopMs = closeMs + LIVE_POST_CLOSE_MS;
  const durationMs = stopMs - startMs;
  if (durationMs > LIVE_MAX_DURATION_MS) {
    throw new KalshiBrtiAccessProbeError("live close window exceeds 90 seconds");
  }
  return {
    closeMs,
    startMs,
    stopMs,
    durationMs,
    closeIso: new Date(closeMs).toISOString(),
    startIso: new Date(startMs).toISOString(),
    stopIso: new Date(stopMs).toISOString(),
  };
}

export function liveDeadlineMs(input: { startMs: number; stopMs: number; nowMs: number }): number {
  return Math.min(input.stopMs, input.startMs + LIVE_MAX_DURATION_MS, input.nowMs + LIVE_MAX_DURATION_MS);
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export function formatKxbtc15mEventTicker(closeMs: number): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "2-digit",
    month: "numeric",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(closeMs));
  const read = (type: string): string => parts.find((part) => part.type === type)?.value ?? "";
  const year = read("year");
  const monthIndex = Number(read("month")) - 1;
  const day = read("day").padStart(2, "0");
  const hour = read("hour").padStart(2, "0");
  const minute = read("minute").padStart(2, "0");
  const month = MONTHS[monthIndex];
  if (!month || !year) {
    throw new KalshiBrtiAccessProbeError("failed to format KXBTC15M event ticker");
  }
  return `KXBTC15M-${year}${month}${day}${hour}${minute}`;
}
