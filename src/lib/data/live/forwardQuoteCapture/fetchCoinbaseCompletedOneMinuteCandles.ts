import {
  fetchWithTimeout,
  KalshiRequestTimeoutError,
} from "@/features/market-data/api/fetchWithTimeout";

import {
  DEFAULT_BTC_CANDLES_1M_REQUEST_TIMEOUT_MS,
  DEFAULT_COINBASE_EXCHANGE_CANDLES_BASE_URL,
  LIVE_CANDLE_GRANULARITY_SECONDS,
  LIVE_CANDLE_PRODUCT_ID,
  type CompletedCandleFetchRequest,
  type CompletedCandleFetchResult,
} from "./btcCandles1mSidecarTypes";

export function buildCoinbaseCompletedOneMinuteCandlesUrl(input: {
  baseUrl?: string;
  productId: string;
  granularitySeconds: number;
  startTime: string;
  endTime: string;
}): string {
  const url = new URL(
    `${input.baseUrl ?? DEFAULT_COINBASE_EXCHANGE_CANDLES_BASE_URL}/products/${input.productId}/candles`,
  );
  url.searchParams.set("granularity", String(input.granularitySeconds));
  url.searchParams.set("start", input.startTime);
  url.searchParams.set("end", input.endTime);
  return url.toString();
}

function classifyHttpStatus(
  status: number,
): Exclude<CompletedCandleFetchResult, { ok: true }>["kind"] {
  if (status === 429) {
    return "http-429";
  }
  if (status >= 500) {
    return "http-5xx";
  }
  return "http-other";
}

/**
 * Public Coinbase Exchange REST candles fetch with timeout/abort.
 * Sidecar-specific: does not reuse the historical importer adapter.
 */
export async function fetchCoinbaseCompletedOneMinuteCandles(input: {
  request: CompletedCandleFetchRequest;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  baseUrl?: string;
}): Promise<CompletedCandleFetchResult> {
  const requestStartedAtLocal = input.request.requestStartedAtLocal;
  const url = buildCoinbaseCompletedOneMinuteCandlesUrl({
    baseUrl: input.baseUrl,
    productId: input.request.productId,
    granularitySeconds: input.request.granularitySeconds,
    startTime: input.request.startTime,
    endTime: input.request.endTime,
  });

  try {
    const response = await fetchWithTimeout(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      timeoutMs: input.timeoutMs ?? DEFAULT_BTC_CANDLES_1M_REQUEST_TIMEOUT_MS,
      fetchImpl: input.fetchImpl,
    });

    if (!response.ok) {
      return {
        ok: false,
        kind: classifyHttpStatus(response.status),
        status: response.status,
        requestStartedAtLocal,
      };
    }

    let body: unknown;
    try {
      const text = await response.text();
      body = text.length === 0 ? [] : JSON.parse(text);
    } catch {
      return {
        ok: false,
        kind: "malformed-body",
        status: response.status,
        requestStartedAtLocal,
      };
    }

    return {
      ok: true,
      status: 200,
      body,
      requestStartedAtLocal,
    };
  } catch (error) {
    if (error instanceof KalshiRequestTimeoutError) {
      return {
        ok: false,
        kind: "timeout",
        status: null,
        requestStartedAtLocal,
      };
    }
    return {
      ok: false,
      kind: "connection-failure",
      status: null,
      requestStartedAtLocal,
    };
  }
}

export function createProductionCompletedCandleFetcher(input: {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  baseUrl?: string;
}): (request: CompletedCandleFetchRequest) => Promise<CompletedCandleFetchResult> {
  return (request) =>
    fetchCoinbaseCompletedOneMinuteCandles({
      request: {
        ...request,
        productId: LIVE_CANDLE_PRODUCT_ID,
        granularitySeconds: LIVE_CANDLE_GRANULARITY_SECONDS,
      },
      fetchImpl: input.fetchImpl,
      timeoutMs: input.timeoutMs,
      baseUrl: input.baseUrl,
    });
}
