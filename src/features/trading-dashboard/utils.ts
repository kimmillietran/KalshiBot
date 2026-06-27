import { formatUsd } from "@/lib/utils/format";

/** Kalshi technical tickers begin with KXBTC — hide from prominent UI. */
const RAW_KALSHI_TICKER_PATTERN = /^KXBTC/i;

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
  if (options.noMarket || !_ticker) {
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

export function isRawKalshiTicker(ticker: string | null | undefined): boolean {
  if (!ticker) {
    return false;
  }

  return RAW_KALSHI_TICKER_PATTERN.test(ticker);
}
