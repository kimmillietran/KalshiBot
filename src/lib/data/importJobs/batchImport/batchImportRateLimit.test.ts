import { describe, expect, it, vi } from "vitest";

import { KalshiHistoricalImporterError } from "@/lib/data/importers/kalshi";

import {
  computeBatchImportRetryDelayMs,
  parseBatchImportRateLimitOptions,
  runImportWithRateLimitRetry,
} from "./batchImportRateLimit";
import { BatchImportRunnerError } from "./batchImportTypes";

describe("parseBatchImportRateLimitOptions", () => {
  it("defaults to no throttling or retries", () => {
    expect(parseBatchImportRateLimitOptions()).toEqual({
      requestDelayMs: 0,
      maxRetries: 0,
      retryBaseDelayMs: 2000,
    });
  });

  it("rejects invalid values", () => {
    expect(() => parseBatchImportRateLimitOptions({ requestDelayMs: -1 })).toThrow(
      BatchImportRunnerError,
    );
    expect(() => parseBatchImportRateLimitOptions({ maxRetries: 1.5 })).toThrow(
      BatchImportRunnerError,
    );
  });
});

describe("computeBatchImportRetryDelayMs", () => {
  it("honors Retry-After when provided", () => {
    expect(
      computeBatchImportRetryDelayMs({
        attempt: 0,
        retryBaseDelayMs: 2000,
        retryAfterMs: 5000,
      }),
    ).toBe(5000);
  });

  it("uses linear backoff from retryBaseDelayMs", () => {
    expect(
      computeBatchImportRetryDelayMs({
        attempt: 2,
        retryBaseDelayMs: 2000,
      }),
    ).toBe(6000);
  });
});

describe("runImportWithRateLimitRetry", () => {
  it("retries 429 errors and eventually succeeds", async () => {
    const sleep = vi.fn(async () => undefined);
    let attempts = 0;
    const runImport = vi.fn(async () => {
      attempts += 1;
      if (attempts < 3) {
        throw new KalshiHistoricalImporterError(
          "Kalshi historical API error (429)",
          429,
          undefined,
          1500,
        );
      }

      return { ok: true };
    });

    const result = await runImportWithRateLimitRetry({
      runImport,
      rateLimit: {
        requestDelayMs: 0,
        maxRetries: 5,
        retryBaseDelayMs: 2000,
      },
      sleep,
    });

    expect(result).toEqual({ result: { ok: true }, retryCount: 2, rateLimited: true });
    expect(runImport).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledWith(1500);
  });

  it("fails after exhausting retries", async () => {
    const runImport = vi.fn(async () => {
      throw new KalshiHistoricalImporterError("Kalshi historical API error (429)", 429);
    });

    await expect(
      runImportWithRateLimitRetry({
        runImport,
        rateLimit: {
          requestDelayMs: 0,
          maxRetries: 2,
          retryBaseDelayMs: 1000,
        },
        sleep: async () => undefined,
      }),
    ).rejects.toMatchObject({
      retryCount: 2,
      message: "Kalshi historical API error (429)",
    });

    expect(runImport).toHaveBeenCalledTimes(3);
  });
});
