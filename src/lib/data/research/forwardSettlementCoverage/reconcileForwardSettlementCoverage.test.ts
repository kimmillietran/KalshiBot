import { describe, expect, it } from "vitest";

import {
  classifyBackfillErrorCategory,
  isBackfillErrorRetryable,
} from "./reconcileForwardSettlementCoverage";

describe("reconcileForwardSettlementCoverage", () => {
  it("classifies historical 404 failures as kalshi-market-not-found", () => {
    expect(
      classifyBackfillErrorCategory("Kalshi historical API error (404)"),
    ).toBe("kalshi-market-not-found");
  });

  it("treats deterministic 404 categories as non-retryable", () => {
    expect(
      isBackfillErrorRetryable({
        errorMessage: "Kalshi get-rest-market returned 404 for marketTicker",
        errorCategory: "kalshi-market-not-found",
      }),
    ).toBe(false);
  });

  it("allows retry for transient settlement request failures", () => {
    expect(
      isBackfillErrorRetryable({
        errorMessage: "Kalshi historical API error (503)",
        errorCategory: "kalshi-settlement-request-failed",
      }),
    ).toBe(true);
  });

  it("allows retry for not-yet-settled markets", () => {
    expect(
      isBackfillErrorRetryable({
        errorMessage: "Kalshi market KXBTC15M-26JUL111200-00 is not settled (status=closed)",
        errorCategory: "market-not-settled",
      }),
    ).toBe(true);
  });
});
