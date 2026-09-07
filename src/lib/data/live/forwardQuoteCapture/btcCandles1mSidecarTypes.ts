import {
  V2_CANDLE_CLOSE_OFFSET_MS,
  V2_CANDLE_GRANULARITY_MS,
  V2_REQUIRED_CLOSE_COUNT,
} from "@/lib/data/research/calibrationFadeV2ForwardValidation/calibrationFadeV2ForwardValidationTypes";
import {
  V2_REQUIRED_PROVIDER,
  V2_REQUIRED_PROVIDER_INSTRUMENT,
  V2_REQUIRED_SOURCE_RECORD_TYPE,
} from "@/lib/data/research/calibrationFadeV2Preregistration";

export const BTC_CANDLES_1M_ARTIFACT_FILENAME = "btc-candles-1m.jsonl" as const;

export const LIVE_CANDLE_PROVIDER = V2_REQUIRED_PROVIDER;
export const LIVE_CANDLE_PRODUCT_ID = V2_REQUIRED_PROVIDER_INSTRUMENT;
export const LIVE_CANDLE_SOURCE_RECORD_TYPE = V2_REQUIRED_SOURCE_RECORD_TYPE;
export const LIVE_CANDLE_SOURCE = "coinbase-exchange-rest-candles" as const;
export const LIVE_CANDLE_GRANULARITY_MS = V2_CANDLE_GRANULARITY_MS;
export const LIVE_CANDLE_CLOSE_OFFSET_MS = V2_CANDLE_CLOSE_OFFSET_MS;
export const LIVE_CANDLE_GRANULARITY_SECONDS = 60;
export const LIVE_CANDLE_REQUIRED_CLOSE_COUNT = V2_REQUIRED_CLOSE_COUNT;

/** Operational capture defaults only. Not hypothesis eligibility. */
export const DEFAULT_BTC_CANDLES_1M_POLL_INTERVAL_MS = 15_000;
export const DEFAULT_BTC_CANDLES_1M_REQUEST_TIMEOUT_MS = 10_000;
export const DEFAULT_BTC_CANDLES_1M_BACKFILL_COMPLETED_MINUTES = 15;
export const DEFAULT_BTC_CANDLES_1M_POLL_LOOKBACK_MINUTES = 4;
export const DEFAULT_BTC_CANDLES_1M_DEGRADED_AFTER_FAILURES = 3;
export const DEFAULT_COINBASE_EXCHANGE_CANDLES_BASE_URL =
  "https://api.exchange.coinbase.com";

export const LIVE_CANDLE_RETRIEVAL_METHODS = [
  "startup-backfill",
  "rest-poll",
] as const;
export type LiveCandleRetrievalMethod = (typeof LIVE_CANDLE_RETRIEVAL_METHODS)[number];

export const LIVE_CANDLE_REVISION_CLASSES = [
  "first-observation",
  "volume-only",
  "ohlc-revision",
] as const;
export type LiveCandleRevisionClass = (typeof LIVE_CANDLE_REVISION_CLASSES)[number];

export type BtcCandles1mHealthStatus = "disabled" | "enabled" | "healthy" | "degraded";

export type BtcCandles1mPersistedRecord = {
  runId: string;
  processEpochId: string;
  provider: typeof LIVE_CANDLE_PROVIDER;
  productId: typeof LIVE_CANDLE_PRODUCT_ID;
  sourceRecordType: typeof LIVE_CANDLE_SOURCE_RECORD_TYPE;
  source: typeof LIVE_CANDLE_SOURCE;
  granularityMs: typeof LIVE_CANDLE_GRANULARITY_MS;
  candleOpenTime: string;
  candleCloseTime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  observedAtLocal: string;
  firstObservedAtLocal: string;
  retrievalMethod: LiveCandleRetrievalMethod;
  observationIndex: number;
  revisionClass: LiveCandleRevisionClass;
  requestStartedAtLocal: string;
};

export type BtcCandles1mHealth = {
  status: BtcCandles1mHealthStatus;
  recordsCaptured: number;
  distinctExchangeMinutes: number;
  startupBackfillRecords: number;
  restPollRecords: number;
  identicalRepeatSuppressed: number;
  volumeOnlyRevisionCount: number;
  ohlcRevisionCount: number;
  inProgressDropped: number;
  malformedRowCount: number;
  emptySuccessCount: number;
  coverageMissCount: number;
  identityRejected: number;
  timestampConflictCount: number;
  http429Count: number;
  http5xxCount: number;
  timeoutCount: number;
  connectionFailureCount: number;
  lastObservedAtLocal: string | null;
  processEpochId: string | null;
};

export type CompletedCandleFetchRequest = {
  productId: typeof LIVE_CANDLE_PRODUCT_ID;
  granularitySeconds: typeof LIVE_CANDLE_GRANULARITY_SECONDS;
  startTime: string;
  endTime: string;
  requestStartedAtLocal: string;
};

export type CompletedCandleFetchResult =
  | {
    ok: true;
    status: 200;
    body: unknown;
    requestStartedAtLocal: string;
  }
  | {
    ok: false;
    kind:
      | "http-429"
      | "http-5xx"
      | "http-other"
      | "timeout"
      | "connection-failure"
      | "malformed-body";
    status: number | null;
    requestStartedAtLocal: string;
  };

export type FetchCompletedCandles = (
  request: CompletedCandleFetchRequest,
) => Promise<CompletedCandleFetchResult>;

export class CandleRecordIdentityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CandleRecordIdentityError";
  }
}

export function createDisabledBtcCandles1mHealth(): BtcCandles1mHealth {
  return {
    status: "disabled",
    recordsCaptured: 0,
    distinctExchangeMinutes: 0,
    startupBackfillRecords: 0,
    restPollRecords: 0,
    identicalRepeatSuppressed: 0,
    volumeOnlyRevisionCount: 0,
    ohlcRevisionCount: 0,
    inProgressDropped: 0,
    malformedRowCount: 0,
    emptySuccessCount: 0,
    coverageMissCount: 0,
    identityRejected: 0,
    timestampConflictCount: 0,
    http429Count: 0,
    http5xxCount: 0,
    timeoutCount: 0,
    connectionFailureCount: 0,
    lastObservedAtLocal: null,
    processEpochId: null,
  };
}

export function createEmptyBtcCandles1mHealth(
  processEpochId: string | null,
): BtcCandles1mHealth {
  return {
    ...createDisabledBtcCandles1mHealth(),
    status: "enabled",
    processEpochId,
  };
}
