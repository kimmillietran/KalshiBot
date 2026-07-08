/**
 * Derives Kalshi event ticker from a KXBTC15M market ticker by stripping the
 * final strike-offset suffix (e.g. `-45`, `-00`, `-15`, `-30`).
 *
 * Example: `KXBTC15M-26MAY081945-45` → `KXBTC15M-26MAY081945`
 */
export function resolveEventTickerFromMarketTicker(
  marketTicker: string,
): string | null {
  const trimmed = marketTicker.trim();
  if (!trimmed) {
    return null;
  }

  const lastDash = trimmed.lastIndexOf("-");
  if (lastDash <= 0) {
    return null;
  }

  const suffix = trimmed.slice(lastDash + 1);
  if (!/^\d{2}$/.test(suffix)) {
    return null;
  }

  const eventTicker = trimmed.slice(0, lastDash);
  return eventTicker.length > 0 ? eventTicker : null;
}
