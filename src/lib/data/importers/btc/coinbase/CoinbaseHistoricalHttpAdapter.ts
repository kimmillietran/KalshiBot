import type { CoinbaseHistoricalHttpFetchCandlesInput } from "./coinbaseHistoricalImporterTypes";
import type { CoinbaseHistoricalHttpClient } from "./coinbaseHistoricalImporterTypes";
import { DEFAULT_COINBASE_EXCHANGE_API_BASE } from "./coinbaseHistoricalImporterTypes";

export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export type CoinbaseHistoricalHttpAdapterOptions = {
  fetchImpl: FetchLike;
  baseUrl?: string;
  defaultHeaders?: Record<string, string>;
};

export class CoinbaseHistoricalHttpAdapterError extends Error {
  readonly url: string;
  readonly status?: number;

  constructor(
    message: string,
    url: string,
    options?: { status?: number; cause?: unknown },
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = "CoinbaseHistoricalHttpAdapterError";
    this.url = url;
    this.status = options?.status;
  }
}

export function buildCoinbaseCandlesUrl(
  baseUrl: string,
  input: CoinbaseHistoricalHttpFetchCandlesInput,
): string {
  const url = new URL(`${baseUrl}/products/${input.productId}/candles`);
  url.searchParams.set("granularity", String(input.granularity));
  url.searchParams.set("start", input.startTime);
  url.searchParams.set("end", input.endTime);
  return url.toString();
}

function parseResponseJson(text: string, url: string): unknown {
  if (text.length === 0) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new CoinbaseHistoricalHttpAdapterError("Invalid JSON response", url, {
      cause: error,
    });
  }
}

/** Production HTTP adapter for Coinbase Exchange historical candles. */
export class CoinbaseHistoricalHttpAdapter implements CoinbaseHistoricalHttpClient {
  private readonly fetchImpl: FetchLike;
  private readonly baseUrl: string;
  private readonly defaultHeaders: Record<string, string>;

  constructor(options: CoinbaseHistoricalHttpAdapterOptions) {
    this.fetchImpl = options.fetchImpl;
    this.baseUrl = options.baseUrl ?? DEFAULT_COINBASE_EXCHANGE_API_BASE;
    this.defaultHeaders = {
      Accept: "application/json",
      ...options.defaultHeaders,
    };
  }

  async fetchCandles(input: CoinbaseHistoricalHttpFetchCandlesInput): Promise<unknown> {
    const url = buildCoinbaseCandlesUrl(this.baseUrl, input);
    const response = await this.fetchImpl(url, {
      method: "GET",
      headers: this.defaultHeaders,
      cache: "no-store",
    });

    const text = await response.text();
    const body = parseResponseJson(text, url);

    if (!response.ok) {
      throw new CoinbaseHistoricalHttpAdapterError(
        `Coinbase historical candles request failed (${response.status})`,
        url,
        { status: response.status },
      );
    }

    return body;
  }
}
