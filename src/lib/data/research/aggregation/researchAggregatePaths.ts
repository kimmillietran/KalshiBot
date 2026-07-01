import { posix } from "node:path";

import {
  ResearchAggregateError,
  ResearchAggregateErrorCode,
} from "./researchAggregateTypes";

export const RESEARCH_OUTPUT_FILENAME = "research-output.json";
export const AGGREGATE_SUMMARY_FILENAME = "aggregate-summary.json";

export const INVALID_PATH_SEGMENT_PATTERN = /[<>:"/\\|?*\u0000-\u001f]/;
export const RESERVED_PATH_SEGMENT_PATTERN = /^(?:\.|\.\.)$/;

export function assertSafePathSegment(
  value: string,
  label: string,
  marketTicker?: string,
): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new ResearchAggregateError(
      `${label} is required`,
      ResearchAggregateErrorCode.INVALID_OUTPUT_SCHEMA,
      marketTicker,
    );
  }

  if (
    INVALID_PATH_SEGMENT_PATTERN.test(trimmed)
    || RESERVED_PATH_SEGMENT_PATTERN.test(trimmed)
  ) {
    throw new ResearchAggregateError(
      `${label} contains invalid path characters`,
      ResearchAggregateErrorCode.INVALID_OUTPUT_SCHEMA,
      marketTicker ?? trimmed,
    );
  }

  return trimmed;
}

export function buildResearchOutputPath(
  resultsRoot: string,
  seriesTicker: string,
  marketTicker: string,
): string {
  const safeSeries = assertSafePathSegment(seriesTicker, "seriesTicker", marketTicker);
  const safeMarket = assertSafePathSegment(marketTicker, "marketTicker", marketTicker);
  return posix.join(
    resultsRoot.replace(/\\/g, "/"),
    safeSeries,
    safeMarket,
    RESEARCH_OUTPUT_FILENAME,
  );
}

export function buildSeriesAggregateOutputPath(
  outputRoot: string,
  seriesTicker: string,
): string {
  const safeSeries = assertSafePathSegment(seriesTicker, "seriesTicker");
  return posix.join(
    outputRoot.replace(/\\/g, "/"),
    safeSeries,
    AGGREGATE_SUMMARY_FILENAME,
  );
}

export function compareMarketSummaries(
  left: { marketTicker: string },
  right: { marketTicker: string },
): number {
  return left.marketTicker.localeCompare(right.marketTicker);
}

export function normalizeRootPath(root: string): string {
  return root.replace(/\\/g, "/").replace(/\/+$/, "");
}

export function buildMarketResultKey(seriesTicker: string, marketTicker: string): string {
  return `${seriesTicker}/${marketTicker}`;
}
