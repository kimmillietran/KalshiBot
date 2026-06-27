import { afterEach, describe, expect, it, vi } from "vitest";

import { MARKET_API_TIMEOUT_MS } from "../constants";
import { fetchWithTimeout, KalshiRequestTimeoutError } from "./fetchWithTimeout";

describe("fetchWithTimeout", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns the response when fetch completes before timeout", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200 }) as Response);

    const res = await fetchWithTimeout("https://example.com/markets", {
      fetchImpl,
      timeoutMs: 100,
    });

    expect(res.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://example.com/markets",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("throws KalshiRequestTimeoutError when fetch exceeds timeout", async () => {
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

    const pending = fetchWithTimeout("https://example.com/markets", {
      fetchImpl,
      timeoutMs: 50,
    });
    const assertion = expect(pending).rejects.toBeInstanceOf(KalshiRequestTimeoutError);

    await vi.advanceTimersByTimeAsync(51);
    await assertion;

    vi.useRealTimers();
  });

  it("defaults to MARKET_API_TIMEOUT_MS", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200 }) as Response);

    await fetchWithTimeout("https://example.com/markets", { fetchImpl });

    expect(fetchImpl).toHaveBeenCalled();
    expect(MARKET_API_TIMEOUT_MS).toBe(5_000);
  });

  it("propagates external AbortError instead of timeout error", async () => {
    const controller = new AbortController();
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

    const pending = fetchWithTimeout("https://example.com/markets", {
      fetchImpl,
      signal: controller.signal,
      timeoutMs: 5_000,
    });

    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await expect(pending).rejects.not.toBeInstanceOf(KalshiRequestTimeoutError);
  });
});
