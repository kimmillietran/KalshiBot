import type { PnlForensicsFilledTrade } from "@/lib/data/research/pnlForensicsGate";
import {
  aggregateDailyPnl,
  aggregateMarketConcentration,
  aggregateMarketLevelPnl,
  aggregateMonthlyPnl,
  aggregateSideBreakdown,
  computeDailyConcentration,
  evaluateFamilyForensicsVerdict,
  evaluateHypothesisForensicsVerdict,
  resolveDominantCalendarMonth,
  roundMetric,
  sumGrossPnl,
  sumNetPnl,
} from "@/lib/data/research/pnlForensicsGate";

import type {
  DerivedMonthPnlSensitivityConfig,
  DerivedMonthPnlSensitivityFamilyRecommendation,
  DerivedMonthPnlSensitivityHypothesisEntry,
  DerivedMonthPnlSensitivityVariantDelta,
  DerivedMonthPnlSensitivityVariantId,
  DerivedMonthPnlSensitivityVariantMetrics,
} from "./derivedMonthPnlSensitivityTypes";

export function sumFeeCents(trades: readonly PnlForensicsFilledTrade[]): number {
  return roundMetric(
    trades.reduce((sum, trade) => sum + trade.feeCents, 0),
    2,
  );
}

export function isTradeInSensitiveMonth(
  trade: PnlForensicsFilledTrade,
  sensitiveMonth: string,
): boolean {
  return trade.calendarMonth === sensitiveMonth;
}

export function isTradeDerivedByMarketKey(
  trade: PnlForensicsFilledTrade,
  derivedMarketKeys: ReadonlySet<string>,
): boolean {
  for (const key of derivedMarketKeys) {
    if (key.endsWith(`/${trade.marketTicker}`)) {
      return true;
    }
  }

  return false;
}

export function filterTradesForVariant(input: {
  trades: readonly PnlForensicsFilledTrade[];
  variantId: DerivedMonthPnlSensitivityVariantId;
  config: DerivedMonthPnlSensitivityConfig;
  derivedMarketKeys: ReadonlySet<string>;
  usesSensitiveMonthHeuristic: boolean;
}): PnlForensicsFilledTrade[] {
  const { trades, variantId, config, derivedMarketKeys, usesSensitiveMonthHeuristic } =
    input;

  switch (variantId) {
    case "full-corpus":
      return [...trades];
    case "excluding-sensitive-month":
      return trades.filter(
        (trade) => !isTradeInSensitiveMonth(trade, config.excludeMonth),
      );
    case "sensitive-month-only":
      return trades.filter((trade) =>
        isTradeInSensitiveMonth(trade, config.sensitiveMonth),
      );
    case "official-only":
      if (!usesSensitiveMonthHeuristic && derivedMarketKeys.size > 0) {
        return trades.filter(
          (trade) => !isTradeDerivedByMarketKey(trade, derivedMarketKeys),
        );
      }

      return trades.filter(
        (trade) => !isTradeInSensitiveMonth(trade, config.sensitiveMonth),
      );
    case "derived-only":
      if (!usesSensitiveMonthHeuristic && derivedMarketKeys.size > 0) {
        return trades.filter((trade) =>
          isTradeDerivedByMarketKey(trade, derivedMarketKeys),
        );
      }

      return trades.filter((trade) =>
        isTradeInSensitiveMonth(trade, config.sensitiveMonth),
      );
    default:
      return [...trades];
  }
}

function buildHypothesisBreakdown(
  trades: readonly PnlForensicsFilledTrade[],
  familyNetPnlCents: number,
  config: DerivedMonthPnlSensitivityConfig,
): DerivedMonthPnlSensitivityHypothesisEntry[] {
  const hypothesisIds = [...new Set(trades.map((trade) => trade.hypothesisId))].sort();

  return hypothesisIds.map((hypothesisId) => {
    const hypothesisTrades = trades.filter((trade) => trade.hypothesisId === hypothesisId);
    const dailyPnl = aggregateDailyPnl(hypothesisTrades);
    const sideBreakdown = aggregateSideBreakdown(
      hypothesisTrades,
      sumNetPnl(hypothesisTrades),
      config.forensicsConfig,
    );
    const monthlyPnl = aggregateMonthlyPnl(
      hypothesisTrades,
      sumNetPnl(hypothesisTrades),
      config.forensicsConfig,
    );
    const market = aggregateMarketConcentration(
      hypothesisTrades,
      sumNetPnl(hypothesisTrades),
    );
    const verdict = evaluateHypothesisForensicsVerdict({
      trades: hypothesisTrades,
      dailyPnl,
      sideBreakdown,
      monthlyPnl,
      marketEntries: market.entries,
      config: config.forensicsConfig,
    });

    return {
      hypothesisId,
      netPnlCents: sumNetPnl(hypothesisTrades),
      grossPnlCents: sumGrossPnl(hypothesisTrades),
      feeCents: sumFeeCents(hypothesisTrades),
      filledTradeCount: hypothesisTrades.length,
      uniqueMarketCount: new Set(hypothesisTrades.map((trade) => trade.marketId)).size,
      uniqueTradingDayCount: new Set(
        hypothesisTrades
          .map((trade) => trade.tradingDayUtc)
          .filter((day): day is string => Boolean(day)),
      ).size,
      forensicsVerdict: verdict.verdict,
    };
  });
}

export function buildVariantMetrics(input: {
  variantId: DerivedMonthPnlSensitivityVariantId;
  label: string;
  filterDescription: string;
  trades: readonly PnlForensicsFilledTrade[];
  config: DerivedMonthPnlSensitivityConfig;
  sensitiveMonth: string;
}): DerivedMonthPnlSensitivityVariantMetrics {
  const familyNetPnlCents = sumNetPnl(input.trades);
  const sideBreakdown = aggregateSideBreakdown(
    input.trades,
    familyNetPnlCents,
    input.config.forensicsConfig,
  );
  const dailyPnl = aggregateDailyPnl(input.trades);
  const dailyConcentration = computeDailyConcentration(dailyPnl);
  const monthlyPnl = aggregateMonthlyPnl(
    input.trades,
    familyNetPnlCents,
    input.config.forensicsConfig,
  );
  const market = aggregateMarketConcentration(input.trades, familyNetPnlCents);
  const dominantMonth = resolveDominantCalendarMonth(monthlyPnl);
  const forensicsVerdict = evaluateFamilyForensicsVerdict({
    trades: input.trades,
    dailyConcentration,
    monthlyPnl,
    marketSummary: market.summary,
    sideBreakdown,
    marketLevelNetPnlCents: aggregateMarketLevelPnl(input.trades),
    config: input.config.forensicsConfig,
  });
  const positiveCalendarMonthCount = monthlyPnl.filter(
    (month) => month.netPnlCents > 0,
  ).length;
  const nonSensitivePositiveMonthCount =
    input.variantId === "excluding-sensitive-month"
      ? monthlyPnl.filter(
        (month) =>
          month.netPnlCents > 0 && month.calendarMonth !== input.sensitiveMonth,
      ).length
      : null;

  return {
    variantId: input.variantId,
    label: input.label,
    filterDescription: input.filterDescription,
    netPnlCents: familyNetPnlCents,
    grossPnlCents: sumGrossPnl(input.trades),
    feeCents: sumFeeCents(input.trades),
    filledTradeCount: input.trades.length,
    uniqueMarketCount: new Set(input.trades.map((trade) => trade.marketId)).size,
    uniqueTradingDayCount: new Set(
      input.trades
        .map((trade) => trade.tradingDayUtc)
        .filter((day): day is string => Boolean(day)),
    ).size,
    positiveDayCount: dailyConcentration.positiveDayCount,
    negativeDayCount: dailyConcentration.negativeDayCount,
    averageDailyPnlCents: dailyConcentration.dailyMeanNetPnlCents,
    medianDailyPnlCents: dailyConcentration.dailyMedianNetPnlCents,
    topDayShare: dailyConcentration.topDayShareOfTotalPositivePnl,
    topMarketShare: market.summary.topMarketShareOfTotalPnl,
    topMonthShare: dominantMonth.shareOfTotalPnl,
    sideBreakdown,
    hypothesisBreakdown: buildHypothesisBreakdown(
      input.trades,
      familyNetPnlCents,
      input.config,
    ),
    monthBreakdown: monthlyPnl,
    forensicsVerdict,
    positiveCalendarMonthCount,
    nonSensitivePositiveMonthCount,
  };
}

function countSignFlips(input: {
  fullEntries: readonly { id: string; netPnlCents: number }[];
  variantEntries: readonly { id: string; netPnlCents: number }[];
}): { count: number; flippedIds: string[] } {
  const variantById = new Map(
    input.variantEntries.map((entry) => [entry.id, entry.netPnlCents]),
  );
  const flippedIds: string[] = [];

  for (const entry of input.fullEntries) {
    const variantNet = variantById.get(entry.id);
    if (variantNet === undefined) {
      if (entry.netPnlCents > 0) {
        flippedIds.push(entry.id);
      }

      continue;
    }

    if (
      (entry.netPnlCents > 0 && variantNet <= 0)
      || (entry.netPnlCents <= 0 && variantNet > 0)
    ) {
      flippedIds.push(entry.id);
    }
  }

  flippedIds.sort();
  return { count: flippedIds.length, flippedIds };
}

export function computeVariantDelta(input: {
  fullCorpus: DerivedMonthPnlSensitivityVariantMetrics;
  variant: DerivedMonthPnlSensitivityVariantMetrics;
}): DerivedMonthPnlSensitivityVariantDelta {
  const fullNet = input.fullCorpus.netPnlCents;
  const retention = (numerator: number, denominator: number): number | null => {
    if (denominator === 0) {
      return null;
    }

    return roundMetric(numerator / denominator, 4);
  };

  const hypothesisFlips = countSignFlips({
    fullEntries: input.fullCorpus.hypothesisBreakdown.map((entry) => ({
      id: entry.hypothesisId,
      netPnlCents: entry.netPnlCents,
    })),
    variantEntries: input.variant.hypothesisBreakdown.map((entry) => ({
      id: entry.hypothesisId,
      netPnlCents: entry.netPnlCents,
    })),
  });
  const sideFlips = countSignFlips({
    fullEntries: input.fullCorpus.sideBreakdown.map((entry) => ({
      id: entry.sideBucket,
      netPnlCents: entry.netPnlCents,
    })),
    variantEntries: input.variant.sideBreakdown.map((entry) => ({
      id: entry.sideBucket,
      netPnlCents: entry.netPnlCents,
    })),
  });

  return {
    netPnlDeltaCents: roundMetric(input.variant.netPnlCents - fullNet, 2),
    netPnlRetentionShare: retention(input.variant.netPnlCents, fullNet),
    tradeCountRetentionShare: retention(
      input.variant.filledTradeCount,
      input.fullCorpus.filledTradeCount,
    ),
    marketCountRetentionShare: retention(
      input.variant.uniqueMarketCount,
      input.fullCorpus.uniqueMarketCount,
    ),
    dayCountRetentionShare: retention(
      input.variant.uniqueTradingDayCount,
      input.fullCorpus.uniqueTradingDayCount,
    ),
    hypothesisSignFlips: hypothesisFlips.count,
    sideSignFlips: sideFlips.count,
    flippedHypothesisIds: hypothesisFlips.flippedIds,
    flippedSideBuckets: sideFlips.flippedIds,
  };
}

export function evaluateFamilyRecommendation(input: {
  config: DerivedMonthPnlSensitivityConfig;
  fullCorpus: DerivedMonthPnlSensitivityVariantMetrics;
  excludingSensitiveMonth: DerivedMonthPnlSensitivityVariantMetrics | null;
  sensitiveMonthOnly: DerivedMonthPnlSensitivityVariantMetrics | null;
  excludingDelta: DerivedMonthPnlSensitivityVariantDelta | null;
}): DerivedMonthPnlSensitivityFamilyRecommendation {
  const { fullCorpus, excludingSensitiveMonth, sensitiveMonthOnly, excludingDelta, config } =
    input;

  if (fullCorpus.filledTradeCount < config.forensicsConfig.minFilledTradesForAnalysis) {
    return "insufficient-data";
  }

  if (!excludingSensitiveMonth || !excludingDelta) {
    return "insufficient-data";
  }

  const positiveHypothesesInFull = fullCorpus.hypothesisBreakdown.filter(
    (entry) => entry.netPnlCents > 0,
  ).length;
  const hypothesisFlipShare =
    positiveHypothesesInFull > 0
      ? excludingDelta.hypothesisSignFlips / positiveHypothesesInFull
      : 0;

  if (excludingSensitiveMonth.netPnlCents <= 0) {
    return "reject-family-derived-month-artifact";
  }

  if (
    hypothesisFlipShare >= config.hypothesisSignFlipMajorityShare
    && excludingDelta.hypothesisSignFlips > 0
  ) {
    return "reject-family-derived-month-artifact";
  }

  const retention = excludingDelta.netPnlRetentionShare;
  if (
    retention !== null
    && retention <= config.sensitiveMonthExplainsNearlyAllRetentionShare
    && sensitiveMonthOnly !== null
    && sensitiveMonthOnly.netPnlCents > 0
    && fullCorpus.netPnlCents > 0
  ) {
    return "pause-family-derived-month-dependent";
  }

  const nonSensitivePositiveMonths =
    excludingSensitiveMonth.nonSensitivePositiveMonthCount ?? 0;
  const topMonthShare = excludingSensitiveMonth.topMonthShare ?? 1;
  const tradingDaysSufficient =
    excludingSensitiveMonth.uniqueTradingDayCount >= config.minUniqueTradingDays;

  if (
    excludingSensitiveMonth.netPnlCents > 0
    && nonSensitivePositiveMonths >= config.minNonSensitivePositiveMonths
    && topMonthShare <= config.topMonthMaxShareAfterExclusion
    && tradingDaysSufficient
  ) {
    return "proceed-to-trade-pnl-oos";
  }

  if (excludingSensitiveMonth.netPnlCents > 0) {
    return "collect-more-official-months";
  }

  return "pause-family-derived-month-dependent";
}

export function variantLabel(
  variantId: DerivedMonthPnlSensitivityVariantId,
  sensitiveMonth: string,
): string {
  switch (variantId) {
    case "full-corpus":
      return "Full corpus";
    case "excluding-sensitive-month":
      return `Excluding ${sensitiveMonth}`;
    case "sensitive-month-only":
      return `${sensitiveMonth} only`;
    case "official-only":
      return "Official settlements only";
    case "derived-only":
      return "Derived settlements only";
    default:
      return variantId;
  }
}

export function variantFilterDescription(
  variantId: DerivedMonthPnlSensitivityVariantId,
  sensitiveMonth: string,
  usesSensitiveMonthHeuristic: boolean,
): string {
  switch (variantId) {
    case "full-corpus":
      return "All re-derived filled trades from M11.6 positive-net hypotheses.";
    case "excluding-sensitive-month":
      return `Exclude trades with calendarMonth=${sensitiveMonth}.`;
    case "sensitive-month-only":
      return `Include only trades with calendarMonth=${sensitiveMonth}.`;
    case "official-only":
      return usesSensitiveMonthHeuristic
        ? `Per-trade settlement flags unavailable; exclude calendarMonth=${sensitiveMonth} as official-only proxy.`
        : "Exclude trades in markets with derived expiration_value settlements.";
    case "derived-only":
      return usesSensitiveMonthHeuristic
        ? `Per-trade settlement flags unavailable; include only calendarMonth=${sensitiveMonth} as derived-only proxy.`
        : "Include only trades in markets with derived expiration_value settlements.";
    default:
      return variantId;
  }
}
