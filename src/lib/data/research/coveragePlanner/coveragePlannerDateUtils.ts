/** Returns YYYY-MM for a UTC timestamp. */
export function toCalendarMonthUtc(timestampMs: number): string {
  const date = new Date(timestampMs);
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${date.getUTCFullYear()}-${month}`;
}

/** Returns YYYY-MM-DD for a UTC timestamp. */
export function toTradingDayUtc(timestampMs: number): string {
  return new Date(timestampMs).toISOString().slice(0, 10);
}

function parseTimestamp(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Lists inclusive calendar months between two ISO timestamps. */
export function calendarMonthsBetween(startIso: string, endIso: string): string[] {
  const startMs = parseTimestamp(startIso);
  const endMs = parseTimestamp(endIso);
  if (startMs === null || endMs === null) {
    return [];
  }

  const start = new Date(Math.min(startMs, endMs));
  const end = new Date(Math.max(startMs, endMs));
  const months: string[] = [];

  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const endMonth = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1);

  while (cursor.getTime() <= endMonth) {
    months.push(toCalendarMonthUtc(cursor.getTime()));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return months;
}

/** Lists inclusive UTC trading days between two ISO timestamps. */
export function tradingDaysBetween(startIso: string, endIso: string): string[] {
  const startMs = parseTimestamp(startIso);
  const endMs = parseTimestamp(endIso);
  if (startMs === null || endMs === null) {
    return [];
  }

  const days: string[] = [];
  const cursor = new Date(Math.min(startMs, endMs));
  cursor.setUTCHours(0, 0, 0, 0);
  const end = new Date(Math.max(startMs, endMs));
  end.setUTCHours(0, 0, 0, 0);

  while (cursor.getTime() <= end.getTime()) {
    days.push(toTradingDayUtc(cursor.getTime()));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return days;
}

/** Lists every month between earliest and latest inclusive. */
export function enumerateMonthRange(
  earliestMonth: string,
  latestMonth: string,
): string[] {
  const [startYear, startMonth] = earliestMonth.split("-").map(Number);
  const [endYear, endMonth] = latestMonth.split("-").map(Number);
  if (
    startYear === undefined
    || startMonth === undefined
    || endYear === undefined
    || endMonth === undefined
  ) {
    return [];
  }

  const months: string[] = [];
  let year = startYear;
  let month = startMonth;

  while (year < endYear || (year === endYear && month <= endMonth)) {
    months.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return months;
}

export function quarterLabel(month: string): string {
  const [yearText, monthText] = month.split("-");
  const monthNumber = Number(monthText);
  const quarter = Math.floor((monthNumber - 1) / 3) + 1;
  return `${yearText}-Q${quarter}`;
}

const CALENDAR_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Validates and returns a YYYY-MM calendar month string. */
export function parseCalendarMonth(value: string, label = "calendar month"): string {
  const trimmed = value.trim();
  if (!CALENDAR_MONTH_PATTERN.test(trimmed)) {
    throw new Error(`Invalid ${label} "${value}". Expected YYYY-MM.`);
  }

  return trimmed;
}

/** Returns the earlier of two YYYY-MM calendar months. */
export function minCalendarMonth(left: string, right: string): string {
  return left <= right ? left : right;
}
