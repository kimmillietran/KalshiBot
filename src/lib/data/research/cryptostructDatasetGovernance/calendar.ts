/**
 * Deterministic Kalshi Thursday maintenance vs M16 18:00–22:00 UTC population.
 * Maintenance: Thursday 03:00–05:00 America/New_York (ET).
 * Does NOT open market outcomes.
 */

export const KALSHI_MAINTENANCE_ET = {
  weekday: 4 as const, // Thursday (UTC weekday of noon ET approximation below)
  startHourEt: 3,
  endHourEt: 5,
} as const;

export const M16_ER_GOVERNED_UTC = {
  startHour: 18,
  endHour: 22,
} as const;

/** Provider complete-recording cutoff (inclusive). */
export const CRYPTOSTRUCT_COMPLETE_RECORDING_FROM_UTC = "2026-08-14" as const;

/**
 * Convert a UTC calendar date's Thursday 03:00–05:00 ET window to UTC hours.
 * Uses fixed US DST rules (2nd Sunday March → 1st Sunday November).
 */
export function isUsEasternDaylightTime(utcDate: string): boolean {
  const [y, m, d] = utcDate.split("-").map(Number) as [number, number, number];
  const marchSecondSunday = nthWeekdayOfMonth(y, 3, 0, 2);
  const novFirstSunday = nthWeekdayOfMonth(y, 11, 0, 1);
  const key = y * 10_000 + m * 100 + d;
  const start = y * 10_000 + 3 * 100 + marchSecondSunday;
  const end = y * 10_000 + 11 * 100 + novFirstSunday;
  return key >= start && key < end;
}

function nthWeekdayOfMonth(
  year: number,
  month1to12: number,
  weekday: number,
  n: number,
): number {
  // weekday: 0=Sun ... 6=Sat
  const first = new Date(Date.UTC(year, month1to12 - 1, 1));
  const firstWd = first.getUTCDay();
  let day = 1 + ((weekday - firstWd + 7) % 7) + (n - 1) * 7;
  return day;
}

export function thursdayMaintenanceUtcHours(utcDate: string): {
  startHourUtc: number;
  endHourUtc: number;
} {
  const edt = isUsEasternDaylightTime(utcDate);
  // ET = UTC-4 (EDT) or UTC-5 (EST)
  const offset = edt ? 4 : 5;
  return {
    startHourUtc: KALSHI_MAINTENANCE_ET.startHourEt + offset,
    endHourUtc: KALSHI_MAINTENANCE_ET.endHourEt + offset,
  };
}

export function utcDateWeekday(utcDate: string): number {
  const [y, m, d] = utcDate.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun ... 4=Thu
}

export function isThursdayUtcDate(utcDate: string): boolean {
  return utcDateWeekday(utcDate) === 4;
}

/**
 * Whether Kalshi Thursday ET maintenance overlaps the M16-ER 18–22Z window
 * on this UTC date. Under EDT: 07–09Z; under EST: 08–10Z — neither overlaps 18–22Z.
 */
export function maintenanceOverlapsM16ErGovernedWindow(utcDate: string): boolean {
  if (!isThursdayUtcDate(utcDate)) return false;
  const { startHourUtc, endHourUtc } = thursdayMaintenanceUtcHours(utcDate);
  const g0 = M16_ER_GOVERNED_UTC.startHour;
  const g1 = M16_ER_GOVERNED_UTC.endHour;
  return startHourUtc < g1 && endHourUtc > g0;
}

export function enumerateUtcDatesInclusive(
  startUtcDate: string,
  endUtcDate: string,
): string[] {
  const out: string[] = [];
  const [ys, ms, ds] = startUtcDate.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const [ye, me, de] = endUtcDate.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  let t = Date.UTC(ys, ms - 1, ds);
  const end = Date.UTC(ye, me - 1, de);
  while (t <= end) {
    const d = new Date(t);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    out.push(`${yyyy}-${mm}-${dd}`);
    t += 86_400_000;
  }
  return out;
}
