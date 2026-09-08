import { parseIsoTimestampMs } from "../bidOnlyCandidateLifecycle/bidOnlyCandidateLifecycleUtils";
import {
  isRecord,
  readNumber,
  readString,
} from "../calibrationFadeForwardValidation/calibrationFadeForwardValidationUtils";
import { V2_CANDLE_CLOSE_OFFSET_MS } from "../calibrationFadeV2ForwardValidation/calibrationFadeV2ForwardValidationTypes";

import {
  V2_READINESS_REQUIRED_GRANULARITY_MS,
  V2_READINESS_REQUIRED_PRODUCT_ID,
  V2_READINESS_REQUIRED_PROVIDER,
  V2_READINESS_REQUIRED_SOURCE,
  V2_READINESS_REQUIRED_SOURCE_RECORD_TYPE,
} from "./calibrationFadeV2CaptureReadinessTypes";

export type StrictLiveCandleObservation = {
  runId: string;
  processEpochId: string;
  provider: typeof V2_READINESS_REQUIRED_PROVIDER;
  productId: typeof V2_READINESS_REQUIRED_PRODUCT_ID;
  sourceRecordType: typeof V2_READINESS_REQUIRED_SOURCE_RECORD_TYPE;
  source: typeof V2_READINESS_REQUIRED_SOURCE;
  granularityMs: typeof V2_READINESS_REQUIRED_GRANULARITY_MS;
  candleOpenTime: string;
  candleCloseTime: string;
  openTimeMs: number;
  closeTimeMs: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  observedAtLocal: string;
  firstObservedAtLocal: string;
  observedAtLocalMs: number;
  firstObservedAtLocalMs: number;
  requestStartedAtLocalMs: number | null;
  revisionClass: string | null;
};

export type StrictLiveCandleParseFailure = {
  ok: false;
  reason: string;
};

export type StrictLiveCandleParseSuccess = {
  ok: true;
  record: StrictLiveCandleObservation;
};

export type StrictLiveCandleParseResult =
  | StrictLiveCandleParseSuccess
  | StrictLiveCandleParseFailure;

function fail(reason: string): StrictLiveCandleParseFailure {
  return { ok: false, reason };
}

function validateOhlc(open: number, high: number, low: number, close: number): string | null {
  if ([open, high, low, close].some((value) => !Number.isFinite(value) || value <= 0)) {
    return "candle-ohlc-invalid";
  }
  if (high < open || high < close || high < low || low > open || low > close || low > high) {
    return "candle-ohlc-invalid";
  }
  return null;
}

/**
 * Strict live-producer identity parse for readiness. Unlike the evaluator
 * parser, this does not apply diagnostic aliases or defaults for missing
 * producer fields. `source=coinbase-spot` is rejected here.
 */
export function parseStrictLiveCandleObservation(value: unknown): StrictLiveCandleParseResult {
  if (!isRecord(value)) {
    return fail("candle-jsonl-malformed");
  }

  const provider = Object.prototype.hasOwnProperty.call(value, "provider")
    ? readString(value.provider)
    : null;
  if (provider !== V2_READINESS_REQUIRED_PROVIDER) {
    return fail("candle-provider-invalid");
  }

  const productId = Object.prototype.hasOwnProperty.call(value, "productId")
    ? readString(value.productId)
    : null;
  if (productId !== V2_READINESS_REQUIRED_PRODUCT_ID) {
    return fail("candle-product-invalid");
  }

  const sourceRecordType = Object.prototype.hasOwnProperty.call(value, "sourceRecordType")
    ? readString(value.sourceRecordType)
    : null;
  if (sourceRecordType !== V2_READINESS_REQUIRED_SOURCE_RECORD_TYPE) {
    return fail("candle-source-record-type-invalid");
  }

  if (!Object.prototype.hasOwnProperty.call(value, "source")) {
    return fail("candle-source-alias-rejected");
  }
  const source = readString(value.source);
  if (source === V2_READINESS_REQUIRED_PROVIDER) {
    return fail("candle-source-alias-rejected");
  }
  if (source !== V2_READINESS_REQUIRED_SOURCE) {
    return fail("candle-source-alias-rejected");
  }

  if (!Object.prototype.hasOwnProperty.call(value, "granularityMs")) {
    return fail("candle-granularity-invalid");
  }
  const granularityMs = readNumber(value.granularityMs);
  if (granularityMs !== V2_READINESS_REQUIRED_GRANULARITY_MS) {
    return fail("candle-granularity-invalid");
  }

  const runId = readString(value.runId);
  if (!runId) {
    return fail("candle-run-id-missing");
  }

  const processEpochId = readString(value.processEpochId);
  if (!processEpochId) {
    return fail("candle-process-epoch-missing");
  }

  const candleOpenTime = readString(value.candleOpenTime);
  const candleCloseTime = readString(value.candleCloseTime);
  if (!candleOpenTime || !candleCloseTime) {
    return fail("candle-open-close-invalid");
  }
  const openTimeMs = parseIsoTimestampMs(candleOpenTime);
  const closeTimeMs = parseIsoTimestampMs(candleCloseTime);
  if (openTimeMs === null || closeTimeMs === null) {
    return fail("candle-open-close-invalid");
  }
  if (closeTimeMs !== openTimeMs + V2_CANDLE_CLOSE_OFFSET_MS) {
    return fail("candle-close-offset-invalid");
  }

  const open = readNumber(value.open);
  const high = readNumber(value.high);
  const low = readNumber(value.low);
  const close = readNumber(value.close);
  if (open === null || high === null || low === null || close === null) {
    return fail("candle-ohlc-invalid");
  }
  const ohlcReason = validateOhlc(open, high, low, close);
  if (ohlcReason) {
    return fail(ohlcReason);
  }

  if (value.volume !== null && value.volume !== undefined) {
    const volume = readNumber(value.volume);
    if (volume === null || volume < 0) {
      return fail("candle-ohlc-invalid");
    }
  }
  const volume = value.volume === null || value.volume === undefined
    ? null
    : readNumber(value.volume);

  const observedAtLocal = readString(value.observedAtLocal);
  const firstObservedAtLocal = readString(value.firstObservedAtLocal);
  if (!observedAtLocal || !firstObservedAtLocal) {
    return fail("candle-observer-clock-invalid");
  }
  const observedAtLocalMs = parseIsoTimestampMs(observedAtLocal);
  const firstObservedAtLocalMs = parseIsoTimestampMs(firstObservedAtLocal);
  if (observedAtLocalMs === null || firstObservedAtLocalMs === null) {
    return fail("candle-observer-clock-invalid");
  }
  if (firstObservedAtLocalMs > observedAtLocalMs) {
    return fail("candle-observer-clock-invalid");
  }

  let requestStartedAtLocalMs: number | null = null;
  if (Object.prototype.hasOwnProperty.call(value, "requestStartedAtLocal")) {
    const requestStartedAtLocal = readString(value.requestStartedAtLocal);
    if (!requestStartedAtLocal) {
      return fail("candle-observer-clock-invalid");
    }
    requestStartedAtLocalMs = parseIsoTimestampMs(requestStartedAtLocal);
    if (requestStartedAtLocalMs === null) {
      return fail("candle-observer-clock-invalid");
    }
    if (observedAtLocalMs < requestStartedAtLocalMs) {
      return fail("candle-observer-clock-invalid");
    }
  }

  const revisionClass = readString(value.revisionClass);
  if (revisionClass === "first-observation" && firstObservedAtLocalMs !== observedAtLocalMs) {
    return fail("candle-first-observation-clock-mismatch");
  }

  if (closeTimeMs >= observedAtLocalMs) {
    return fail("candle-in-progress");
  }

  return {
    ok: true,
    record: {
      runId,
      processEpochId,
      provider: V2_READINESS_REQUIRED_PROVIDER,
      productId: V2_READINESS_REQUIRED_PRODUCT_ID,
      sourceRecordType: V2_READINESS_REQUIRED_SOURCE_RECORD_TYPE,
      source: V2_READINESS_REQUIRED_SOURCE,
      granularityMs: V2_READINESS_REQUIRED_GRANULARITY_MS,
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
      requestStartedAtLocalMs,
      revisionClass,
    },
  };
}
