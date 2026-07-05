import type { EstimatedSupportLevel, RecommendationImportabilityEstimate } from "./importabilityTypes";
import {
  calendarMonthWithinWindow,
  parseExpansionMarketCalendarMonth,
} from "./parseExpansionMarketCalendarMonth";
import type { ParsedExpansionImportMarketRecord } from "./importabilityTypes";
import {
  classifyExpansionImportMarketOutcome,
  isAttemptedOutcomeCategory,
} from "./classifyExpansionImportMarketOutcome";

function deriveSupportLevel(input: {
  attemptedCount: number;
  successfulImports: number;
  unsupportedMarkets: number;
  estimatedUnsupportedRate: number;
}): EstimatedSupportLevel {
  if (input.attemptedCount === 0) {
    return "medium";
  }

  const successRate = input.successfulImports / input.attemptedCount;

  if (
    input.estimatedUnsupportedRate >= 0.5
    || (input.attemptedCount >= 3 && successRate === 0 && input.unsupportedMarkets > 0)
  ) {
    return "low";
  }

  if (
    successRate >= 0.5
    && input.estimatedUnsupportedRate < 0.25
    && input.successfulImports > 0
  ) {
    return "high";
  }

  if (
    input.successfulImports > 0
    && input.unsupportedMarkets === 0
    && input.estimatedUnsupportedRate === 0
  ) {
    return "high";
  }

  return "medium";
}

function collectWindowMarkets(
  markets: readonly ParsedExpansionImportMarketRecord[],
  input: {
    seriesTicker: string;
    startMonth: string;
    endMonth: string;
  },
): ParsedExpansionImportMarketRecord[] {
  return markets.filter((market) => {
    if (market.seriesTicker !== input.seriesTicker) {
      return false;
    }

    if (!market.calendarMonth) {
      return false;
    }

    return calendarMonthWithinWindow(
      market.calendarMonth,
      input.startMonth,
      input.endMonth,
    );
  });
}

/** Estimates importability for a recommended coverage window from prior expansion attempts. */
export function estimateRecommendationImportability(
  markets: readonly ParsedExpansionImportMarketRecord[],
  input: {
    seriesTicker: string;
    startMonth: string;
    endMonth: string;
  },
): RecommendationImportabilityEstimate {
  const windowMarkets = collectWindowMarkets(markets, input);
  let attemptedCount = 0;
  let successfulImports = 0;
  let compatibilityFailures = 0;
  let unsupportedMarkets = 0;

  for (const market of windowMarkets) {
    if (!isAttemptedOutcomeCategory(market.outcomeCategory)) {
      continue;
    }

    attemptedCount += 1;

    if (market.outcomeCategory === "successful-import") {
      successfulImports += 1;
      continue;
    }

    if (market.outcomeCategory === "compatibility-failure") {
      compatibilityFailures += 1;
      unsupportedMarkets += 1;
      continue;
    }

    if (market.outcomeCategory === "unsupported-market") {
      unsupportedMarkets += 1;
    }
  }

  const estimatedUnsupportedRate =
    attemptedCount === 0 ? 0 : unsupportedMarkets / attemptedCount;

  return {
    estimatedSupportLevel: deriveSupportLevel({
      attemptedCount,
      successfulImports,
      unsupportedMarkets,
      estimatedUnsupportedRate,
    }),
    estimatedUnsupportedRate,
    attemptedCount,
    successfulImports,
    compatibilityFailures,
    unsupportedMarkets,
  };
}

/** Parses raw market records from an expansion summary into planner importability records. */
export function normalizeExpansionImportMarketRecords(
  markets: readonly {
    marketTicker: string;
    seriesTicker: string;
    status: "planned" | "imported" | "skipped" | "failed";
    errorMessage?: string | null;
    skipReason?: string | null;
  }[],
): ParsedExpansionImportMarketRecord[] {
  return markets.map((market) => {
    const errorMessage = market.errorMessage ?? null;
    const skipReason = market.skipReason ?? null;
    const outcomeCategory = classifyExpansionImportMarketOutcome({
      status: market.status,
      errorMessage,
      skipReason,
    });

    return {
      marketTicker: market.marketTicker,
      seriesTicker: market.seriesTicker,
      status: market.status,
      errorMessage,
      skipReason,
      calendarMonth: parseExpansionMarketCalendarMonth(market.marketTicker),
      outcomeCategory,
    };
  });
}
