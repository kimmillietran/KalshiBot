import { MARKET_API_TIMEOUT_MS } from "../constants";

export class KalshiRequestTimeoutError extends Error {
  constructor(message = "Kalshi request timed out") {
    super(message);
    this.name = "KalshiRequestTimeoutError";
  }
}

export type FetchWithTimeoutOptions = RequestInit & {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

/**
 * Fetch with an AbortSignal timeout. Reusable for all Kalshi outbound calls.
 * External abort signals propagate as AbortError; internal timeouts throw KalshiRequestTimeoutError.
 */
export async function fetchWithTimeout(
  url: string,
  options: FetchWithTimeoutOptions = {},
): Promise<Response> {
  const {
    timeoutMs = MARKET_API_TIMEOUT_MS,
    fetchImpl = fetch,
    signal: externalSignal,
    ...init
  } = options;

  const controller = new AbortController();
  let timedOut = false;

  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener("abort", onExternalAbort);

  try {
    return await fetchImpl(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      if (timedOut) {
        throw new KalshiRequestTimeoutError();
      }
      throw err;
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener("abort", onExternalAbort);
  }
}
