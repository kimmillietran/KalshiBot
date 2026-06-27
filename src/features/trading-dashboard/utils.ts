import { formatUsd } from "@/lib/utils/format";

import { isRawKalshiTicker } from "./tickerVisibility";

type FormatMarketContractQuestionOptions = {
  noMarket?: boolean;
};

/**
 * Contract-style market header — describes the Kalshi settlement question
 * instead of mirroring Kalshi's short title verbatim.
 */
export function formatMarketContractQuestion(
  targetPrice: number,
  expirationFormatted: string,
  options: FormatMarketContractQuestionOptions = {},
): string {
  if (options.noMarket) {
    return "No active Kalshi BTC contract";
  }

  if (expirationFormatted === "—") {
    return `Will BTC settle above ${formatUsd(targetPrice)}?`;
  }

  return `Will BTC settle above ${formatUsd(targetPrice)} at ${expirationFormatted}?`;
}

type FormatMarketSubtitleOptions = {
  noMarket?: boolean;
};

/** User-friendly contract subtitle — never the raw Kalshi ticker. */
export function formatMarketSubtitle(
  _ticker: string | null | undefined,
  options: FormatMarketSubtitleOptions = {},
): string {
  if (options.noMarket || !_ticker || _ticker === "—") {
    return "BTC 15m · No active contract";
  }

  return "BTC 15m · Live Kalshi contract";
}

/** Alias for subtitle copy in headers and tooltips. */
export function formatMarketDisplayName(
  ticker: string | null | undefined,
  options: FormatMarketSubtitleOptions = {},
): string {
  return formatMarketSubtitle(ticker, options);
}

/** Tooltip-only contract ID for debugging — not for visible UI copy. */
export function formatMarketContractIdTooltip(
  ticker: string | null | undefined,
): string | undefined {
  if (!ticker || ticker === "—" || !isRawKalshiTicker(ticker)) {
    return undefined;
  }

  return `Contract ID: ${ticker}`;
}

export { isRawKalshiTicker };
