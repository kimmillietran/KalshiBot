import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  BLIND_INCIDENCE_RELATIVE_PATH,
  EXCLUDED_MISSING_STRIKE_TICKER,
  FRICTION_MANIFEST_RELATIVE_PATH,
  INCOMPLETE_RECORDS_RELATIVE_PATH,
  KalshiBrtiAccessProbeError,
  type SpentTarget,
} from "./types";

export function selectEarlyMiddleLateDays(eligibleUtcDays: readonly string[]): {
  early: string;
  middle: string;
  late: string;
} {
  const days = [...new Set(eligibleUtcDays)].sort();
  if (days.length < 3) {
    throw new KalshiBrtiAccessProbeError(
      `need at least 3 eligible UTC days; got ${days.length}`,
    );
  }
  return {
    early: days[0]!,
    middle: days[Math.floor((days.length - 1) / 2)]!,
    late: days[days.length - 1]!,
  };
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function loadExcludedMissingStrikeTickers(repoRoot: string): Set<string> {
  const excluded = new Set<string>([EXCLUDED_MISSING_STRIKE_TICKER]);
  const path = join(repoRoot, INCOMPLETE_RECORDS_RELATIVE_PATH);
  try {
    const parsed = readJson(path);
    if (!isRecord(parsed) || !Array.isArray(parsed.records)) {
      return excluded;
    }
    for (const record of parsed.records) {
      if (!isRecord(record)) {
        continue;
      }
      const ticker = record.marketTicker;
      const missing = record.missingOrInvalidFields;
      if (
        typeof ticker === "string"
        && Array.isArray(missing)
        && missing.includes("floorStrike")
      ) {
        excluded.add(ticker);
      }
    }
  } catch {
    // Incomplete-records file is optional for selection; hardcoded exclusion remains.
  }
  return excluded;
}

export function loadEligibleUtcDaysFromManifest(repoRoot: string): string[] {
  const path = join(repoRoot, FRICTION_MANIFEST_RELATIVE_PATH);
  const parsed = readJson(path);
  if (!isRecord(parsed) || !isRecord(parsed.calendar)) {
    throw new KalshiBrtiAccessProbeError(`invalid friction manifest: ${path}`);
  }
  const days = parsed.calendar.eligibleUtcDays;
  if (!Array.isArray(days) || days.some((day) => typeof day !== "string")) {
    throw new KalshiBrtiAccessProbeError("friction manifest missing eligibleUtcDays");
  }
  return [...days].sort();
}

export function loadTickersByUtcDay(repoRoot: string): Map<string, string[]> {
  const path = join(repoRoot, BLIND_INCIDENCE_RELATIVE_PATH);
  const parsed = readJson(path);
  if (!isRecord(parsed) || !Array.isArray(parsed.days)) {
    throw new KalshiBrtiAccessProbeError(`invalid blind-incidence file: ${path}`);
  }

  const byDay = new Map<string, Set<string>>();
  for (const day of parsed.days) {
    if (!isRecord(day) || !Array.isArray(day.confirmations)) {
      continue;
    }
    for (const confirmation of day.confirmations) {
      if (!isRecord(confirmation)) {
        continue;
      }
      const ticker = confirmation.ticker;
      const utcDay =
        typeof confirmation.utcDayKey === "string"
          ? confirmation.utcDayKey
          : typeof day.utcDate === "string"
            ? day.utcDate
            : null;
      if (typeof ticker !== "string" || utcDay == null) {
        continue;
      }
      const bucket = byDay.get(utcDay) ?? new Set<string>();
      bucket.add(ticker);
      byDay.set(utcDay, bucket);
    }
  }

  return new Map(
    [...byDay.entries()].map(([day, tickers]) => [day, [...tickers].sort()]),
  );
}

export function selectSpentTargets(input: {
  eligibleUtcDays: readonly string[];
  tickersByUtcDay: ReadonlyMap<string, readonly string[]>;
  excludedTickers?: ReadonlySet<string>;
}): SpentTarget[] {
  const dates = selectEarlyMiddleLateDays(input.eligibleUtcDays);
  const excluded = input.excludedTickers ?? new Set([EXCLUDED_MISSING_STRIKE_TICKER]);
  const roles = [
    ["early", dates.early],
    ["middle", dates.middle],
    ["late", dates.late],
  ] as const;

  return roles.map(([role, utcDay]) => {
    const tickers = input.tickersByUtcDay.get(utcDay) ?? [];
    const selected = tickers.find((ticker) => !excluded.has(ticker));
    if (!selected) {
      throw new KalshiBrtiAccessProbeError(
        `no admitted ticker for ${role} day ${utcDay} after exclusions`,
      );
    }
    return { role, utcDay, marketTicker: selected };
  });
}

export function selectSpentTargetsFromRepo(repoRoot: string): SpentTarget[] {
  return selectSpentTargets({
    eligibleUtcDays: loadEligibleUtcDaysFromManifest(repoRoot),
    tickersByUtcDay: loadTickersByUtcDay(repoRoot),
    excludedTickers: loadExcludedMissingStrikeTickers(repoRoot),
  });
}
