import {
  isRecord,
  readNumber,
  readString,
} from "../calibrationFadeForwardValidation/calibrationFadeForwardValidationUtils";
import { parseIsoTimestampMs } from "../bidOnlyCandidateLifecycle/bidOnlyCandidateLifecycleUtils";
import {
  V2_REQUIRED_PROVIDER,
  V2_REQUIRED_PROVIDER_INSTRUMENT,
  V2_REQUIRED_SOURCE_RECORD_TYPE,
} from "../calibrationFadeV2Preregistration";

import {
  CalibrationFadeV2ForwardValidationError,
  V2_CANDLE_CLOSE_OFFSET_MS,
  V2_CANDLE_GRANULARITY_MS,
  V2_RETRIEVAL_METHODS,
  type ClosedMinuteObservation,
  type V2RetrievalMethod,
} from "./calibrationFadeV2ForwardValidationTypes";

const ALLOWED_SOURCES = new Set([
  "coinbase-exchange-rest-candles",
  V2_REQUIRED_PROVIDER,
]);

function deriveCloseTimeMs(openTimeMs: number): number {
  return openTimeMs + V2_CANDLE_CLOSE_OFFSET_MS;
}

function readRetrievalMethod(value: unknown): V2RetrievalMethod {
  if (typeof value !== "string" || value.trim().length === 0) {
    return "synthetic-fixture";
  }
  if ((V2_RETRIEVAL_METHODS as readonly string[]).includes(value)) {
    return value as V2RetrievalMethod;
  }
  throw new CalibrationFadeV2ForwardValidationError(
    `Unknown retrievalMethod ${JSON.stringify(value)}`,
  );
}

function validateOhlc(open: number, high: number, low: number, close: number): void {
  const values = [open, high, low, close];
  if (values.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new CalibrationFadeV2ForwardValidationError(
      "Closed-minute OHLC must be finite and positive",
    );
  }
  if (high < low || high < open || high < close || low > open || low > close) {
    throw new CalibrationFadeV2ForwardValidationError(
      "Closed-minute OHLC identity is malformed",
    );
  }
}

/**
 * Parses one closed-minute observation. Fail-closed on wrong provider/product,
 * bad 1m open/close identity, or non-finite OHLC.
 */
export function parseClosedMinuteObservation(
  value: unknown,
  options: { requireObservationTimestamp: boolean },
): ClosedMinuteObservation {
  if (!isRecord(value)) {
    throw new CalibrationFadeV2ForwardValidationError("Closed-minute observation must be an object");
  }

  const provider = readString(value.provider) ?? readString(value.source);
  const productId = readString(value.productId) ?? readString(value.providerInstrument);
  const sourceRecordType = readString(value.sourceRecordType) ?? V2_REQUIRED_SOURCE_RECORD_TYPE;
  const source = readString(value.source) ?? "coinbase-exchange-rest-candles";

  if (provider !== V2_REQUIRED_PROVIDER) {
    throw new CalibrationFadeV2ForwardValidationError(
      `Wrong provider for v2 completed-candle source: required ${V2_REQUIRED_PROVIDER}, received ${JSON.stringify(provider)}`,
    );
  }
  if (productId !== V2_REQUIRED_PROVIDER_INSTRUMENT) {
    throw new CalibrationFadeV2ForwardValidationError(
      `Wrong product for v2 completed-candle source: required ${V2_REQUIRED_PROVIDER_INSTRUMENT}, received ${JSON.stringify(productId)}`,
    );
  }
  if (sourceRecordType !== V2_REQUIRED_SOURCE_RECORD_TYPE) {
    throw new CalibrationFadeV2ForwardValidationError(
      `Wrong sourceRecordType: required ${V2_REQUIRED_SOURCE_RECORD_TYPE}, received ${JSON.stringify(sourceRecordType)}`,
    );
  }
  if (!ALLOWED_SOURCES.has(source)) {
    throw new CalibrationFadeV2ForwardValidationError(
      `Wrong source for v2 completed-candle observation: received ${JSON.stringify(source)}`,
    );
  }

  const granularityMs = readNumber(value.granularityMs) ?? V2_CANDLE_GRANULARITY_MS;
  if (granularityMs !== V2_CANDLE_GRANULARITY_MS) {
    throw new CalibrationFadeV2ForwardValidationError(
      `v2 candles must be 1-minute (granularityMs=${V2_CANDLE_GRANULARITY_MS})`,
    );
  }

  const candleOpenTime = readString(value.candleOpenTime);
  const candleCloseTime = readString(value.candleCloseTime);
  if (!candleOpenTime || !candleCloseTime) {
    throw new CalibrationFadeV2ForwardValidationError(
      "candleOpenTime and candleCloseTime are required",
    );
  }
  const openTimeMs = parseIsoTimestampMs(candleOpenTime);
  const closeTimeMs = parseIsoTimestampMs(candleCloseTime);
  if (openTimeMs === null || closeTimeMs === null) {
    throw new CalibrationFadeV2ForwardValidationError("Candle open/close times must be valid UTC ISO timestamps");
  }
  if (closeTimeMs !== deriveCloseTimeMs(openTimeMs)) {
    throw new CalibrationFadeV2ForwardValidationError(
      `candleCloseTime must equal candleOpenTime + ${V2_CANDLE_CLOSE_OFFSET_MS}ms; `
        + `received open=${candleOpenTime} close=${candleCloseTime}`,
    );
  }

  const open = readNumber(value.open);
  const high = readNumber(value.high);
  const low = readNumber(value.low);
  const close = readNumber(value.close);
  if (open === null || high === null || low === null || close === null) {
    throw new CalibrationFadeV2ForwardValidationError("OHLC fields must be finite numbers");
  }
  validateOhlc(open, high, low, close);

  const observedAtLocal = readString(value.observedAtLocal);
  const firstObservedAtLocal = readString(value.firstObservedAtLocal) ?? observedAtLocal;
  if (!observedAtLocal || !firstObservedAtLocal) {
    if (options.requireObservationTimestamp) {
      throw new CalibrationFadeV2ForwardValidationError(
        "observedAtLocal is required; closeTime must not substitute for observation time",
      );
    }
    throw new CalibrationFadeV2ForwardValidationError(
      "observedAtLocal is required for closed-minute observations",
    );
  }
  const observedAtLocalMs = parseIsoTimestampMs(observedAtLocal);
  const firstObservedAtLocalMs = parseIsoTimestampMs(firstObservedAtLocal);
  if (observedAtLocalMs === null || firstObservedAtLocalMs === null) {
    throw new CalibrationFadeV2ForwardValidationError(
      "observedAtLocal / firstObservedAtLocal must be valid UTC ISO timestamps",
    );
  }

  const volume = value.volume === null || value.volume === undefined ? null : readNumber(value.volume);
  if (value.volume !== null && value.volume !== undefined && volume === null) {
    throw new CalibrationFadeV2ForwardValidationError("volume must be a finite number or null");
  }

  return {
    source,
    provider: V2_REQUIRED_PROVIDER,
    productId: V2_REQUIRED_PROVIDER_INSTRUMENT,
    sourceRecordType: V2_REQUIRED_SOURCE_RECORD_TYPE,
    granularityMs: V2_CANDLE_GRANULARITY_MS,
    candleOpenTime,
    candleCloseTime,
    openTimeMs,
    closeTimeMs,
    open,
    high,
    low,
    close,
    volume,
    observedAtLocal,
    firstObservedAtLocal,
    observedAtLocalMs,
    firstObservedAtLocalMs,
    retrievalMethod: readRetrievalMethod(value.retrievalMethod),
    ohlcComplete: true,
    runId: readString(value.runId),
    processEpochId: readString(value.processEpochId),
  };
}

export function derivedOneMinuteCloseTimeMs(openTimeMs: number): number {
  return deriveCloseTimeMs(openTimeMs);
}
