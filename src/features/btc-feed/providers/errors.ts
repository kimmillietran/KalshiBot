/** Upstream request exceeded the configured timeout. */
export class BtcProviderTimeoutError extends Error {
  constructor(message = "BTC provider request timed out") {
    super(message);
    this.name = "BtcProviderTimeoutError";
  }
}

/** Upstream returned HTTP 429. */
export class BtcProviderRateLimitError extends Error {
  constructor(message = "BTC provider rate limit exceeded") {
    super(message);
    this.name = "BtcProviderRateLimitError";
  }
}

/** Upstream unavailable (5xx, geo-block, service down). */
export class BtcProviderUnavailableError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "BtcProviderUnavailableError";
    this.status = status;
  }
}

/** Response body failed schema / parse validation. */
export class BtcProviderMalformedResponseError extends Error {
  constructor(message = "BTC provider returned malformed data") {
    super(message);
    this.name = "BtcProviderMalformedResponseError";
  }
}

/** Network-level failure (DNS, connection reset, etc.). */
export class BtcProviderNetworkError extends Error {
  constructor(message = "BTC provider network error") {
    super(message);
    this.name = "BtcProviderNetworkError";
  }
}
