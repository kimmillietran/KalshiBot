/**
 * Kalshi BTC 15m technical ticker, e.g. KXBTC15M-26JUN270100-00.
 * Intentionally specific — avoids false positives from contract labels like "UP 63".
 */
export const RAW_KALSHI_TICKER_PATTERN = /KXBTC\d+M-\d{2}[A-Z]{3}\d{2,}-\d+/i;

/** Additional leak signatures seen in raw tickers (review regression set). */
export const RAW_TICKER_UI_PATTERNS = [
  RAW_KALSHI_TICKER_PATTERN,
  /KXBTC/i,
  /BTC\d+M-\d{2}[A-Z]{3}/i,
  /\b26JUN\d{2,}/i,
] as const;

/**
 * Returns true when text looks like a raw Kalshi contract ticker (not friendly copy).
 */
export function isRawKalshiTicker(text: string | null | undefined): boolean {
  if (!text) {
    return false;
  }

  return RAW_KALSHI_TICKER_PATTERN.test(text);
}

/**
 * Test helper — collects substrings that match raw ticker patterns in visible text.
 */
export function findRawTickerLeaksInText(text: string): string[] {
  const leaks = new Set<string>();

  for (const pattern of RAW_TICKER_UI_PATTERNS) {
    const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
    const matches = text.match(new RegExp(pattern.source, flags));
    if (matches) {
      for (const match of matches) {
        leaks.add(match);
      }
    }
  }

  return [...leaks];
}

/**
 * Test helper — scans rendered DOM text for raw ticker leaks.
 * Ignores tooltip-only attributes (not included in textContent).
 */
export function findRawTickerLeaksInContainer(container: HTMLElement): string[] {
  return findRawTickerLeaksInText(container.textContent ?? "");
}
