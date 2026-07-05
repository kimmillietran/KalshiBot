const KALSHI_TICKER_MONTH_PATTERN =
  /-(\d{2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(\d{2})/i;

const MONTH_CODE_TO_NUMBER: Record<string, string> = {
  JAN: "01",
  FEB: "02",
  MAR: "03",
  APR: "04",
  MAY: "05",
  JUN: "06",
  JUL: "07",
  AUG: "08",
  SEP: "09",
  OCT: "10",
  NOV: "11",
  DEC: "12",
};

/** Parses a Kalshi historical market ticker into a YYYY-MM calendar month when possible. */
export function parseExpansionMarketCalendarMonth(marketTicker: string): string | null {
  const match = marketTicker.match(KALSHI_TICKER_MONTH_PATTERN);
  if (!match) {
    return null;
  }

  const yearSuffix = Number(match[1]);
  const monthCode = match[2]?.toUpperCase();
  const monthNumber = monthCode ? MONTH_CODE_TO_NUMBER[monthCode] : undefined;

  if (!Number.isFinite(yearSuffix) || !monthNumber) {
    return null;
  }

  return `20${String(yearSuffix).padStart(2, "0")}-${monthNumber}`;
}

/** Returns true when a calendar month falls within an inclusive YYYY-MM window. */
export function calendarMonthWithinWindow(
  month: string,
  startMonth: string,
  endMonth: string,
): boolean {
  return month >= startMonth && month <= endMonth;
}
