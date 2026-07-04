import { describe, expect, it } from "vitest";

import {
  classifyExpansionImportFailure,
  createExpansionImportCircuitBreakerState,
  evaluateExpansionImportCircuitBreaker,
  EXPANSION_IMPORT_CIRCUIT_BREAKER_THRESHOLD,
  EXPANSION_IMPORT_CIRCUIT_BREAKER_WINDOW,
  formatExpansionImportCircuitBreakerWarning,
  recordExpansionImportCircuitBreakerFailure,
} from "./expansionImportCircuitBreaker";

const COMPATIBILITY_ERROR =
  "Kalshi historical market response missing required fields: expiration_value. Raw response saved to data/debug/kalshi-market-KXBTC15M-25DEC311900-00.json.";

describe("expansionImportCircuitBreaker", () => {
  it("classifies parser compatibility and rate-limit failures", () => {
    expect(classifyExpansionImportFailure(COMPATIBILITY_ERROR)).toBe("import-compatibility");
    expect(classifyExpansionImportFailure("Kalshi historical API error (429)")).toBe(
      "rate-limit",
    );
    expect(classifyExpansionImportFailure("network timeout")).toBe("other");
  });

  it("trips after 90% of the first 50 attempts fail with import-compatibility errors", () => {
    let state = createExpansionImportCircuitBreakerState();

    for (let index = 0; index < EXPANSION_IMPORT_CIRCUIT_BREAKER_WINDOW; index += 1) {
      state = recordExpansionImportCircuitBreakerFailure(
        state,
        `KXBTC15M-TICKER-${index}`,
        COMPATIBILITY_ERROR,
      );
    }

    const trip = evaluateExpansionImportCircuitBreaker(state);
    expect(trip).not.toBeNull();
    expect(trip?.failureClass).toBe("import-compatibility");
    expect(trip?.affectedCount).toBe(EXPANSION_IMPORT_CIRCUIT_BREAKER_WINDOW);
    expect(trip?.failureRate).toBeGreaterThanOrEqual(EXPANSION_IMPORT_CIRCUIT_BREAKER_THRESHOLD);
    expect(trip?.firstFailingTickers[0]).toBe("KXBTC15M-TICKER-0");
    expect(formatExpansionImportCircuitBreakerWarning(trip!)).toContain("circuit breaker");
  });

  it("does not trip when isolated 429 failures dominate the window", () => {
    let state = createExpansionImportCircuitBreakerState();

    for (let index = 0; index < EXPANSION_IMPORT_CIRCUIT_BREAKER_WINDOW; index += 1) {
      const errorMessage = index === 0 ? COMPATIBILITY_ERROR : "Kalshi historical API error (429)";
      state = recordExpansionImportCircuitBreakerFailure(
        state,
        `KXBTC15M-TICKER-${index}`,
        errorMessage,
      );
    }

    expect(evaluateExpansionImportCircuitBreaker(state)).toBeNull();
  });

  it("does not trip before the evaluation window is full", () => {
    let state = createExpansionImportCircuitBreakerState();

    for (let index = 0; index < 10; index += 1) {
      state = recordExpansionImportCircuitBreakerFailure(
        state,
        `KXBTC15M-TICKER-${index}`,
        COMPATIBILITY_ERROR,
      );
    }

    expect(evaluateExpansionImportCircuitBreaker(state)).toBeNull();
  });
});
