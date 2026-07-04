import { enumerateMonthRange } from "./coveragePlannerDateUtils";
import type {
  CoverageMarketRecord,
  CoverageSnapshot,
  MonthCoverageEntry,
  VolatilityRegimeCoverageEntry,
} from "./coveragePlannerTypes";

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function buildMonthCoverage(
  records: readonly CoverageMarketRecord[],
): MonthCoverageEntry[] {
  const monthMarkets = new Map<string, Set<string>>();
  const monthDays = new Map<string, Set<string>>();

  for (const record of records) {
    for (const month of record.calendarMonths) {
      if (!monthMarkets.has(month)) {
        monthMarkets.set(month, new Set());
      }
      monthMarkets.get(month)?.add(record.marketTicker);
    }

    for (const day of record.tradingDays) {
      const month = day.slice(0, 7);
      if (!monthDays.has(month)) {
        monthDays.set(month, new Set());
      }
      monthDays.get(month)?.add(day);
    }
  }

  const months = uniqueSorted([...monthMarkets.keys(), ...monthDays.keys()]);
  return months.map((month) => ({
    month,
    marketCount: monthMarkets.get(month)?.size ?? 0,
    tradingDayCount: monthDays.get(month)?.size ?? 0,
  }));
}

function buildVolatilityCoverage(
  records: readonly CoverageMarketRecord[],
): VolatilityRegimeCoverageEntry[] {
  const regimeCounts = {
    low: 0,
    medium: 0,
    high: 0,
    untagged: 0,
  };

  const seen = new Set<string>();
  for (const record of records) {
    if (seen.has(record.marketTicker)) {
      continue;
    }
    seen.add(record.marketTicker);

    if (record.volatilityRegime === "low") {
      regimeCounts.low += 1;
    } else if (record.volatilityRegime === "medium") {
      regimeCounts.medium += 1;
    } else if (record.volatilityRegime === "high") {
      regimeCounts.high += 1;
    } else {
      regimeCounts.untagged += 1;
    }
  }

  return (["low", "medium", "high", "untagged"] as const).map((regime) => ({
    regime,
    marketCount: regimeCounts[regime],
  }));
}

function buildMarketTypeCoverage(
  records: readonly CoverageMarketRecord[],
): CoverageSnapshot["marketTypeCoverage"] {
  const bySeries = new Map<
    string,
    { markets: Set<string>; months: Set<string> }
  >();

  for (const record of records) {
    if (!bySeries.has(record.seriesTicker)) {
      bySeries.set(record.seriesTicker, { markets: new Set(), months: new Set() });
    }
    const bucket = bySeries.get(record.seriesTicker);
    bucket?.markets.add(record.marketTicker);
    for (const month of record.calendarMonths) {
      bucket?.months.add(month);
    }
  }

  return [...bySeries.entries()]
    .map(([seriesTicker, bucket]) => ({
      seriesTicker,
      marketCount: bucket.markets.size,
      monthCount: bucket.months.size,
      tickerPattern: seriesTicker,
    }))
    .sort((left, right) => right.marketCount - left.marketCount);
}

/** Aggregates scanned market records into a coverage snapshot. */
export function computeCoverageSnapshot(
  records: readonly CoverageMarketRecord[],
  counts: {
    importConfigCount: number;
    fixtureCount: number;
    researchOutputCount: number;
  },
): CoverageSnapshot {
  const uniqueMarkets = new Set(records.map((record) => record.marketTicker));
  const uniqueTradingDays = uniqueSorted(
    records.flatMap((record) => record.tradingDays),
  );
  const monthCoverage = buildMonthCoverage(records);

  const observedMonths = monthCoverage.map((entry) => entry.month);
  const earliestMonth = observedMonths[0] ?? null;
  const latestMonth = observedMonths.at(-1) ?? null;

  const missingMonths =
    earliestMonth && latestMonth
      ? enumerateMonthRange(earliestMonth, latestMonth).filter(
          (month) => !observedMonths.includes(month),
        )
      : [];

  return {
    marketCount: uniqueMarkets.size,
    uniqueTradingDays: uniqueTradingDays.length,
    monthCoverage,
    missingMonths,
    coverageHorizon: {
      earliestMonth,
      latestMonth,
    },
    volatilityRegimeCoverage: buildVolatilityCoverage(records),
    marketTypeCoverage: buildMarketTypeCoverage(records),
    importConfigCount: counts.importConfigCount,
    fixtureCount: counts.fixtureCount,
    researchOutputCount: counts.researchOutputCount,
  };
}
