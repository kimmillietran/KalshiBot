import { isUtcIsoTimestamp } from "@/lib/data/timestamps";

import {
  MarketDiscoveryErrorCode,
  type DiscoveredMarket,
  type MarketDiscoveryValidationIssue,
  type MarketDiscoveryValidationResult,
} from "./discoveryTypes";
import { SUPPORTED_DISCOVERY_MARKET_STATUSES } from "./normalizeDiscoveredMarket";

function createIssue(
  errorCode: MarketDiscoveryValidationIssue["errorCode"],
  severity: MarketDiscoveryValidationIssue["severity"],
  message: string,
  marketTicker?: string,
): MarketDiscoveryValidationIssue {
  return marketTicker
    ? { errorCode, severity, message, marketTicker }
    : { errorCode, severity, message };
}

function validateTimestampField(
  market: DiscoveredMarket,
  label: string,
  value: string | null,
  issues: MarketDiscoveryValidationIssue[],
): void {
  if (value === null) {
    return;
  }

  if (!isUtcIsoTimestamp(value)) {
    issues.push(
      createIssue(
        MarketDiscoveryErrorCode.MALFORMED_TIMESTAMP,
        "error",
        `${label} is not a canonical UTC ISO timestamp`,
        market.marketTicker,
      ),
    );
  }
}

/** Validates normalized discovery output for batch-config readiness. */
export function validateMarketDiscoveryResult(
  markets: readonly DiscoveredMarket[],
): MarketDiscoveryValidationResult {
  const issues: MarketDiscoveryValidationIssue[] = [];

  if (markets.length === 0) {
    issues.push(
      createIssue(
        MarketDiscoveryErrorCode.EMPTY_RESULTS,
        "error",
        "Discovery returned no markets",
      ),
    );
  }

  const seenTickers = new Map<string, DiscoveredMarket>();

  for (const market of markets) {
    if (!market.marketTicker.trim()) {
      issues.push(
        createIssue(
          MarketDiscoveryErrorCode.MISSING_MARKET_TICKER,
          "error",
          "Discovered market is missing marketTicker",
        ),
      );
      continue;
    }

    const existing = seenTickers.get(market.marketTicker);
    if (existing !== undefined) {
      issues.push(
        createIssue(
          MarketDiscoveryErrorCode.DUPLICATE_MARKET_TICKER,
          "error",
          `Duplicate marketTicker: ${market.marketTicker}`,
          market.marketTicker,
        ),
      );
    } else {
      seenTickers.set(market.marketTicker, market);
    }

    if (!SUPPORTED_DISCOVERY_MARKET_STATUSES.has(market.status)) {
      issues.push(
        createIssue(
          MarketDiscoveryErrorCode.UNSUPPORTED_STATUS,
          "error",
          `Unsupported market status: ${market.status}`,
          market.marketTicker,
        ),
      );
    }

    validateTimestampField(market, "openTime", market.openTime, issues);
    validateTimestampField(market, "closeTime", market.closeTime, issues);
    validateTimestampField(market, "settlementTime", market.settlementTime, issues);
  }

  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
