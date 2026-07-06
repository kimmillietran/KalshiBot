/** Converts a YYYY-MM calendar month into inclusive ISO discovery sampling bounds. */
export function calendarMonthToDiscoverySamplingWindow(calendarMonth: string): {
  after: string;
  before: string;
} {
  const [yearText, monthText] = calendarMonth.split("-");
  const year = Number(yearText);
  const month = Number(monthText);

  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    throw new Error(`Invalid calendar month: ${calendarMonth}`);
  }

  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  return {
    after: start.toISOString(),
    before: end.toISOString(),
  };
}

/** Returns true when a market open time falls within an ISO sampling window. */
export function marketOpenTimeWithinSamplingWindow(
  openTime: string | null,
  sampling: { after: string; before: string },
): boolean {
  if (!openTime) {
    return true;
  }

  const openMs = Date.parse(openTime);
  const afterMs = Date.parse(sampling.after);
  const beforeMs = Date.parse(sampling.before);

  if (!Number.isFinite(openMs) || !Number.isFinite(afterMs) || !Number.isFinite(beforeMs)) {
    return true;
  }

  return openMs >= afterMs && openMs <= beforeMs;
}
