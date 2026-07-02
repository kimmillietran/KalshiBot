import { describe, expect, it, vi } from "vitest";

import { KalshiHistoricalImporterError } from "@/lib/data/importers/kalshi/KalshiHistoricalImporter";

import {
  computeDiscoveryRetryDelayMs,
  fetchDiscoveryPageWithRetry,
  parseMarketDiscoveryRateLimitOptions,
  parseRetryAfterHeader,
} from "./discoveryRateLimit";
import { MarketDiscoveryError } from "./discoveryTypes";

describe("parseMarketDiscoveryRateLimitOptions", () => {
  it("returns zero delay and retries when no options are supplied", () => {
    expect(parseMarketDiscoveryRateLimitOptions()).toEqual({
      requestDelayMs: 0,
      maxRetries: 0,
      retryBaseDelayMs: 1000,
      use429FallbackRetries: true,
    });
  });

  it("applies defaults when any rate-limit option is supplied", () => {
    expect(parseMarketDiscoveryRateLimitOptions({ maxRetries: 3 })).toEqual({
      requestDelayMs: 250,
      maxRetries: 3,
      retryBaseDelayMs: 1000,
      use429FallbackRetries: false,
    });
  });

  it("rejects negative values", () => {
    expect(() => parseMarketDiscoveryRateLimitOptions({ requestDelayMs: -1 }))
      .toThrow(MarketDiscoveryError);
    expect(() => parseMarketDiscoveryRateLimitOptions({ maxRetries: -1 }))
      .toThrow(MarketDiscoveryError);
    expect(() => parseMarketDiscoveryRateLimitOptions({ retryBaseDelayMs: -1 }))
      .toThrow(MarketDiscoveryError);
  });

  it("allows maxRetries = 0", () => {
    expect(parseMarketDiscoveryRateLimitOptions({ maxRetries: 0 })).toMatchObject({
      maxRetries: 0,
      use429FallbackRetries: false,
    });
  });
});

describe("parseRetryAfterHeader", () => {
  it("parses Retry-After seconds", () => {
    expect(parseRetryAfterHeader("2")).toBe(2000);
  });

  it("returns undefined for invalid values", () => {
    expect(parseRetryAfterHeader("")).toBeUndefined();
    expect(parseRetryAfterHeader("not-a-date")).toBeUndefined();
  });
});

describe("computeDiscoveryRetryDelayMs", () => {
  it("uses linear backoff when Retry-After is absent", () => {
    expect(
      computeDiscoveryRetryDelayMs({
        attempt: 0,
        retryBaseDelayMs: 1000,
      }),
    ).toBe(1000);
    expect(
      computeDiscoveryRetryDelayMs({
        attempt: 2,
        retryBaseDelayMs: 1000,
      }),
    ).toBe(3000);
  });

  it("honors Retry-After when provided", () => {
    expect(
      computeDiscoveryRetryDelayMs({
        attempt: 2,
        retryBaseDelayMs: 1000,
        retryAfterMs: 4500,
      }),
    ).toBe(4500);
  });
});

describe("fetchDiscoveryPageWithRetry", () => {
  it("retries after 429 and eventually succeeds", async () => {
    const fetchPage = vi
      .fn()
      .mockRejectedValueOnce(new KalshiHistoricalImporterError("rate limited", 429))
      .mockResolvedValueOnce({ markets: [] });

    const sleep = vi.fn(async () => undefined);
    const logWarning = vi.fn();

    const result = await fetchDiscoveryPageWithRetry({
      fetchPage,
      rateLimit: parseMarketDiscoveryRateLimitOptions({ maxRetries: 2 }),
      sleep,
      logWarning,
    });

    expect(result).toEqual({ markets: [] });
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1000);
    expect(logWarning).toHaveBeenCalledWith(
      expect.stringContaining("retrying in 1000ms"),
    );
  });

  it("fails clearly after retry budget is exhausted", async () => {
    const fetchPage = vi
      .fn()
      .mockRejectedValue(new KalshiHistoricalImporterError("rate limited", 429));

    await expect(
      fetchDiscoveryPageWithRetry({
        fetchPage,
        rateLimit: parseMarketDiscoveryRateLimitOptions({ maxRetries: 1 }),
        sleep: async () => undefined,
      }),
    ).rejects.toThrow("persisted after 1 retries");
  });

  it("honors Retry-After from importer errors", async () => {
    const fetchPage = vi
      .fn()
      .mockRejectedValueOnce(
        new KalshiHistoricalImporterError("rate limited", 429, undefined, 3500),
      )
      .mockResolvedValueOnce({ markets: [] });

    const sleep = vi.fn(async () => undefined);

    await fetchDiscoveryPageWithRetry({
      fetchPage,
      rateLimit: parseMarketDiscoveryRateLimitOptions({ maxRetries: 1 }),
      sleep,
    });

    expect(sleep).toHaveBeenCalledWith(3500);
  });

  it("uses 429 fallback retries when no explicit options are configured", async () => {
    const fetchPage = vi
      .fn()
      .mockRejectedValueOnce(new KalshiHistoricalImporterError("rate limited", 429))
      .mockResolvedValueOnce({ markets: [] });

    await fetchDiscoveryPageWithRetry({
      fetchPage,
      rateLimit: parseMarketDiscoveryRateLimitOptions(),
      sleep: async () => undefined,
    });

    expect(fetchPage).toHaveBeenCalledTimes(2);
  });
});
