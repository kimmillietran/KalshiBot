import { extractFilledTradesForForensics } from "./extractFilledTrades";
import type { LoadedPnlForensicsGateInputs } from "./loadPnlForensicsGateInputs";
import {
  PNL_FORENSICS_GATE_CAVEATS,
  PNL_FORENSICS_GATE_DISCLAIMER,
  DERIVED_SETTLEMENT_SENSITIVE_MONTHS,
} from "./pnlForensicsGateConfig";
import {
  aggregateDailyPnl,
  aggregateMarketConcentration,
  aggregateMarketLevelPnl,
  aggregateMonthlyPnl,
  aggregateRegimeBreakdown,
  aggregateSideBreakdown,
  buildDerivedSettlementMonthWarning,
  buildTopConcentrationRisks,
  computeDailyConcentration,
  evaluateFamilyForensicsVerdict,
  evaluateHypothesisForensicsVerdict,
  resolveDominantCalendarMonth,
  resolveRecommendedNextAction,
  sumGrossPnl,
  sumNetPnl,
  roundMetric,
} from "./pnlForensicsGateMath";
import type {
  PnlForensicsGateConfig,
  PnlForensicsGateInputPaths,
  PnlForensicsGateReport,
  PnlForensicsHypothesisReport,
} from "./pnlForensicsGateTypes";

function buildHypothesisReports(input: {
  trades: ReturnType<typeof extractFilledTradesForForensics>;
  familyNetPnlCents: number;
  config: PnlForensicsGateConfig;
}): PnlForensicsHypothesisReport[] {
  const hypothesisIds = [...new Set(input.trades.map((trade) => trade.hypothesisId))].sort();

  return hypothesisIds.map((hypothesisId) => {
    const hypothesisTrades = input.trades.filter((trade) => trade.hypothesisId === hypothesisId);
    const dailyPnl = aggregateDailyPnl(hypothesisTrades);
    const sideBreakdown = aggregateSideBreakdown(
      hypothesisTrades,
      sumNetPnl(hypothesisTrades),
      input.config,
    );
    const monthlyPnl = aggregateMonthlyPnl(
      hypothesisTrades,
      sumNetPnl(hypothesisTrades),
      input.config,
    );
    const market = aggregateMarketConcentration(
      hypothesisTrades,
      sumNetPnl(hypothesisTrades),
    );
    const dailyConcentration = computeDailyConcentration(dailyPnl);
    const verdict = evaluateHypothesisForensicsVerdict({
      trades: hypothesisTrades,
      dailyPnl,
      sideBreakdown,
      monthlyPnl,
      marketEntries: market.entries,
      config: input.config,
    });

    return {
      hypothesisId,
      family: hypothesisTrades[0]?.suggestedStrategyFamily ?? null,
      netPnlCents: sumNetPnl(hypothesisTrades),
      grossPnlCents: sumGrossPnl(hypothesisTrades),
      filledTradeCount: hypothesisTrades.length,
      uniqueMarketCount: new Set(hypothesisTrades.map((trade) => trade.marketId)).size,
      uniqueTradingDayCount: new Set(
        hypothesisTrades
          .map((trade) => trade.tradingDayUtc)
          .filter((day): day is string => Boolean(day)),
      ).size,
      positiveDayCount: dailyConcentration.positiveDayCount,
      negativeDayCount: dailyConcentration.negativeDayCount,
      topDayShare: dailyConcentration.topDayShareOfTotalPositivePnl,
      topMarketShare: market.summary.topMarketShareOfTotalPnl,
      sideBreakdown,
      monthBreakdown: monthlyPnl,
      forensicsVerdict: verdict.verdict,
      warnings: verdict.warnings,
    };
  });
}

export function buildPnlForensicsGateReport(input: {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: PnlForensicsGateInputPaths;
  inputStatus: ReturnType<
    typeof import("./loadPnlForensicsGateInputs").resolvePnlForensicsGateInputStatus
  >;
  config: PnlForensicsGateConfig;
  loadedInputs: LoadedPnlForensicsGateInputs;
}): PnlForensicsGateReport {
  const positiveEntries = input.loadedInputs.tradeReplay.entries.filter(
    (entry) => entry.metrics.tradeCount > 0 && entry.metrics.netPnlCents > 0,
  );

  const trades = extractFilledTradesForForensics({
    entries: positiveEntries,
    candidates: input.loadedInputs.candidates,
    observations: input.loadedInputs.observations,
    regimeVolatilityByMarket: input.loadedInputs.regimeVolatilityByMarket,
    config: input.loadedInputs.tradeReplay.config,
    regimeTags: input.loadedInputs.regimeTags,
  });

  const familyNetPnlCents = sumNetPnl(trades);
  const familyGrossPnlCents = sumGrossPnl(trades);
  const sideBreakdown = aggregateSideBreakdown(trades, familyNetPnlCents, input.config);
  const dailyPnl = aggregateDailyPnl(trades);
  const dailyConcentration = computeDailyConcentration(dailyPnl);
  const monthlyPnl = aggregateMonthlyPnl(trades, familyNetPnlCents, input.config);
  const market = aggregateMarketConcentration(trades, familyNetPnlCents);
  const marketLevelNetPnlCents = aggregateMarketLevelPnl(trades);
  const regimeBreakdownAvailable = input.inputStatus.regimeTagsPresent
    && input.loadedInputs.regimeTags.size > 0;
  const regimeBreakdown = regimeBreakdownAvailable
    ? aggregateRegimeBreakdown(trades, familyNetPnlCents)
    : [];
  const familyForensicsVerdict = evaluateFamilyForensicsVerdict({
    trades,
    dailyConcentration,
    monthlyPnl,
    marketSummary: market.summary,
    sideBreakdown,
    marketLevelNetPnlCents,
    config: input.config,
  });
  const topConcentrationRisks = buildTopConcentrationRisks({
    dailyConcentration,
    marketSummary: market.summary,
    sideBreakdown,
    monthlyPnl,
  });
  const dominantMonth = resolveDominantCalendarMonth(monthlyPnl);
  const derivedSettlementMonthWarning = buildDerivedSettlementMonthWarning({
    dominantCalendarMonth: dominantMonth.calendarMonth,
    dominantMonthShare: dominantMonth.shareOfTotalPnl,
    derivedSettlementSensitiveMonths: DERIVED_SETTLEMENT_SENSITIVE_MONTHS,
    config: input.config,
  });
  const recommendedNextAction = resolveRecommendedNextAction({
    familyVerdict: familyForensicsVerdict,
    dominantCalendarMonth: dominantMonth.calendarMonth,
    derivedSettlementSensitiveMonths: DERIVED_SETTLEMENT_SENSITIVE_MONTHS,
    dailyConcentration,
    marketSummary: market.summary,
    config: input.config,
  });
  const parityWarnings = input.loadedInputs.tradeReplay.entries
    .filter((entry) => entry.metrics.tradeCount > 0)
    .map((entry) => {
      const hypothesisTrades = trades.filter((trade) => trade.hypothesisId === entry.hypothesisId);
      const derivedNet = sumNetPnl(hypothesisTrades);
      if (derivedNet !== roundMetric(entry.metrics.netPnlCents, 2)) {
        return `Hypothesis ${entry.hypothesisId} re-derived net PnL ${derivedNet}¢ differs from M11.6 ${entry.metrics.netPnlCents}¢.`;
      }

      if (hypothesisTrades.length !== entry.metrics.tradeCount) {
        return `Hypothesis ${entry.hypothesisId} re-derived filled count ${hypothesisTrades.length} differs from M11.6 ${entry.metrics.tradeCount}.`;
      }

      return null;
    })
    .filter((warning): warning is string => Boolean(warning));
  const warnings = [
    ...topConcentrationRisks,
    derivedSettlementMonthWarning,
    dailyConcentration.topDayShareOfTotalPositivePnl !== null
    && dailyConcentration.topDayShareOfTotalPositivePnl
      <= input.config.topDayMaxShareOfPositivePnl
    && market.summary.topMarketShareOfTotalPnl !== null
    && market.summary.topMarketShareOfTotalPnl
      <= input.config.topMarketMaxShareOfTotalPnl
      ? "PnL is not dominated by a single day or market; month concentration is the primary pause driver when present."
      : null,
    ...parityWarnings,
    trades.length > 0 && trades.length !== input.loadedInputs.tradeReplay.summary.filledTradeCount
      ? "Re-derived filled trade count differs from M11.6 summary; using re-derived trades for forensics."
      : null,
    !regimeBreakdownAvailable
      ? "Regime breakdown unavailable; regime-tags.json missing or empty."
      : null,
  ].filter((warning): warning is string => Boolean(warning));

  return {
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
    disclaimer: PNL_FORENSICS_GATE_DISCLAIMER,
    caveats: [...PNL_FORENSICS_GATE_CAVEATS],
    config: input.config,
    inputPaths: input.inputPaths,
    inputStatus: input.inputStatus,
    tradeReplaySummary: input.loadedInputs.tradeReplay.summary,
    summary: {
      replayedHypothesisCount: input.loadedInputs.tradeReplay.summary.replayedHypothesisCount,
      positiveNetHypothesisCount:
        input.loadedInputs.tradeReplay.summary.positiveNetHypothesisCount,
      filledTradeCount: trades.length,
      stepLevelFilledTradeCount: input.loadedInputs.tradeReplay.summary.filledTradeCount,
      uniqueMarketCount: new Set(trades.map((trade) => trade.marketId)).size,
      uniqueTradingDayCount: new Set(
        trades.map((trade) => trade.tradingDayUtc).filter((day): day is string => Boolean(day)),
      ).size,
      familyNetPnlCents,
      familyGrossPnlCents,
      marketLevelNetPnlCents,
      dayLevelNetPnlCents: roundMetric(
        dailyPnl.reduce((sum, day) => sum + day.netPnlCents, 0),
        2,
      ),
      familyForensicsVerdict,
      recommendFullM12: familyForensicsVerdict === "proceed-to-trade-pnl-oos",
      recommendedNextAction,
      topMonthShareOfTotalPnl: dominantMonth.shareOfTotalPnl,
      dominantCalendarMonth: dominantMonth.calendarMonth,
      derivedSettlementMonthWarning,
      regimeBreakdownAvailable,
      topConcentrationRisks,
    },
    sideBreakdown,
    dailyPnl,
    dailyConcentration,
    monthlyPnl,
    marketConcentration: market.entries,
    marketConcentrationSummary: market.summary,
    regimeBreakdown,
    hypotheses: buildHypothesisReports({
      trades,
      familyNetPnlCents,
      config: input.config,
    }),
    warnings,
  };
}
