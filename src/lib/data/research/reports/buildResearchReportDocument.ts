import type {
  ParsedStrategyAggregateSummary,
  StrategyLeaderboardEntry,
} from "@/lib/data/research/leaderboard/strategyLeaderboardTypes";

import type {
  BuildResearchReportDocumentInput,
  ResearchReportChartBar,
  ResearchReportDocument,
  ResearchReportMarketHighlight,
  ResearchReportStrategySection,
} from "./researchReportTypes";

function readSeriesTickerFromOutputPath(outputPath: string): string {
  const segments = outputPath.replace(/\\/g, "/").split("/").filter(Boolean);
  const marketIndex = segments.length - 2;
  return marketIndex >= 0 ? segments[marketIndex] ?? "unknown" : "unknown";
}

function toMarketHighlight(
  strategyId: string,
  market: ParsedStrategyAggregateSummary["markets"][number],
): ResearchReportMarketHighlight | null {
  if (market.status !== "completed" || market.metrics === null) {
    return null;
  }

  return {
    strategyId,
    seriesTicker: readSeriesTickerFromOutputPath(market.outputPath),
    marketTicker: market.marketTicker,
    totalPnlCents: market.metrics.totalPnlCents,
    winRatePct: market.metrics.winRatePct,
    tradeCount: market.metrics.tradeCount,
    fillCount: market.metrics.fillCount,
    maxDrawdownPct: market.metrics.maxDrawdownPct,
  };
}

function sortByPnlDesc(
  left: ResearchReportMarketHighlight,
  right: ResearchReportMarketHighlight,
): number {
  const pnlCompare = right.totalPnlCents - left.totalPnlCents;
  if (pnlCompare !== 0) {
    return pnlCompare;
  }

  const strategyCompare = left.strategyId.localeCompare(right.strategyId);
  if (strategyCompare !== 0) {
    return strategyCompare;
  }

  return left.marketTicker.localeCompare(right.marketTicker);
}

function sortByPnlAsc(
  left: ResearchReportMarketHighlight,
  right: ResearchReportMarketHighlight,
): number {
  return sortByPnlDesc(right, left);
}

function sliceTop(
  markets: readonly ResearchReportMarketHighlight[],
  count: number,
): ResearchReportMarketHighlight[] {
  return [...markets].sort(sortByPnlDesc).slice(0, count);
}

function sliceBottom(
  markets: readonly ResearchReportMarketHighlight[],
  count: number,
): ResearchReportMarketHighlight[] {
  return [...markets].sort(sortByPnlAsc).slice(0, count);
}

function sliceLargestWins(
  markets: readonly ResearchReportMarketHighlight[],
  count: number,
): ResearchReportMarketHighlight[] {
  return [...markets]
    .filter((market) => market.totalPnlCents > 0)
    .sort(sortByPnlDesc)
    .slice(0, count);
}

function sliceLargestLosses(
  markets: readonly ResearchReportMarketHighlight[],
  count: number,
): ResearchReportMarketHighlight[] {
  return [...markets]
    .filter((market) => market.totalPnlCents < 0)
    .sort(sortByPnlAsc)
    .slice(0, count);
}

function buildStrategySection(
  summary: ParsedStrategyAggregateSummary,
  leaderboardEntry: StrategyLeaderboardEntry | undefined,
): ResearchReportStrategySection {
  const marketHighlights = summary.markets
    .map((market) => toMarketHighlight(summary.strategyId, market))
    .filter((market): market is ResearchReportMarketHighlight => market !== null);

  return {
    strategyId: summary.strategyId,
    marketsTested: leaderboardEntry?.marketsTested ?? summary.marketCounts.total,
    completedMarkets: leaderboardEntry?.completedMarkets ?? summary.marketCounts.completed,
    totalTrades: leaderboardEntry?.totalTrades ?? summary.performance.totalTrades,
    totalFills: leaderboardEntry?.totalFills ?? summary.performance.totalFills,
    totalPnlCents: leaderboardEntry?.totalPnlCents ?? summary.performance.totalPnlCents,
    winRatePct: leaderboardEntry?.winRatePct ?? summary.performance.winRatePct,
    maxDrawdownPct: leaderboardEntry?.maxDrawdownPct ?? summary.performance.maxDrawdownPct,
    sharpeRatio: leaderboardEntry?.sharpeRatio ?? summary.performance.sharpeRatio,
    topMarkets: sliceTop(marketHighlights, 5),
    bottomMarkets: sliceBottom(marketHighlights, 5),
    largestWins: sliceLargestWins(marketHighlights, 5),
    largestLosses: sliceLargestLosses(marketHighlights, 5),
  };
}

function chartBar(
  label: string,
  value: number,
  tone: ResearchReportChartBar["tone"] = "neutral",
): ResearchReportChartBar {
  return { label, value, tone };
}

function pnlTone(value: number): ResearchReportChartBar["tone"] {
  if (value > 0) {
    return "up";
  }
  if (value < 0) {
    return "down";
  }
  return "neutral";
}

function buildCharts(
  strategySections: readonly ResearchReportStrategySection[],
): Pick<
  ResearchReportDocument,
  "pnlChart" | "winRateChart" | "drawdownChart" | "tradeCountChart" | "fillCountChart"
> {
  const sorted = [...strategySections].sort((left, right) =>
    left.strategyId.localeCompare(right.strategyId),
  );

  return {
    pnlChart: sorted.map((section) =>
      chartBar(section.strategyId, section.totalPnlCents, pnlTone(section.totalPnlCents)),
    ),
    winRateChart: sorted.map((section) =>
      chartBar(section.strategyId, section.winRatePct, "neutral"),
    ),
    drawdownChart: sorted.map((section) =>
      chartBar(section.strategyId, section.maxDrawdownPct, "down"),
    ),
    tradeCountChart: sorted.map((section) =>
      chartBar(section.strategyId, section.totalTrades, "neutral"),
    ),
    fillCountChart: sorted.map((section) =>
      chartBar(section.strategyId, section.totalFills, "neutral"),
    ),
  };
}

/** Builds a deterministic research report document from loaded inputs. */
export function buildResearchReportDocument(
  input: BuildResearchReportDocumentInput,
): ResearchReportDocument {
  const leaderboardByStrategy = new Map(
    (input.inputs.leaderboard?.strategies ?? []).map((entry) => [entry.strategyId, entry]),
  );

  const strategySections = input.inputs.strategySummaries
    .map((summary) => buildStrategySection(summary, leaderboardByStrategy.get(summary.strategyId)))
    .sort((left, right) => left.strategyId.localeCompare(right.strategyId));

  const charts = buildCharts(strategySections);
  const hasData =
    strategySections.length > 0
    || (input.inputs.leaderboard?.strategies.length ?? 0) > 0
    || input.inputs.calibrationReports.length > 0;

  return {
    generatedAt: input.generatedAt,
    inputRoot: input.inputRoot,
    leaderboardPath: input.leaderboardPath,
    hasData,
    leaderboard: input.inputs.leaderboard,
    strategySections,
    calibrationReports: [...input.inputs.calibrationReports].sort((left, right) => {
      const strategyCompare = left.strategyId.localeCompare(right.strategyId);
      if (strategyCompare !== 0) {
        return strategyCompare;
      }
      return left.seriesTicker.localeCompare(right.seriesTicker);
    }),
    ...charts,
  };
}
