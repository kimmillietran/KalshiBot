import type {
  ParsedResearchOutput,
  ResearchAggregatePerformanceStatistics,
  ResearchDurationStatistics,
  ResearchMarketCounts,
  ResearchMarketResultSummary,
  ResearchOutputMetrics,
} from "./researchAggregateTypes";

function average(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function median(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1]! + sorted[middle]!) / 2;
  }

  return sorted[middle]!;
}

function aggregateSharpeRatio(metrics: readonly ResearchOutputMetrics[]): number | null {
  const values = metrics
    .map((entry) => entry.sharpeRatio)
    .filter((value): value is number => value !== null);

  if (values.length === 0) {
    return null;
  }

  return average(values);
}

export function computeMarketCounts(
  markets: readonly ResearchMarketResultSummary[],
): ResearchMarketCounts {
  const completed = markets.filter((market) => market.status === "completed").length;
  const failed = markets.filter((market) => market.status === "failed").length;

  return {
    total: markets.length,
    completed,
    failed,
  };
}

export function computeDurationStatistics(
  markets: readonly ResearchMarketResultSummary[],
): ResearchDurationStatistics {
  const durations = markets.map((market) => market.durationMs);

  return {
    totalDurationMs: durations.reduce((total, value) => total + value, 0),
    averageDurationMs: average(durations),
    medianDurationMs: median(durations),
    minDurationMs: durations.length > 0 ? Math.min(...durations) : 0,
    maxDurationMs: durations.length > 0 ? Math.max(...durations) : 0,
  };
}

export function computePerformanceStatistics(
  markets: readonly ResearchMarketResultSummary[],
): ResearchAggregatePerformanceStatistics {
  const completed = markets.filter(
    (market): market is ResearchMarketResultSummary & { metrics: ResearchOutputMetrics } =>
      market.status === "completed" && market.metrics !== null,
  );

  const pnlValues = completed.map((market) => market.metrics.totalPnlCents);
  const returnValues = completed.map((market) => market.metrics.totalReturnPct);
  const drawdownValues = completed.map((market) => market.metrics.maxDrawdownPct);
  const metrics = completed.map((market) => market.metrics);

  const totalTrades = metrics.reduce((total, entry) => total + entry.tradeCount, 0);
  const totalFills = metrics.reduce((total, entry) => total + entry.fillCount, 0);
  const totalContractsFilled = metrics.reduce(
    (total, entry) => total + entry.contractsFilled,
    0,
  );
  const totalWinningTrades = metrics.reduce(
    (total, entry) => total + entry.winningTradeCount,
    0,
  );
  const totalLosingTrades = metrics.reduce(
    (total, entry) => total + entry.losingTradeCount,
    0,
  );

  const totalPnlCents = pnlValues.reduce((total, value) => total + value, 0);

  return {
    totalTrades,
    totalFills,
    totalContractsFilled,
    totalPnlCents,
    averagePnlCents: completed.length > 0 ? totalPnlCents / completed.length : 0,
    medianPnlCents: median(pnlValues),
    averageReturnPct: average(returnValues),
    winRatePct: totalTrades > 0 ? (totalWinningTrades / totalTrades) * 100 : 0,
    lossRatePct: totalTrades > 0 ? (totalLosingTrades / totalTrades) * 100 : 0,
    maxDrawdownPct: drawdownValues.length > 0 ? Math.max(...drawdownValues) : 0,
    sharpeRatio: aggregateSharpeRatio(metrics),
  };
}

export function toMarketResultSummary(
  outputPath: string,
  parsed: ParsedResearchOutput,
): ResearchMarketResultSummary {
  return {
    marketTicker: parsed.marketTicker,
    outputPath,
    status: parsed.status,
    durationMs: parsed.durationMs,
    metrics: parsed.metrics,
    error: parsed.error,
  };
}
