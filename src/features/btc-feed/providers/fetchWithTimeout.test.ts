import { describe, expect, it, vi } from "vitest";

import { BTC_API_TIMEOUT_MS } from "../constants";
import { BtcProviderTimeoutError } from "./errors";
import { fetchWithTimeout } from "./fetchWithTimeout";

describe("btc fetchWithTimeout", () => {
  it("throws BtcProviderTimeoutError on upstream timeout", async () => {
    vi.useFakeTimers();

    const fetchImpl = vi.fn(
      (_url, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const err = new Error("The operation was aborted");
            err.name = "AbortError";
            reject(err);
          });
        }),
    );

    const pending = fetchWithTimeout("https://example.com", { fetchImpl });
    const assertion = expect(pending).rejects.toBeInstanceOf(BtcProviderTimeoutError);

    await vi.advanceTimersByTimeAsync(BTC_API_TIMEOUT_MS + 1);
    await assertion;

    vi.useRealTimers();
  });
});
