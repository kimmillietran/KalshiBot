import { DEFAULT_KALSHI_HISTORICAL_API_BASE } from "@/lib/data/importers/kalshi/historicalEndpoints";

import {
  BRTI_INDEX_ID,
  CFB_HISTORY_SIGN_PATH,
  CFB_VALUES_SIGN_PATH,
  KalshiBrtiAccessProbeError,
  MAX_MINUTES_PER_TARGET,
} from "./types";

export const ALLOWED_HISTORY_TIMESPAN = "MINUTE" as const;

export function buildCfbLatestValuesUrl(baseUrl = DEFAULT_KALSHI_HISTORICAL_API_BASE): {
  url: string;
  signPath: typeof CFB_VALUES_SIGN_PATH;
} {
  const url = new URL(`${baseUrl}/cfbenchmarks/values`);
  url.searchParams.set("id", BRTI_INDEX_ID);
  return { url: url.toString(), signPath: CFB_VALUES_SIGN_PATH };
}

export function truncateUtcToMinute(isoOrMs: string | number): string {
  const ms = typeof isoOrMs === "number" ? isoOrMs : Date.parse(isoOrMs);
  if (!Number.isFinite(ms)) {
    throw new KalshiBrtiAccessProbeError(`invalid timestamp for minute truncation: ${isoOrMs}`);
  }
  const date = new Date(ms);
  date.setUTCSeconds(0, 0);
  return date.toISOString().replace(/\.\d{3}Z$/, ".000Z");
}

export function buildCfbHistoryMinuteUrl(input: {
  minuteStartUtc: string;
  baseUrl?: string;
}): {
  url: string;
  signPath: typeof CFB_HISTORY_SIGN_PATH;
  timespan: typeof ALLOWED_HISTORY_TIMESPAN;
  timestamp: string;
} {
  if (/timespan=HOUR|timespan=DAY/i.test(input.minuteStartUtc)) {
    throw new KalshiBrtiAccessProbeError("HOUR/DAY historical windows are forbidden");
  }
  const timestamp = truncateUtcToMinute(input.minuteStartUtc);
  const url = new URL(`${input.baseUrl ?? DEFAULT_KALSHI_HISTORICAL_API_BASE}/cfbenchmarks/history/values`);
  url.searchParams.set("id", BRTI_INDEX_ID);
  url.searchParams.set("timespan", ALLOWED_HISTORY_TIMESPAN);
  url.searchParams.set("timestamp", timestamp);
  return {
    url: url.toString(),
    signPath: CFB_HISTORY_SIGN_PATH,
    timespan: ALLOWED_HISTORY_TIMESPAN,
    timestamp,
  };
}

/** Settlement minute plus the preceding minute (start-boundary margin). */
export function plannedHistoryMinutesForClose(closeTimeUtc: string): string[] {
  const closeMs = Date.parse(closeTimeUtc);
  if (!Number.isFinite(closeMs)) {
    throw new KalshiBrtiAccessProbeError(`invalid official close_time: ${closeTimeUtc}`);
  }
  const closeMinute = truncateUtcToMinute(closeMs);
  const marginMinute = truncateUtcToMinute(closeMs - 60_000);
  const unique = [...new Set([marginMinute, closeMinute])];
  if (unique.length > MAX_MINUTES_PER_TARGET) {
    throw new KalshiBrtiAccessProbeError("history plan exceeded two minutes per target");
  }
  return unique;
}

export function assertHistoryUrlIsBounded(url: string): void {
  const parsed = new URL(url);
  const timespan = parsed.searchParams.get("timespan");
  if (timespan !== ALLOWED_HISTORY_TIMESPAN) {
    throw new KalshiBrtiAccessProbeError(
      `refusing unbounded or undocumented timespan: ${timespan ?? "missing"}`,
    );
  }
  if (!parsed.searchParams.get("timestamp")) {
    throw new KalshiBrtiAccessProbeError("history request missing truncated timestamp");
  }
}
