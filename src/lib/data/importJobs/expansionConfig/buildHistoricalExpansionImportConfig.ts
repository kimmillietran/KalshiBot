import { DEFAULT_KXBTC15M_SERIES_TICKER } from "@/lib/data/discovery";
import {
  HistoricalBronzeImportBtcInterval,
  HistoricalBronzeImportBtcProvider,
  HistoricalBronzeImportKalshiSource,
  HistoricalBronzeImportOutputFormat,
} from "@/lib/data/importJobs/config";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import { isWindowFullyCovered, mergeCoverageWindows } from "./collectCoveredWindows";
import type {
  BuildHistoricalExpansionImportConfigInput,
  HistoricalCoveragePlanRecommendation,
  HistoricalExpansionImportConfig,
  HistoricalExpansionImportJob,
} from "./expansionConfigTypes";

const DEFAULT_KALSHI_CONFIG = {
  marketSource: HistoricalBronzeImportKalshiSource.KALSHI_REST,
  candleSource: HistoricalBronzeImportKalshiSource.KALSHI_CANDLES,
  settlementSource: HistoricalBronzeImportKalshiSource.KALSHI_REST,
} as const;

const DEFAULT_BTC_CONFIG = {
  provider: HistoricalBronzeImportBtcProvider.COINBASE_SPOT,
  symbol: "BTC-USD",
  interval: HistoricalBronzeImportBtcInterval.ONE_MINUTE,
} as const;

const DEFAULT_OUTPUT_CONFIG = {
  format: HistoricalBronzeImportOutputFormat.JSON,
  includeValidationReport: true,
  includeFixture: false,
} as const;

function normalizeWindowBoundary(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return value.trim();
  }

  return new Date(parsed).toISOString();
}

function buildJobId(
  seriesTicker: string,
  windowStart: string,
  windowEnd: string,
): string {
  const startToken = windowStart.slice(0, 10).replaceAll("-", "");
  const endToken = windowEnd.slice(0, 10).replaceAll("-", "");
  return `expansion-${seriesTicker}-${startToken}-${endToken}`;
}

function compareRecommendations(
  left: HistoricalCoveragePlanRecommendation,
  right: HistoricalCoveragePlanRecommendation,
): number {
  const byPriority = left.priority - right.priority;
  if (byPriority !== 0) {
    return byPriority;
  }

  const byStart = left.windowStart.localeCompare(right.windowStart);
  if (byStart !== 0) {
    return byStart;
  }

  return left.windowEnd.localeCompare(right.windowEnd);
}

function buildScheduledJob(
  recommendation: HistoricalCoveragePlanRecommendation,
): HistoricalExpansionImportJob {
  const seriesTicker = recommendation.seriesTicker?.trim() || DEFAULT_KXBTC15M_SERIES_TICKER;
  const windowStart = normalizeWindowBoundary(recommendation.windowStart);
  const windowEnd = normalizeWindowBoundary(recommendation.windowEnd);

  return {
    jobId: buildJobId(seriesTicker, windowStart, windowEnd),
    priority: recommendation.priority,
    status: "scheduled",
    seriesTicker,
    windowStart,
    windowEnd,
    estimatedMarketCount: recommendation.estimatedMarketCount ?? null,
    reason: recommendation.reason ?? null,
    expectedResearchBenefit: recommendation.expectedResearchBenefit ?? null,
    skipReason: null,
    discovery: {
      seriesTicker,
      sampling: {
        afterDate: windowStart,
        beforeDate: windowEnd,
      },
    },
    importDefaults: {
      kalshi: DEFAULT_KALSHI_CONFIG,
      btc: DEFAULT_BTC_CONFIG,
      output: DEFAULT_OUTPUT_CONFIG,
    },
  };
}

function buildSkippedJob(
  recommendation: HistoricalCoveragePlanRecommendation,
  skipReason: string,
): HistoricalExpansionImportJob {
  return {
    ...buildScheduledJob(recommendation),
    status: "skipped",
    skipReason,
  };
}

/** Converts M9.1 coverage recommendations into concrete expansion import jobs. */
export function buildHistoricalExpansionImportConfig(
  input: BuildHistoricalExpansionImportConfigInput,
): HistoricalExpansionImportConfig {
  const coveredWindows = mergeCoverageWindows(
    input.plan.coverageSnapshot?.coveredWindows ?? [],
    input.existingCoveredWindows ?? [],
  );

  const sortedRecommendations = [...input.plan.recommendations].sort(compareRecommendations);
  const jobs: HistoricalExpansionImportJob[] = [];

  for (const recommendation of sortedRecommendations) {
    const candidate = {
      windowStart: normalizeWindowBoundary(recommendation.windowStart),
      windowEnd: normalizeWindowBoundary(recommendation.windowEnd),
    };

    if (isWindowFullyCovered(candidate, coveredWindows)) {
      jobs.push(
        buildSkippedJob(
          recommendation,
          `Window ${candidate.windowStart} → ${candidate.windowEnd} is already covered`,
        ),
      );
      continue;
    }

    jobs.push(buildScheduledJob(recommendation));
  }

  const scheduledJobs = jobs.filter((job) => job.status === "scheduled");

  return {
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    inputPath: input.inputPath,
    dryRun: input.dryRun,
    importConfigsDir: input.importConfigsDir,
    summary: {
      recommendationCount: sortedRecommendations.length,
      scheduledJobCount: scheduledJobs.length,
      skippedJobCount: jobs.length - scheduledJobs.length,
    },
    jobs,
  };
}

export function serializeHistoricalExpansionImportConfig(
  config: HistoricalExpansionImportConfig,
): string {
  return stableStringify(config);
}
