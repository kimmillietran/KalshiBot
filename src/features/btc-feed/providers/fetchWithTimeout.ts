import { BTC_API_TIMEOUT_MS } from "../constants";
import { BtcProviderTimeoutError } from "./errors";

export type FetchWithTimeoutOptions = RequestInit & {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

/** Fetch with AbortSignal timeout for BTC upstream calls. */
export async function fetchWithTimeout(
  url: string,
  options: FetchWithTimeoutOptions = {},
): Promise<Response> {
  const {
    timeoutMs = BTC_API_TIMEOUT_MS,
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
        throw new BtcProviderTimeoutError();
      }
      throw err;
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener("abort", onExternalAbort);
  }
}
