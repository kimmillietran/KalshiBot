import {
  isAttemptedOutcomeCategory,
  isUnsupportedOutcomeCategory,
} from "./classifyExpansionImportMarketOutcome";
import { estimateRecommendationImportability } from "./estimateRecommendationImportability";
import type {
  ExpansionImportSummaryDocument,
  HistoricalImportabilityProfile,
  ParsedExpansionImportMarketRecord,
  WindowImportabilityStats,
} from "./importabilityTypes";

function flattenMarkets(
  summaries: readonly ExpansionImportSummaryDocument[],
): ParsedExpansionImportMarketRecord[] {
  const markets: ParsedExpansionImportMarketRecord[] = [];

  for (const summary of summaries) {
    for (const job of summary.jobs) {
      markets.push(...job.markets);
    }
  }

  return markets;
}

function buildWindowStats(
  markets: readonly ParsedExpansionImportMarketRecord[],
): WindowImportabilityStats[] {
  const windows = new Map<string, WindowImportabilityStats>();

  for (const market of markets) {
    if (!market.calendarMonth || !isAttemptedOutcomeCategory(market.outcomeCategory)) {
      continue;
    }

    const windowKey = `${market.seriesTicker}:${market.calendarMonth}`;
    const existing = windows.get(windowKey) ?? {
      windowKey,
      seriesTicker: market.seriesTicker,
      startMonth: market.calendarMonth,
      endMonth: market.calendarMonth,
      attemptedCount: 0,
      successfulImports: 0,
      compatibilityFailures: 0,
      unsupportedMarkets: 0,
      historicalSuccessRate: null,
      estimatedUnsupportedRate: 0,
      estimatedSupportLevel: "medium" as const,
    };

    existing.attemptedCount += 1;
    if (market.outcomeCategory === "successful-import") {
      existing.successfulImports += 1;
    } else if (market.outcomeCategory === "compatibility-failure") {
      existing.compatibilityFailures += 1;
      existing.unsupportedMarkets += 1;
    } else if (isUnsupportedOutcomeCategory(market.outcomeCategory)) {
      existing.unsupportedMarkets += 1;
    }

    windows.set(windowKey, existing);
  }

  return [...windows.values()]
    .map((window) => {
      const estimate = estimateRecommendationImportability(markets, {
        seriesTicker: window.seriesTicker,
        startMonth: window.startMonth,
        endMonth: window.endMonth,
      });

      return {
        ...window,
        historicalSuccessRate:
          window.attemptedCount === 0
            ? null
            : window.successfulImports / window.attemptedCount,
        estimatedUnsupportedRate: estimate.estimatedUnsupportedRate,
        estimatedSupportLevel: estimate.estimatedSupportLevel,
      };
    })
    .sort((left, right) => left.windowKey.localeCompare(right.windowKey));
}

/** Builds aggregate importability statistics from prior expansion import summaries. */
export function createEmptyHistoricalImportabilityProfile(
  summaryPath: string | null = null,
): HistoricalImportabilityProfile {
  return {
    summaryPath,
    summaryPresent: false,
    summariesLoaded: 0,
    totalAttempts: 0,
    successfulImports: 0,
    compatibilityFailures: 0,
    unsupportedMarkets: 0,
    historicalSuccessRate: null,
    windows: [],
  };
}

/** Builds aggregate importability statistics from prior expansion import summaries. */
export function buildHistoricalImportabilityProfile(input: {
  summaryPath: string | null;
  summaries: readonly ExpansionImportSummaryDocument[];
}): HistoricalImportabilityProfile {
  const markets = flattenMarkets(input.summaries);
  let totalAttempts = 0;
  let successfulImports = 0;
  let compatibilityFailures = 0;
  let unsupportedMarkets = 0;

  for (const market of markets) {
    if (!isAttemptedOutcomeCategory(market.outcomeCategory)) {
      continue;
    }

    totalAttempts += 1;
    if (market.outcomeCategory === "successful-import") {
      successfulImports += 1;
    } else if (market.outcomeCategory === "compatibility-failure") {
      compatibilityFailures += 1;
      unsupportedMarkets += 1;
    } else if (isUnsupportedOutcomeCategory(market.outcomeCategory)) {
      unsupportedMarkets += 1;
    }
  }

  return {
    summaryPath: input.summaryPath,
    summaryPresent: input.summaries.length > 0,
    summariesLoaded: input.summaries.length,
    totalAttempts,
    successfulImports,
    compatibilityFailures,
    unsupportedMarkets,
    historicalSuccessRate:
      totalAttempts === 0 ? null : successfulImports / totalAttempts,
    windows: buildWindowStats(markets),
  };
}

export function countSupportedWindows(
  profile: HistoricalImportabilityProfile,
): number {
  return profile.windows.filter((window) => window.estimatedSupportLevel === "high").length;
}

export function countUnsupportedWindows(
  profile: HistoricalImportabilityProfile,
): number {
  return profile.windows.filter((window) => window.estimatedSupportLevel === "low").length;
}
