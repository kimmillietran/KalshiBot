import type { KalshiHistoricalHttpClient, KalshiHistoricalHttpResponse } from "./KalshiHistoricalImporter";

export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export type KalshiHistoricalHttpAdapterOptions = {
  fetchImpl: FetchLike;
  defaultHeaders?: Record<string, string>;
};

export class KalshiHistoricalHttpAdapterError extends Error {
  readonly url: string;

  constructor(message: string, url: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "KalshiHistoricalHttpAdapterError";
    this.url = url;
  }
}

/** Production HTTP adapter for Kalshi Historical API JSON responses. */
export class KalshiHistoricalHttpAdapter implements KalshiHistoricalHttpClient {
  private readonly fetchImpl: FetchLike;
  private readonly defaultHeaders: Record<string, string>;

  constructor(options: KalshiHistoricalHttpAdapterOptions) {
    this.fetchImpl = options.fetchImpl;
    this.defaultHeaders = {
      Accept: "application/json",
      ...options.defaultHeaders,
    };
  }

  async get(url: string): Promise<KalshiHistoricalHttpResponse> {
    const response = await this.fetchImpl(url, {
      method: "GET",
      headers: this.defaultHeaders,
      cache: "no-store",
    });

    const text = await response.text();
    const body = parseResponseJson(text, url);

    return {
      status: response.status,
      body,
    };
  }
}

function parseResponseJson(text: string, url: string): unknown {
  if (text.length === 0) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new KalshiHistoricalHttpAdapterError("Invalid JSON response", url, {
      cause: error,
    });
  }
}
