import { DEFAULT_KALSHI_HISTORICAL_API_BASE } from "@/lib/data/importers/kalshi/historicalEndpoints";

import { CFB_HISTORY_SIGN_PATH, KalshiBrtiAccessProbeError, BRTI_INDEX_ID } from "./types";
import type { SpentTarget } from "./types";

export const DOCUMENTED_HISTORY_TIMESPAN = "HOUR" as const;
export const MAX_HISTORICAL_COVERAGE_MS = 60 * 60 * 1000;

/**
 * Authoritative semantics retrieved 2026-09-24.
 *
 * Kalshi CFB passthrough documents one worked history example:
 *   timespan=HOUR&timestamp=<hour-truncated ISO>
 * and forwards those query params to CF Benchmarks /api/v1/history/values.
 *
 * CF Benchmarks: the range is defined by timespan + timestamp; timestamp must
 * be truncated to the timespan granularity; response is tick-level values
 * sorted ascending; STREAM_HISTORICAL_VALUES entitlement required; recent
 * values may lag up to 15 minutes. No start/end bounds or pagination cursor
 * are documented for a single window. timespan is a fixed lookback/duration
 * window, not an aggregation bar size.
 *
 * MINUTE was previously attempted (v0) and returned 400 invalid-parameters.
 * It is not treated as a documented supported interval for this campaign.
 * DAY is forbidden.
 */
export const HISTORICAL_PARAMETER_SEMANTICS = {
  retrievedAtUtc: "2026-09-24",
  sources: [
    "https://docs.kalshi.com/cfbenchmarks/rest-passthrough",
    "https://docs.cfbenchmarks.com/api/rest/historical-values/",
  ],
  acceptedTimespanDocumentedByKalshiExample: "HOUR",
  previouslyRejectedTimespan: "MINUTE",
  forbiddenTimespans: ["DAY"],
  timestampRule: "truncated to timespan granularity",
  rangeSemantics: "timespan plus truncated timestamp define one fixed window",
  startEndBoundsDocumented: false,
  timespanMeaning: "response duration / lookback window of tick-level values, not an OHLC bar",
  paginationDocumented: false,
  retentionNote: "most recent values may be delayed up to 15 minutes",
  cadence: "tick-level; some indices intra-second",
} as const;

export function selectFollowUpHistoricalTarget(
  targets: readonly SpentTarget[],
): SpentTarget {
  const selected = targets.find((target) => target.role === "middle");
  if (!selected) {
    throw new KalshiBrtiAccessProbeError("follow-up target selection requires a middle SPENT market");
  }
  return selected;
}

export function truncateUtcToHour(isoOrMs: string | number): string {
  const ms = typeof isoOrMs === "number" ? isoOrMs : Date.parse(isoOrMs);
  if (!Number.isFinite(ms)) {
    throw new KalshiBrtiAccessProbeError(`invalid timestamp for hour truncation: ${isoOrMs}`);
  }
  const date = new Date(ms);
  date.setUTCMinutes(0, 0, 0);
  return date.toISOString().replace(/\.\d{3}Z$/, ".000Z");
}

export function plannedHistoryHourForClose(closeTimeUtc: string): {
  hourStartUtc: string;
  hourEndExclusiveUtc: string;
  settlementWindowInsideHour: boolean;
} {
  const closeMs = Date.parse(closeTimeUtc);
  if (!Number.isFinite(closeMs)) {
    throw new KalshiBrtiAccessProbeError(`invalid official close_time: ${closeTimeUtc}`);
  }
  const hourStartUtc = truncateUtcToHour(closeMs);
  const hourStartMs = Date.parse(hourStartUtc);
  const hourEndMs = hourStartMs + MAX_HISTORICAL_COVERAGE_MS;
  const windowStartExclusive = closeMs - 60_000;
  return {
    hourStartUtc,
    hourEndExclusiveUtc: new Date(hourEndMs).toISOString(),
    settlementWindowInsideHour: windowStartExclusive >= hourStartMs && closeMs <= hourEndMs,
  };
}

export function buildCfbHistoryHourUrl(input: {
  hourStartUtc: string;
  baseUrl?: string;
}): {
  url: string;
  signPath: typeof CFB_HISTORY_SIGN_PATH;
  timespan: typeof DOCUMENTED_HISTORY_TIMESPAN;
  timestamp: string;
  coverageMs: number;
} {
  const timestamp = truncateUtcToHour(input.hourStartUtc);
  if (timestamp !== truncateUtcToHour(timestamp)) {
    throw new KalshiBrtiAccessProbeError("history hour timestamp is not hour-truncated");
  }
  const url = new URL(`${input.baseUrl ?? DEFAULT_KALSHI_HISTORICAL_API_BASE}/cfbenchmarks/history/values`);
  url.searchParams.set("id", BRTI_INDEX_ID);
  url.searchParams.set("timespan", DOCUMENTED_HISTORY_TIMESPAN);
  url.searchParams.set("timestamp", timestamp);
  assertHistoryUrlIsHourBounded(url.toString());
  return {
    url: url.toString(),
    signPath: CFB_HISTORY_SIGN_PATH,
    timespan: DOCUMENTED_HISTORY_TIMESPAN,
    timestamp,
    coverageMs: MAX_HISTORICAL_COVERAGE_MS,
  };
}

export function assertHistoryUrlIsHourBounded(url: string): void {
  const parsed = new URL(url);
  const timespan = parsed.searchParams.get("timespan");
  if (timespan === "DAY" || timespan === "MINUTE") {
    throw new KalshiBrtiAccessProbeError(
      `refusing undocumented or forbidden timespan for follow-up: ${timespan}`,
    );
  }
  if (timespan !== DOCUMENTED_HISTORY_TIMESPAN) {
    throw new KalshiBrtiAccessProbeError(
      `refusing unbounded or undocumented timespan: ${timespan ?? "missing"}`,
    );
  }
  const timestamp = parsed.searchParams.get("timestamp");
  if (!timestamp) {
    throw new KalshiBrtiAccessProbeError("history request missing truncated timestamp");
  }
  if (truncateUtcToHour(timestamp) !== timestamp.replace(/\.\d{3}Z$/, ".000Z")
    && truncateUtcToHour(timestamp) !== timestamp) {
    throw new KalshiBrtiAccessProbeError("HOUR timestamp must be truncated to the hour");
  }
  if (parsed.searchParams.has("cursor") || parsed.searchParams.has("end") || parsed.searchParams.has("start")) {
    throw new KalshiBrtiAccessProbeError("history request has undocumented start/end/cursor bounds");
  }
}
