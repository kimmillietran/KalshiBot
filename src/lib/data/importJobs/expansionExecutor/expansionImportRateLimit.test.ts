import { describe, expect, it, vi } from "vitest";

import { KalshiHistoricalImporterError } from "@/lib/data/importers/kalshi/KalshiHistoricalImporter";

import {
  buildExpansionRateLimitDiagnostics,
  computeExpansionRateLimitDelayMs,
  createExpansionImportRateLimitState,
  evaluateExpansionRateLimitCascadeAbort,
  EXPANSION_RATE_LIMIT_CASCADE_ABORT_THRESHOLD,
  formatExpansionRateLimitAbortWarning,
  isExpansionImportRateLimitError,
  isExpansionImportRateLimitMessage,
  recordExpansionPostRetryRateLimitFailure,
  resetExpansionRateLimitSuccessStreak,
  runExpansionImportWithRateLimitRetry,
} from "./expansionImportRateLimit";

const RATE_LIMIT_ERROR = new KalshiHistoricalImporterError(
  "Kalshi historical API error (429)",
  429,
);

describe("expansionImportRateLimit", () => {
  it("classifies 429 errors separately from compatibility and network failures", () => {
    expect(isExpansionImportRateLimitError(RATE_LIMIT_ERROR)).toBe(true);
    expect(
      isExpansionImportRateLimitMessage("Kalshi historical API error (429)"),
    ).toBe(true);
    expect(
      isExpansionImportRateLimitMessage(
        "Kalshi historical market response missing required fields: expiration_value.",
      ),
    ).toBe(false);
    expect(isExpansionImportRateLimitMessage("network timeout")).toBe(false);
  });

  it("backs off once on a single 429 and eventually succeeds", async () => {
    const state = createExpansionImportRateLimitState();
    const sleep = vi.fn(async () => {});
    let attempts = 0;

    const result = await runExpansionImportWithRateLimitRetry({
      runImport: async () => {
        attempts += 1;
        if (attempts === 1) {
          throw RATE_LIMIT_ERROR;
        }

        return { ok: true };
      },
      marketTicker: "KXBTC15M-26JAN151215-00",
      rateLimit: {
        rateLimitBackoffMs: 1000,
        maxRateLimitRetries: 2,
      },
      state,
      sleep,
    });

    expect(result).toEqual({ ok: true });
    expect(attempts).toBe(2);
    expect(sleep).toHaveBeenCalledWith(1000);
    expect(state.rateLimitedCount).toBe(1);
    expect(state.retryCount).toBe(1);
    expect(state.backoffDurationMs).toBe(1000);
    expect(state.firstRateLimitedTicker).toBe("KXBTC15M-26JAN151215-00");
  });

  it("honors Retry-After when present", async () => {
    const state = createExpansionImportRateLimitState();
    const sleep = vi.fn(async () => {});
    let attempts = 0;

    await runExpansionImportWithRateLimitRetry({
      runImport: async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new KalshiHistoricalImporterError(
            "Kalshi historical API error (429)",
            429,
            undefined,
            3500,
          );
        }

        return { ok: true };
      },
      marketTicker: "KXBTC15M-26JAN151215-00",
      rateLimit: {
        rateLimitBackoffMs: 1000,
        maxRateLimitRetries: 1,
      },
      state,
      sleep,
    });

    expect(sleep).toHaveBeenCalledWith(3500);
    expect(state.backoffDurationMs).toBe(3500);
  });

  it("aborts repeated 429 cascades after the threshold is exceeded", () => {
    const state = createExpansionImportRateLimitState();
    state.firstRateLimitedTicker = "KXBTC15M-TICKER-0";
    state.rateLimitedCount = 10;
    state.retryCount = 10;
    state.backoffDurationMs = 25000;

    for (let index = 0; index < EXPANSION_RATE_LIMIT_CASCADE_ABORT_THRESHOLD; index += 1) {
      recordExpansionPostRetryRateLimitFailure(state);
    }

    const diagnostics = evaluateExpansionRateLimitCascadeAbort(state);
    expect(diagnostics).not.toBeNull();
    expect(diagnostics?.firstRateLimitedTicker).toBe("KXBTC15M-TICKER-0");
    expect(formatExpansionRateLimitAbortWarning(diagnostics!, EXPANSION_RATE_LIMIT_CASCADE_ABORT_THRESHOLD)).toContain(
      "consecutive rate-limited market failures",
    );
  });

  it("resets the consecutive 429 streak after a successful import", () => {
    const state = createExpansionImportRateLimitState();
    recordExpansionPostRetryRateLimitFailure(state);
    recordExpansionPostRetryRateLimitFailure(state);

    resetExpansionRateLimitSuccessStreak(state);

    expect(state.consecutivePostRetryRateLimitFailures).toBe(0);
    expect(evaluateExpansionRateLimitCascadeAbort(state)).toBeNull();
  });

  it("builds summary diagnostics with recommended next action", () => {
    const state = createExpansionImportRateLimitState();
    state.rateLimitedCount = 2;
    state.retryCount = 2;
    state.backoffDurationMs = 6000;
    state.firstRateLimitedTicker = "KXBTC15M-26JAN151215-00";

    expect(buildExpansionRateLimitDiagnostics(state)).toEqual({
      rateLimitedCount: 2,
      backoffDurationMs: 6000,
      retryCount: 2,
      firstRateLimitedTicker: "KXBTC15M-26JAN151215-00",
      recommendedNextAction: expect.stringContaining("--rate-limit-backoff-ms"),
    });
  });

  it("uses linear backoff when Retry-After is absent", () => {
    expect(
      computeExpansionRateLimitDelayMs({
        attempt: 1,
        rateLimitBackoffMs: 2000,
      }),
    ).toBe(4000);
  });
});
