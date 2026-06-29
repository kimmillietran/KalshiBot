import { fnv1a32, stableStringify } from "@/lib/trading/config/hashConfig";
import { DataSource, type FetchProvenance } from "@/lib/data/provenance";
import { isUtcIsoTimestamp } from "@/lib/data/timestamps";
import type {
  CollectionTime,
  EventTime,
  ObservedAt,
} from "@/lib/data/timestamps";
import type { RawHistoricalRecord } from "@/lib/data/types";

export const KALSHI_BRONZE_CONTENT_TYPE = {
  market: "kalshi.historical.market",
  candlestick: "kalshi.historical.candlestick",
  settlement: "kalshi.historical.settlement",
} as const;

export type KalshiBronzeMappingInput = {
  ticker: string;
  rawPayload: unknown;
  eventTime: EventTime;
  collectionTime: CollectionTime;
  observedAt: ObservedAt;
  requestPath: string;
  fetchId?: string;
};

function buildRecordId(
  contentType: string,
  ticker: string,
  eventTime: EventTime,
  rawPayload: unknown,
): string {
  const digest = fnv1a32(
    stableStringify({
      contentType,
      ticker,
      eventTime,
      payload: rawPayload,
    }),
  );
  return `kalshi-bronze-${digest}`;
}

function buildFetchProvenance(
  source: (typeof DataSource)[keyof typeof DataSource],
  input: KalshiBronzeMappingInput,
): FetchProvenance {
  return {
    source,
    collectionTime: input.collectionTime,
    observedAt: input.observedAt,
    fetchId: input.fetchId ?? input.requestPath,
    apiVersion: "kalshi-trade-api-v2",
  };
}

function toBronzeRecord(
  contentType: string,
  source: (typeof DataSource)[keyof typeof DataSource],
  input: KalshiBronzeMappingInput,
): RawHistoricalRecord {
  return {
    recordId: buildRecordId(contentType, input.ticker, input.eventTime, input.rawPayload),
    ticker: input.ticker,
    contentType,
    payload: input.rawPayload,
    eventTime: input.eventTime,
    collectionTime: input.collectionTime,
    observedAt: input.observedAt,
    provenance: buildFetchProvenance(source, input),
  };
}

/** Maps a raw Kalshi historical market wire payload to a bronze record. */
export function mapKalshiMarketPayloadToBronzeRecord(
  input: KalshiBronzeMappingInput,
): RawHistoricalRecord {
  return toBronzeRecord(
    KALSHI_BRONZE_CONTENT_TYPE.market,
    DataSource.KALSHI_REST,
    input,
  );
}

/** Maps a raw Kalshi historical candlestick wire payload to a bronze record. */
export function mapKalshiCandlestickPayloadToBronzeRecord(
  input: KalshiBronzeMappingInput,
): RawHistoricalRecord {
  return toBronzeRecord(
    KALSHI_BRONZE_CONTENT_TYPE.candlestick,
    DataSource.KALSHI_CANDLES,
    input,
  );
}

/** Maps a raw Kalshi historical settlement wire payload to a bronze record. */
export function mapKalshiSettlementPayloadToBronzeRecord(
  input: KalshiBronzeMappingInput,
): RawHistoricalRecord {
  return toBronzeRecord(
    KALSHI_BRONZE_CONTENT_TYPE.settlement,
    DataSource.KALSHI_REST,
    input,
  );
}

/** Converts a Kalshi unix-seconds timestamp into a UTC EventTime. */
export function kalshiUnixSecondsToEventTime(unixSeconds: number): EventTime {
  return new Date(unixSeconds * 1000).toISOString() as EventTime;
}

/** Normalizes a Kalshi market wire timestamp to canonical UTC EventTime. */
function normalizeMarketWireTimestamp(raw: string, label: string): EventTime {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error(`Kalshi market wire ${label} is missing`);
  }

  const parsedMs = Date.parse(trimmed);
  if (!Number.isFinite(parsedMs)) {
    throw new Error(`Kalshi market wire ${label} is invalid`);
  }

  const normalized = new Date(parsedMs).toISOString();
  if (!isUtcIsoTimestamp(normalized)) {
    throw new Error(`Kalshi market wire ${label} could not be normalized to UTC ISO`);
  }

  return normalized as EventTime;
}

/** Derives event time from a market wire payload without mutating it. */
export function eventTimeFromMarketWire(market: {
  settlement_ts?: string | null;
  close_time: string;
}): EventTime {
  if (market.settlement_ts !== null && market.settlement_ts !== undefined) {
    return normalizeMarketWireTimestamp(market.settlement_ts, "settlement_ts");
  }

  return normalizeMarketWireTimestamp(market.close_time, "close_time");
}
