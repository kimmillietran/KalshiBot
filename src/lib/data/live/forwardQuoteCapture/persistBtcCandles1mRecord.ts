import {
  CandleRecordIdentityError,
  LIVE_CANDLE_CLOSE_OFFSET_MS,
  LIVE_CANDLE_GRANULARITY_MS,
  LIVE_CANDLE_PROVIDER,
  LIVE_CANDLE_PRODUCT_ID,
  LIVE_CANDLE_SOURCE,
  LIVE_CANDLE_SOURCE_RECORD_TYPE,
  type BtcCandles1mPersistedRecord,
} from "./btcCandles1mSidecarTypes";

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new CandleRecordIdentityError(
      `btc-candles-1m row is missing a non-empty ${field}`,
    );
  }
  return value;
}

/**
 * Fail-closed serialization guard. An empty/missing runId or processEpochId
 * cannot be written to the live candle JSONL.
 */
export function assertWritableBtcCandles1mRecord(
  record: BtcCandles1mPersistedRecord,
): BtcCandles1mPersistedRecord {
  const runId = requireNonEmptyString(record.runId, "runId");
  const processEpochId = requireNonEmptyString(record.processEpochId, "processEpochId");

  if (record.provider !== LIVE_CANDLE_PROVIDER) {
    throw new CandleRecordIdentityError("btc-candles-1m row has the wrong provider");
  }
  if (record.productId !== LIVE_CANDLE_PRODUCT_ID) {
    throw new CandleRecordIdentityError("btc-candles-1m row has the wrong productId");
  }
  if (record.sourceRecordType !== LIVE_CANDLE_SOURCE_RECORD_TYPE) {
    throw new CandleRecordIdentityError("btc-candles-1m row has the wrong sourceRecordType");
  }
  if (record.source !== LIVE_CANDLE_SOURCE) {
    throw new CandleRecordIdentityError("btc-candles-1m row has the wrong source");
  }
  if (record.granularityMs !== LIVE_CANDLE_GRANULARITY_MS) {
    throw new CandleRecordIdentityError("btc-candles-1m row has the wrong granularityMs");
  }

  const openMs = Date.parse(record.candleOpenTime);
  const closeMs = Date.parse(record.candleCloseTime);
  if (!Number.isFinite(openMs) || !Number.isFinite(closeMs)) {
    throw new CandleRecordIdentityError("btc-candles-1m row has invalid candle timestamps");
  }
  if (closeMs !== openMs + LIVE_CANDLE_CLOSE_OFFSET_MS) {
    throw new CandleRecordIdentityError(
      "btc-candles-1m row closeTime is not openTime + 59999ms",
    );
  }

  return {
    ...record,
    runId,
    processEpochId,
  };
}
