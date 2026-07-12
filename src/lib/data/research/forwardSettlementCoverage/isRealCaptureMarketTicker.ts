const MOCK_TICKER_PATTERN = /MOCK/i;
const INVALID_TICKER_PATTERN = /[<>:"/\\|?*\u0000-\u001f]/;
const REAL_MARKET_TICKER_PATTERN = /^[A-Z0-9]+-\d{2}[A-Z]{3}\d{4,6}-\d+$/;

/** Returns true when a ticker looks like a real captured Kalshi market. */
export function isRealCaptureMarketTicker(marketTicker: string): boolean {
  const trimmed = marketTicker.trim();
  if (!trimmed || INVALID_TICKER_PATTERN.test(trimmed)) {
    return false;
  }

  if (MOCK_TICKER_PATTERN.test(trimmed)) {
    return false;
  }

  if (trimmed.endsWith("-MOCK") || trimmed.includes("-TEST-")) {
    return false;
  }

  return REAL_MARKET_TICKER_PATTERN.test(trimmed);
}

export function classifyInvalidMarketReason(marketTicker: string): string | null {
  if (!marketTicker.trim()) {
    return "empty market ticker";
  }

  if (MOCK_TICKER_PATTERN.test(marketTicker) || marketTicker.endsWith("-MOCK")) {
    return "mock ticker excluded";
  }

  if (!REAL_MARKET_TICKER_PATTERN.test(marketTicker.trim())) {
    return "malformed market ticker";
  }

  return null;
}
