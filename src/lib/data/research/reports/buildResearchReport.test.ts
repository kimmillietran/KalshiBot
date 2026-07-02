import { describe, expect, it } from "vitest";

import {
  buildResearchReportDocument,
  loadResearchReportInputs,
  serializeResearchReportHtml,
} from "./index";

const GENERATED_AT = "2026-06-27T16:00:00.000Z";
const INPUT_ROOT = "data/research-results";

function createAggregateSummary(
  strategyId: string,
  seriesTicker: string,
  markets: Array<{ marketTicker: string; totalPnlCents: number }>,
): string {
  const marketSummaries = markets.map((market) => ({
    marketTicker: market.marketTicker,
    outputPath: `${INPUT_ROOT}/${strategyId}/${seriesTicker}/${market.marketTicker}/research-output.json`,
    status: "completed" as const,
    durationMs: 1_000,
    error: null,
    metrics: {
      totalPnlCents: market.totalPnlCents,
      totalReturnPct: 0.1,
      maxDrawdownPct: 2,
      sharpeRatio: 1,
      winRatePct: 60,
      lossRatePct: 40,
      tradeCount: 2,
      winningTradeCount: 1,
      losingTradeCount: 1,
      fillCount: 3,
      contractsFilled: 3,
    },
  }));

  const totalPnlCents = marketSummaries.reduce(
    (total, market) => total + market.metrics.totalPnlCents,
    0,
  );

  return JSON.stringify({
    generatedAt: GENERATED_AT,
    seriesTicker,
    inputRoot: INPUT_ROOT,
    marketCounts: {
      total: marketSummaries.length,
      completed: marketSummaries.length,
      failed: 0,
    },
    performance: {
      totalTrades: marketSummaries.length * 2,
      totalFills: marketSummaries.length * 3,
      totalContractsFilled: marketSummaries.length * 3,
      totalPnlCents,
      averagePnlCents: totalPnlCents / marketSummaries.length,
      medianPnlCents: marketSummaries[0]?.metrics.totalPnlCents ?? 0,
      averageReturnPct: 0.1,
      winRatePct: 60,
      lossRatePct: 40,
      maxDrawdownPct: 2,
      sharpeRatio: 1,
    },
    duration: {
      totalDurationMs: 1_000,
      averageDurationMs: 1_000,
      medianDurationMs: 1_000,
      minDurationMs: 1_000,
      maxDurationMs: 1_000,
    },
    markets: marketSummaries,
  });
}

function createLeaderboardJson(): string {
  return JSON.stringify({
    generatedAt: GENERATED_AT,
    inputRoot: INPUT_ROOT,
    outputPath: "data/leaderboards/strategy-leaderboard.json",
    rankBy: "totalPnL",
    strategies: [
      {
        rank: 1,
        strategyId: "alpha",
        marketsTested: 2,
        completedMarkets: 2,
        totalTrades: 4,
        totalFills: 6,
        totalContractsFilled: 6,
        totalPnlCents: 500,
        averagePnlCents: 250,
        medianPnlCents: 250,
        winRatePct: 70,
        maxDrawdownPct: 2,
        sharpeRatio: 1.2,
        averageDurationMs: 1_000,
        sourcePaths: [`${INPUT_ROOT}/alpha/KXBTC15M/aggregate-summary.json`],
      },
      {
        rank: 2,
        strategyId: "beta",
        marketsTested: 1,
        completedMarkets: 1,
        totalTrades: 2,
        totalFills: 3,
        totalContractsFilled: 3,
        totalPnlCents: -150,
        averagePnlCents: -150,
        medianPnlCents: -150,
        winRatePct: 40,
        maxDrawdownPct: 5,
        sharpeRatio: 0.5,
        averageDurationMs: 1_000,
        sourcePaths: [`${INPUT_ROOT}/beta/KXBTC15M/aggregate-summary.json`],
      },
    ],
  });
}

function createCalibrationJson(strategyId: string, seriesTicker: string): string {
  return JSON.stringify({
    generatedAt: GENERATED_AT,
    strategyId,
    seriesTicker,
    inputRoot: INPUT_ROOT,
    outputPath: `${INPUT_ROOT}/${strategyId}/${seriesTicker}/calibration-report.json`,
    sampleCounts: {
      totalObservations: 10,
      marketCount: 2,
      kalshiImpliedCount: 10,
      strategyFairValueCount: 0,
      skippedMissingSettlement: 0,
      skippedMissingProbability: 0,
    },
    kalshiImplied: {
      source: "kalshi-implied",
      sampleCount: 10,
      brierScore: 0.12,
      logLoss: 0.4,
      calibrationError: 0.05,
      bins: [],
      reliabilityTable: [
        {
          binIndex: 0,
          binLabel: "0.0-0.1",
          sampleCount: 5,
          averagePredictedProbability: 0.08,
          observedSettlementFrequency: 0.1,
          calibrationGap: 0.02,
        },
      ],
    },
    strategyFairValue: null,
    markets: [],
    warnings: [],
  });
}

function createIo(files: Record<string, string>) {
  return {
    readdir: (path: string) => {
      const entries = new Set<string>();
      const normalizedDir = path.replace(/\\/g, "/");
      for (const filePath of Object.keys(files)) {
        const normalized = filePath.replace(/\\/g, "/");
        if (!normalized.startsWith(`${normalizedDir}/`)) {
          continue;
        }
        const remainder = normalized.slice(normalizedDir.length + 1);
        const segment = remainder.split("/")[0];
        if (segment) {
          entries.add(segment);
        }
      }
      return [...entries].sort();
    },
    readFile: (path: string) => files[path] ?? (() => { throw new Error(`Missing file: ${path}`); })(),
    fileExists: (path: string) => files[path] !== undefined,
    isDirectory: (path: string) =>
      Object.keys(files).some((filePath) =>
        filePath.replace(/\\/g, "/").startsWith(`${path.replace(/\\/g, "/")}/`),
      ),
  };
}

describe("buildResearchReportDocument", () => {
  it("builds deterministic strategy ordering and market highlights", () => {
    const inputs = loadResearchReportInputs(
      createIo({
        "data/leaderboards/strategy-leaderboard.json": createLeaderboardJson(),
        [`${INPUT_ROOT}/alpha/KXBTC15M/aggregate-summary.json`]: createAggregateSummary(
          "alpha",
          "KXBTC15M",
          [
            { marketTicker: "MARKET-A", totalPnlCents: 400 },
            { marketTicker: "MARKET-B", totalPnlCents: 100 },
          ],
        ),
        [`${INPUT_ROOT}/beta/KXBTC15M/aggregate-summary.json`]: createAggregateSummary(
          "beta",
          "KXBTC15M",
          [{ marketTicker: "MARKET-C", totalPnlCents: -150 }],
        ),
        [`${INPUT_ROOT}/alpha/KXBTC15M/calibration-report.json`]: createCalibrationJson(
          "alpha",
          "KXBTC15M",
        ),
      }),
      { inputRoot: INPUT_ROOT },
    );

    const document = buildResearchReportDocument({
      generatedAt: GENERATED_AT,
      inputRoot: INPUT_ROOT,
      leaderboardPath: "data/leaderboards/strategy-leaderboard.json",
      inputs,
    });

    expect(document.strategySections.map((section) => section.strategyId)).toEqual([
      "alpha",
      "beta",
    ]);
    expect(document.strategySections[0]?.topMarkets[0]?.marketTicker).toBe("MARKET-A");
    expect(document.strategySections[1]?.largestLosses[0]?.totalPnlCents).toBe(-150);
    expect(document.pnlChart.map((bar) => bar.label)).toEqual(["alpha", "beta"]);
    expect(document.calibrationReports).toHaveLength(1);
  });

  it("renders empty dataset HTML without failing", () => {
    const inputs = loadResearchReportInputs(createIo({}), { inputRoot: INPUT_ROOT });
    const document = buildResearchReportDocument({
      generatedAt: GENERATED_AT,
      inputRoot: INPUT_ROOT,
      leaderboardPath: null,
      inputs,
    });
    const html = serializeResearchReportHtml(document);

    expect(document.hasData).toBe(false);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("No Research Data");
  });

  it("serializes stable HTML for the same document", () => {
    const inputs = loadResearchReportInputs(
      createIo({
        [`${INPUT_ROOT}/alpha/KXBTC15M/aggregate-summary.json`]: createAggregateSummary(
          "alpha",
          "KXBTC15M",
          [{ marketTicker: "MARKET-A", totalPnlCents: 100 }],
        ),
      }),
      { inputRoot: INPUT_ROOT },
    );
    const document = buildResearchReportDocument({
      generatedAt: GENERATED_AT,
      inputRoot: INPUT_ROOT,
      leaderboardPath: null,
      inputs,
    });

    expect(serializeResearchReportHtml(document)).toBe(serializeResearchReportHtml(document));
    expect(serializeResearchReportHtml(document)).toContain("Leaderboard");
    expect(serializeResearchReportHtml(document)).toContain("PnL by Strategy");
    expect(serializeResearchReportHtml(document)).toContain("MARKET-A");
  });
});
