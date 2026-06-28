import type {
  BtcHistoricalHttpClient,
  BtcHistoricalHttpFetchKlinesInput,
} from "./btcHistoricalImporterTypes";
import { DEFAULT_BINANCE_SPOT_KLINES_BASE } from "./btcHistoricalImporterTypes";

export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export type BtcHistoricalHttpAdapterOptions = {
  fetchImpl: FetchLike;
  baseUrl?: string;
  defaultHeaders?: Record<string, string>;
};

export class BtcHistoricalHttpAdapterError extends Error {
  readonly url: string;
  readonly status?: number;

  constructor(
    message: string,
    url: string,
    options?: { status?: number; cause?: unknown },
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = "BtcHistoricalHttpAdapterError";
    this.url = url;
    this.status = options?.status;
  }
}

function buildBinanceKlinesUrl(
  baseUrl: string,
  input: BtcHistoricalHttpFetchKlinesInput,
): string {
  const params = new URLSearchParams({
    symbol: input.symbol,
    interval: input.interval,
    startTime: String(input.startTimeMs),
    endTime: String(input.endTimeMs),
  });

  return `${baseUrl}/api/v3/klines?${params.toString()}`;
}

function parseResponseJson(text: string, url: string): unknown {
  if (text.length === 0) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new BtcHistoricalHttpAdapterError("Invalid JSON response", url, {
      cause: error,
    });
  }
}

/** Production HTTP adapter for Binance-compatible spot kline endpoints. */
export class BtcHistoricalHttpAdapter implements BtcHistoricalHttpClient {
  private readonly fetchImpl: FetchLike;
  private readonly baseUrl: string;
  private readonly defaultHeaders: Record<string, string>;

  constructor(options: BtcHistoricalHttpAdapterOptions) {
    this.fetchImpl = options.fetchImpl;
    this.baseUrl = options.baseUrl ?? DEFAULT_BINANCE_SPOT_KLINES_BASE;
    this.defaultHeaders = {
      Accept: "application/json",
      ...options.defaultHeaders,
    };
  }

  async fetchKlines(input: BtcHistoricalHttpFetchKlinesInput): Promise<unknown> {
    const url = buildBinanceKlinesUrl(this.baseUrl, input);
    const response = await this.fetchImpl(url, {
      method: "GET",
      headers: this.defaultHeaders,
      cache: "no-store",
    });

    const text = await response.text();
    const body = parseResponseJson(text, url);

    if (!response.ok) {
      throw new BtcHistoricalHttpAdapterError(
        `BTC historical klines request failed (${response.status})`,
        url,
        { status: response.status },
      );
    }

    return body;
  }
}

export { buildBinanceKlinesUrl };
