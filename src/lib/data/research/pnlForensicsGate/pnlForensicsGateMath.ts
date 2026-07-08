import type { HypothesisTradeRule } from "@/lib/data/research/hypothesisTradeReplay/hypothesisTradeReplayTypes";

import type {
  PnlForensicsDailyConcentration,
  PnlForensicsDailyPnlEntry,
  PnlForensicsFamilyVerdict,
  PnlForensicsFilledTrade,
  PnlForensicsGateConfig,
  PnlForensicsHypothesisVerdict,
  PnlForensicsMarketConcentrationEntry,
  PnlForensicsMarketConcentrationSummary,
  PnlForensicsMonthlyPnlEntry,
  PnlForensicsRecommendedNextAction,
  PnlForensicsRegimeBreakdownEntry,
  PnlForensicsSideBucket,
  PnlForensicsSideBreakdownEntry,
} from "./pnlForensicsGateTypes";

export function roundMetric(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function resolveSideBucket(rule: HypothesisTradeRule): PnlForensicsSideBucket {
  if (rule.calibrationDirection === "over" && rule.side === "no") {
    return "calibration-no-fade";
  }

  if (rule.calibrationDirection === "under" && rule.side === "yes") {
    return "calibration-yes-fade";
  }

  return rule.side === "yes" ? "yes-buys" : "no-buys";
}

export function sumNetPnl(trades: readonly PnlForensicsFilledTrade[]): number {
  return roundMetric(trades.reduce((sum, trade) => sum + trade.netPnlCents, 0), 2);
}

export function sumGrossPnl(trades: readonly PnlForensicsFilledTrade[]): number {
  return roundMetric(trades.reduce((sum, trade) => sum + trade.grossPnlCents, 0), 2);
}

function uniqueCount(values: readonly (string | null)[]): number {
  return new Set(values.filter((value): value is string => Boolean(value))).size;
}

function shareOfTotal(value: number, total: number): number | null {
  if (total === 0) {
    return null;
  }

  return roundMetric(value / total);
}

function shareOfPositiveTotal(value: number, positiveTotal: number): number | null {
  if (positiveTotal <= 0 || value <= 0) {
    return value > 0 && positiveTotal <= 0 ? 1 : null;
  }

  return roundMetric(value / positiveTotal);
}

function computeAveragePnlPerMarketDay(
  trades: readonly PnlForensicsFilledTrade[],
): number | null {
  const marketDays = new Set<string>();
  let net = 0;

  for (const trade of trades) {
    if (!trade.tradingDayUtc) {
      continue;
    }

    marketDays.add(`${trade.marketId}::${trade.tradingDayUtc}`);
    net += trade.netPnlCents;
  }

  return marketDays.size > 0 ? roundMetric(net / marketDays.size, 4) : null;
}

function buildAggregationMetrics(
  trades: readonly PnlForensicsFilledTrade[],
  familyNetPnlCents: number,
): Omit<PnlForensicsSideBreakdownEntry, "sideBucket" | "dominatesFamilyPnl"> {
  const marketTotals = new Map<string, number>();

  for (const trade of trades) {
    marketTotals.set(trade.marketId, (marketTotals.get(trade.marketId) ?? 0) + trade.netPnlCents);
  }

  const netPnlCents = sumNetPnl(trades);
  const grossPnlCents = sumGrossPnl(trades);
  const uniqueMarketCount = uniqueCount(trades.map((trade) => trade.marketId));
  const uniqueTradingDayCount = uniqueCount(trades.map((trade) => trade.tradingDayUtc));
  const filledTradeCount = trades.length;

  return {
    netPnlCents,
    grossPnlCents,
    filledTradeCount,
    uniqueMarketCount,
    uniqueTradingDayCount,
    averagePnlPerTradeCents:
      filledTradeCount > 0 ? roundMetric(netPnlCents / filledTradeCount, 4) : null,
    averagePnlPerMarketCents:
      uniqueMarketCount > 0 ? roundMetric(netPnlCents / uniqueMarketCount, 4) : null,
    averagePnlPerMarketDayCents: computeAveragePnlPerMarketDay(trades),
    shareOfFamilyPnl: shareOfTotal(netPnlCents, familyNetPnlCents),
  };
}

export function aggregateSideBreakdown(
  trades: readonly PnlForensicsFilledTrade[],
  familyNetPnlCents: number,
  config: PnlForensicsGateConfig,
): PnlForensicsSideBreakdownEntry[] {
  const buckets: PnlForensicsSideBucket[] = [
    "yes-buys",
    "no-buys",
    "calibration-yes-fade",
    "calibration-no-fade",
  ];

  const entries = buckets
    .map((sideBucket) => {
      const bucketTrades = trades.filter((trade) => trade.sideBucket === sideBucket);
      if (bucketTrades.length === 0) {
        return null;
      }

      const metrics = buildAggregationMetrics(bucketTrades, familyNetPnlCents);
      return {
        sideBucket,
        ...metrics,
        dominatesFamilyPnl: false,
      };
    })
    .filter((entry): entry is PnlForensicsSideBreakdownEntry => entry !== null);

  const sidesWithTrades = entries.filter((entry) => entry.filledTradeCount > 0);
  const positiveAmongActiveSides = sidesWithTrades
    .filter((entry) => entry.netPnlCents > 0)
    .reduce((sum, entry) => sum + entry.netPnlCents, 0);

  return entries.map((entry) => {
    const positiveBucketPnl = entry.netPnlCents > 0 ? entry.netPnlCents : 0;
    const dominatesFamilyPnl =
      sidesWithTrades.length > 1
      && positiveAmongActiveSides > 0
      && positiveBucketPnl > 0
      && positiveBucketPnl / positiveAmongActiveSides
        >= config.maxSideShareOfPositivePnl;

    return {
      ...entry,
      dominatesFamilyPnl,
    };
  }).sort((left, right) => left.sideBucket.localeCompare(right.sideBucket));
}

export function aggregateDailyPnl(
  trades: readonly PnlForensicsFilledTrade[],
): PnlForensicsDailyPnlEntry[] {
  const byDay = new Map<string, PnlForensicsFilledTrade[]>();

  for (const trade of trades) {
    const date = trade.tradingDayUtc ?? "unknown";
    const bucket = byDay.get(date) ?? [];
    bucket.push(trade);
    byDay.set(date, bucket);
  }

  const sortedDates = [...byDay.keys()].sort((left, right) => left.localeCompare(right));
  let cumulativeNetPnlCents = 0;

  return sortedDates.map((date) => {
    const dayTrades = byDay.get(date) ?? [];
    const netPnlCents = sumNetPnl(dayTrades);
    cumulativeNetPnlCents += netPnlCents;

    return {
      date,
      netPnlCents,
      grossPnlCents: sumGrossPnl(dayTrades),
      filledTradeCount: dayTrades.length,
      uniqueMarketCount: uniqueCount(dayTrades.map((trade) => trade.marketId)),
      hypothesisIds: [...new Set(dayTrades.map((trade) => trade.hypothesisId))].sort(),
      sides: [...new Set(dayTrades.map((trade) => trade.sideBucket))].sort(),
      cumulativeNetPnlCents: roundMetric(cumulativeNetPnlCents, 2),
    };
  });
}

export function computeDailyConcentration(
  dailyPnl: readonly PnlForensicsDailyPnlEntry[],
): PnlForensicsDailyConcentration {
  const positiveDays = dailyPnl.filter((day) => day.netPnlCents > 0);
  const negativeDays = dailyPnl.filter((day) => day.netPnlCents < 0);
  const zeroDays = dailyPnl.filter((day) => day.netPnlCents === 0);
  const positiveTotal = positiveDays.reduce((sum, day) => sum + day.netPnlCents, 0);
  const sortedPositiveDays = [...positiveDays].sort(
    (left, right) => right.netPnlCents - left.netPnlCents,
  );
  const topDay = sortedPositiveDays[0] ?? null;
  const top3Positive = sortedPositiveDays
    .slice(0, 3)
    .reduce((sum, day) => sum + day.netPnlCents, 0);
  const netSeries = dailyPnl.map((day) => day.netPnlCents);
  const mean =
    netSeries.length > 0
      ? netSeries.reduce((sum, value) => sum + value, 0) / netSeries.length
      : null;
  const sortedNet = [...netSeries].sort((left, right) => left - right);
  const median =
    sortedNet.length === 0
      ? null
      : sortedNet.length % 2 === 1
        ? sortedNet[(sortedNet.length - 1) / 2]!
        : (sortedNet[sortedNet.length / 2 - 1]! + sortedNet[sortedNet.length / 2]!) / 2;
  const variance =
    mean == null || netSeries.length === 0
      ? null
      : netSeries.reduce((sum, value) => sum + (value - mean) ** 2, 0) / netSeries.length;

  return {
    positiveDayCount: positiveDays.length,
    negativeDayCount: negativeDays.length,
    zeroDayCount: zeroDays.length,
    topDayNetPnlCents: topDay?.netPnlCents ?? null,
    topDayShareOfTotalPositivePnl: topDay
      ? shareOfPositiveTotal(topDay.netPnlCents, positiveTotal)
      : null,
    top3DayShareOfTotalPositivePnl: shareOfPositiveTotal(top3Positive, positiveTotal),
    largestLosingDayCents:
      negativeDays.length > 0
        ? Math.min(...negativeDays.map((day) => day.netPnlCents))
        : null,
    dailyWinRate:
      dailyPnl.length > 0 ? roundMetric(positiveDays.length / dailyPnl.length, 4) : null,
    dailyMeanNetPnlCents: mean == null ? null : roundMetric(mean, 4),
    dailyMedianNetPnlCents: median == null ? null : roundMetric(median, 4),
    dailyStdDevNetPnlCents:
      variance == null ? null : roundMetric(Math.sqrt(variance), 4),
  };
}

export function aggregateMonthlyPnl(
  trades: readonly PnlForensicsFilledTrade[],
  familyNetPnlCents: number,
  config: PnlForensicsGateConfig,
): PnlForensicsMonthlyPnlEntry[] {
  const byMonth = new Map<string, PnlForensicsFilledTrade[]>();

  for (const trade of trades) {
    const month = trade.calendarMonth ?? "unknown";
    const bucket = byMonth.get(month) ?? [];
    bucket.push(trade);
    byMonth.set(month, bucket);
  }

  return [...byMonth.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([calendarMonth, monthTrades]) => {
      const netPnlCents = sumNetPnl(monthTrades);
      const shareOfTotalPnl = shareOfTotal(netPnlCents, familyNetPnlCents);

      return {
        calendarMonth,
        netPnlCents,
        grossPnlCents: sumGrossPnl(monthTrades),
        filledTradeCount: monthTrades.length,
        uniqueMarketCount: uniqueCount(monthTrades.map((trade) => trade.marketId)),
        uniqueTradingDayCount: uniqueCount(monthTrades.map((trade) => trade.tradingDayUtc)),
        hypothesisIds: [...new Set(monthTrades.map((trade) => trade.hypothesisId))].sort(),
        sides: [...new Set(monthTrades.map((trade) => trade.sideBucket))].sort(),
        shareOfTotalPnl,
        dominatesTotalPnl:
          familyNetPnlCents > 0
          && shareOfTotalPnl !== null
          && shareOfTotalPnl >= config.topMonthMaxShareOfTotalPnl,
      };
    });
}

export function aggregateMarketConcentration(
  trades: readonly PnlForensicsFilledTrade[],
  familyNetPnlCents: number,
): {
  entries: PnlForensicsMarketConcentrationEntry[];
  summary: PnlForensicsMarketConcentrationSummary;
} {
  const byMarket = new Map<string, PnlForensicsFilledTrade[]>();

  for (const trade of trades) {
    const bucket = byMarket.get(trade.marketId) ?? [];
    bucket.push(trade);
    byMarket.set(trade.marketId, bucket);
  }

  const entries = [...byMarket.entries()]
    .map(([marketId, marketTrades]) => ({
      marketId,
      marketTicker: marketTrades[0]?.marketTicker ?? marketId,
      netPnlCents: sumNetPnl(marketTrades),
      grossPnlCents: sumGrossPnl(marketTrades),
      filledTradeCount: marketTrades.length,
      hypothesisIds: [...new Set(marketTrades.map((trade) => trade.hypothesisId))].sort(),
      sides: [...new Set(marketTrades.map((trade) => trade.sideBucket))].sort(),
      tradingDays: [
        ...new Set(
          marketTrades
            .map((trade) => trade.tradingDayUtc)
            .filter((day): day is string => Boolean(day)),
        ),
      ].sort(),
      shareOfTotalPnl: shareOfTotal(sumNetPnl(marketTrades), familyNetPnlCents),
    }))
    .sort((left, right) => {
      const pnlCompare = right.netPnlCents - left.netPnlCents;
      return pnlCompare !== 0 ? pnlCompare : left.marketId.localeCompare(right.marketId);
    });

  const tradeCounts = entries.map((entry) => entry.filledTradeCount);
  const topMarketShare = entries[0]?.shareOfTotalPnl ?? null;
  const top5Share = shareOfTotal(
    entries.slice(0, 5).reduce((sum, entry) => sum + entry.netPnlCents, 0),
    familyNetPnlCents,
  );

  return {
    entries,
    summary: {
      topMarketShareOfTotalPnl: topMarketShare,
      top5MarketShareOfTotalPnl: top5Share,
      maxTradesPerMarket: tradeCounts.length > 0 ? Math.max(...tradeCounts) : 0,
      averageTradesPerMarket:
        tradeCounts.length > 0
          ? roundMetric(
              tradeCounts.reduce((sum, count) => sum + count, 0) / tradeCounts.length,
              4,
            )
          : null,
      marketCount: entries.length,
      positiveMarketCount: entries.filter((entry) => entry.netPnlCents > 0).length,
      negativeMarketCount: entries.filter((entry) => entry.netPnlCents < 0).length,
    },
  };
}

export function aggregateMarketLevelPnl(
  trades: readonly PnlForensicsFilledTrade[],
): number {
  const byMarket = new Map<string, number>();

  for (const trade of trades) {
    byMarket.set(trade.marketId, (byMarket.get(trade.marketId) ?? 0) + trade.netPnlCents);
  }

  return roundMetric([...byMarket.values()].reduce((sum, value) => sum + value, 0), 2);
}

export function aggregateRegimeBreakdown(
  trades: readonly PnlForensicsFilledTrade[],
  familyNetPnlCents: number,
): PnlForensicsRegimeBreakdownEntry[] {
  const byRegime = new Map<string, PnlForensicsFilledTrade[]>();

  for (const trade of trades) {
    const key = [
      trade.volatilityRegime ?? "unknown-vol",
      trade.trendRegime ?? "unknown-trend",
      trade.marketState ?? "unknown-state",
    ].join("::");
    const bucket = byRegime.get(key) ?? [];
    bucket.push(trade);
    byRegime.set(key, bucket);
  }

  return [...byRegime.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, regimeTrades]) => {
      const [volatilityRegime, trendRegime, marketState] = key.split("::");

      return {
        volatilityRegime: volatilityRegime === "unknown-vol" ? null : volatilityRegime,
        trendRegime: trendRegime === "unknown-trend" ? null : trendRegime,
        marketState: marketState === "unknown-state" ? null : marketState,
        netPnlCents: sumNetPnl(regimeTrades),
        grossPnlCents: sumGrossPnl(regimeTrades),
        filledTradeCount: regimeTrades.length,
        uniqueMarketCount: uniqueCount(regimeTrades.map((trade) => trade.marketId)),
        uniqueTradingDayCount: uniqueCount(regimeTrades.map((trade) => trade.tradingDayUtc)),
        shareOfTotalPnl: shareOfTotal(sumNetPnl(regimeTrades), familyNetPnlCents),
      };
    });
}

export function evaluateHypothesisForensicsVerdict(input: {
  trades: readonly PnlForensicsFilledTrade[];
  dailyPnl: readonly PnlForensicsDailyPnlEntry[];
  sideBreakdown: readonly PnlForensicsSideBreakdownEntry[];
  monthlyPnl: readonly PnlForensicsMonthlyPnlEntry[];
  marketEntries: readonly PnlForensicsMarketConcentrationEntry[];
  config: PnlForensicsGateConfig;
}): { verdict: PnlForensicsHypothesisVerdict; warnings: string[] } {
  const warnings: string[] = [];

  if (input.trades.length < input.config.minFilledTradesForAnalysis) {
    return { verdict: "insufficient-data", warnings: ["No filled trades available for forensics."] };
  }

  const daily = computeDailyConcentration(input.dailyPnl);
  const topMarketShare = input.marketEntries[0]?.shareOfTotalPnl ?? null;
  const topMonthShare = [...input.monthlyPnl]
    .sort((left, right) => (right.shareOfTotalPnl ?? 0) - (left.shareOfTotalPnl ?? 0))[0]
    ?.shareOfTotalPnl ?? null;
  const sideDominates =
    input.sideBreakdown.filter((entry) => entry.filledTradeCount > 0).length > 1
    && input.sideBreakdown.some((entry) => entry.dominatesFamilyPnl);
  const maxTradesPerMarket = input.marketEntries[0]?.filledTradeCount ?? 0;

  if (sideDominates) {
    warnings.push("One side contributes a dominant share of positive PnL.");
  }

  if (
    daily.topDayShareOfTotalPositivePnl !== null
    && daily.topDayShareOfTotalPositivePnl > input.config.topDayMaxShareOfPositivePnl
  ) {
    warnings.push("Top trading day dominates positive PnL.");
  }

  if (
    daily.top3DayShareOfTotalPositivePnl !== null
    && daily.top3DayShareOfTotalPositivePnl > input.config.top3DayMaxShareOfPositivePnl
  ) {
    warnings.push("Top three trading days dominate positive PnL.");
  }

  if (
    topMonthShare !== null
    && topMonthShare > input.config.topMonthMaxShareOfTotalPnl
  ) {
    warnings.push("One calendar month dominates total PnL.");
  }

  if (
    topMarketShare !== null
    && topMarketShare > input.config.topMarketMaxShareOfTotalPnl
  ) {
    warnings.push("One market dominates total PnL.");
  }

  if (maxTradesPerMarket >= input.config.repeatedEntryTradesPerMarketWarning) {
    warnings.push("Repeated entries in a single market materially contribute to PnL.");
  }

  if (warnings.length === 0) {
    return { verdict: "passes-forensics", warnings };
  }

  if (sideDominates) {
    return { verdict: "warning-concentrated-side", warnings };
  }

  if (
    daily.topDayShareOfTotalPositivePnl !== null
    && daily.topDayShareOfTotalPositivePnl > input.config.topDayMaxShareOfPositivePnl
  ) {
    return { verdict: "warning-concentrated-day", warnings };
  }

  if (
    topMonthShare !== null
    && topMonthShare > input.config.topMonthMaxShareOfTotalPnl
  ) {
    return { verdict: "warning-concentrated-month", warnings };
  }

  if (
    topMarketShare !== null
    && topMarketShare > input.config.topMarketMaxShareOfTotalPnl
  ) {
    return { verdict: "warning-concentrated-market", warnings };
  }

  if (maxTradesPerMarket >= input.config.repeatedEntryTradesPerMarketWarning) {
    return { verdict: "warning-repeated-entry-driven", warnings };
  }

  return { verdict: "fails-forensics", warnings };
}

export function evaluateFamilyForensicsVerdict(input: {
  trades: readonly PnlForensicsFilledTrade[];
  dailyConcentration: PnlForensicsDailyConcentration;
  monthlyPnl: readonly PnlForensicsMonthlyPnlEntry[];
  marketSummary: PnlForensicsMarketConcentrationSummary;
  sideBreakdown: readonly PnlForensicsSideBreakdownEntry[];
  marketLevelNetPnlCents: number;
  config: PnlForensicsGateConfig;
}): PnlForensicsFamilyVerdict {
  if (input.trades.length < input.config.minFilledTradesForAnalysis) {
    return "insufficient-data";
  }

  const positiveMonths = input.monthlyPnl.filter((month) => month.netPnlCents > 0).length;
  const positiveDays = input.dailyConcentration.positiveDayCount;
  const sideDominates =
    input.sideBreakdown.filter((entry) => entry.filledTradeCount > 0).length > 1
    && input.sideBreakdown.some((entry) => entry.dominatesFamilyPnl);
  const topDayShare = input.dailyConcentration.topDayShareOfTotalPositivePnl;
  const top3DayShare = input.dailyConcentration.top3DayShareOfTotalPositivePnl;
  const topMarketShare = input.marketSummary.topMarketShareOfTotalPnl;

  const topMonthShare = [...input.monthlyPnl]
    .sort((left, right) => (right.shareOfTotalPnl ?? 0) - (left.shareOfTotalPnl ?? 0))[0]
    ?.shareOfTotalPnl ?? null;

  const concentrationFlags = [
    topDayShare !== null && topDayShare > input.config.topDayMaxShareOfPositivePnl,
    top3DayShare !== null && top3DayShare > input.config.top3DayMaxShareOfPositivePnl,
    topMarketShare !== null && topMarketShare > input.config.topMarketMaxShareOfTotalPnl,
    topMonthShare !== null && topMonthShare > input.config.topMonthMaxShareOfTotalPnl,
    sideDominates,
    input.marketSummary.maxTradesPerMarket
      >= input.config.repeatedEntryTradesPerMarketWarning,
  ].filter(Boolean).length;

  if (input.marketLevelNetPnlCents <= 0) {
    return "pause-family-concentrated-pnl";
  }

  if (
    positiveDays < input.config.minPositiveTradingDays
    || positiveMonths < input.config.minPositiveCalendarMonths
  ) {
    return "collect-more-data";
  }

  if (concentrationFlags > 0) {
    return "pause-family-concentrated-pnl";
  }

  return "proceed-to-trade-pnl-oos";
}

export function buildTopConcentrationRisks(input: {
  dailyConcentration: PnlForensicsDailyConcentration;
  marketSummary: PnlForensicsMarketConcentrationSummary;
  sideBreakdown: readonly PnlForensicsSideBreakdownEntry[];
  monthlyPnl: readonly PnlForensicsMonthlyPnlEntry[];
}): string[] {
  const risks: string[] = [];

  if (
    input.dailyConcentration.topDayShareOfTotalPositivePnl !== null
    && input.dailyConcentration.topDayShareOfTotalPositivePnl > 0.35
  ) {
    risks.push(
      `Top day contributed ${(input.dailyConcentration.topDayShareOfTotalPositivePnl * 100).toFixed(1)}% of positive PnL.`,
    );
  }

  if (
    input.marketSummary.topMarketShareOfTotalPnl !== null
    && input.marketSummary.topMarketShareOfTotalPnl > 0.25
  ) {
    risks.push(
      `Top market contributed ${(input.marketSummary.topMarketShareOfTotalPnl * 100).toFixed(1)}% of family PnL.`,
    );
  }

  const dominantSide = input.sideBreakdown.find((entry) => entry.dominatesFamilyPnl);
  if (dominantSide) {
    risks.push(`Side ${dominantSide.sideBucket} dominates positive PnL.`);
  }

  const dominantMonth = [...input.monthlyPnl].sort(
    (left, right) => (right.shareOfTotalPnl ?? 0) - (left.shareOfTotalPnl ?? 0),
  )[0];
  if (dominantMonth?.dominatesTotalPnl) {
    risks.push(`Month ${dominantMonth.calendarMonth} dominates family PnL.`);
  }

  return risks;
}

export function resolveDominantCalendarMonth(
  monthlyPnl: readonly PnlForensicsMonthlyPnlEntry[],
): { calendarMonth: string | null; shareOfTotalPnl: number | null } {
  const dominant = [...monthlyPnl].sort(
    (left, right) => (right.shareOfTotalPnl ?? 0) - (left.shareOfTotalPnl ?? 0),
  )[0];

  return {
    calendarMonth: dominant?.calendarMonth ?? null,
    shareOfTotalPnl: dominant?.shareOfTotalPnl ?? null,
  };
}

export function resolveRecommendedNextAction(input: {
  familyVerdict: PnlForensicsFamilyVerdict;
  dominantCalendarMonth: string | null;
  derivedSettlementSensitiveMonths: readonly string[];
  dailyConcentration: PnlForensicsDailyConcentration;
  marketSummary: PnlForensicsMarketConcentrationSummary;
  config: PnlForensicsGateConfig;
}): PnlForensicsRecommendedNextAction {
  if (input.familyVerdict === "proceed-to-trade-pnl-oos") {
    return "proceed-to-full-m12-oos";
  }

  if (
    input.familyVerdict === "insufficient-data"
    || input.familyVerdict === "collect-more-data"
  ) {
    return "collect-more-official-months";
  }

  const isDerivedMonth =
    input.dominantCalendarMonth !== null
    && input.derivedSettlementSensitiveMonths.includes(input.dominantCalendarMonth);
  const dayBroad =
    (input.dailyConcentration.topDayShareOfTotalPositivePnl ?? 0)
    <= input.config.topDayMaxShareOfPositivePnl;
  const marketBroad =
    (input.marketSummary.topMarketShareOfTotalPnl ?? 0)
    <= input.config.topMarketMaxShareOfTotalPnl;

  if (isDerivedMonth) {
    if (dayBroad && marketBroad) {
      return "rerun-excluding-derived-month";
    }

    return "investigate-derived-month-pnl";
  }

  if (input.marketSummary.maxTradesPerMarket
    >= input.config.repeatedEntryTradesPerMarketWarning) {
    return "tighten-position-model";
  }

  return "do-not-start-full-m12-yet";
}

export function buildDerivedSettlementMonthWarning(input: {
  dominantCalendarMonth: string | null;
  dominantMonthShare: number | null;
  derivedSettlementSensitiveMonths: readonly string[];
  config: PnlForensicsGateConfig;
}): string | null {
  if (
    input.dominantCalendarMonth === null
    || input.dominantMonthShare === null
    || input.dominantMonthShare < input.config.topMonthMaxShareOfTotalPnl
  ) {
    return null;
  }

  if (!input.derivedSettlementSensitiveMonths.includes(input.dominantCalendarMonth)) {
    return null;
  }

  return [
    `Month ${input.dominantCalendarMonth} dominates family PnL (${(input.dominantMonthShare * 100).toFixed(1)}% share).`,
    "This month is a known derived-settlement-sensitive period and requires investigation — not automatic rejection.",
    "Day and market concentration are not the primary pause driver.",
  ].join(" ");
}
