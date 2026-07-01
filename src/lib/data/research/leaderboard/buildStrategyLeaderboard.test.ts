import { describe, expect, it } from "vitest";

import {
  buildStrategyLeaderboard,
  buildStrategyLeaderboardFromDirectories,
  parseStrategyLeaderboardRankMetric,
} from "./buildStrategyLeaderboard";
import { discoverStrategyAggregateSummaries, mergeStrategyMarkets } from "./discoverStrategyAggregateSummaries";
import { serializeStrategyLeaderboard } from "./serializeStrategyLeaderboard";
import {
  StrategyLeaderboardErrorCode,
  type ParsedStrategyAggregateSummary,
  type StrategyLeaderboardIo,
} from "./strategyLeaderboardTypes";

const GENERATED_AT = "2026-06-27T14:00:00.000Z";
const INPUT_ROOT = "data/research-results";

function createAggregateSummary(
  seriesTicker: string,
  markets: Array<{
    marketTicker: string;
    totalPnlCents: number;
    sharpeRatio?: number | null;
    winRatePct?: number;
    tradeCount?: number;
    durationMs?: number;
  }>,
): string {
  const marketSummaries = markets.map((market) => ({
    marketTicker: market.marketTicker,
    outputPath: `${INPUT_ROOT}/noop/${seriesTicker}/${market.marketTicker}/research-output.json`,
    status: "completed" as const,
    durationMs: market.durationMs ?? 1_000,
    error: null,
    metrics: {
      totalPnlCents: market.totalPnlCents,
      totalReturnPct: 0.1,
      maxDrawdownPct: 1,
      sharpeRatio: market.sharpeRatio ?? 1,
      winRatePct: market.winRatePct ?? 60,
      lossRatePct: 40,
      tradeCount: market.tradeCount ?? 2,
      winningTradeCount: 1,
      losingTradeCount: 1,
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
      totalTrades: marketSummaries.reduce(
        (total, market) => total + market.metrics.tradeCount,
        0,
      ),
      totalPnlCents,
      averagePnlCents: totalPnlCents / marketSummaries.length,
      medianPnlCents: marketSummaries[0]?.metrics.totalPnlCents ?? 0,
      averageReturnPct: 0.1,
      winRatePct: 60,
      lossRatePct: 40,
      maxDrawdownPct: 1,
      sharpeRatio: 1,
    },
    duration: {
      totalDurationMs: marketSummaries.length * 1_000,
      averageDurationMs: 1_000,
      medianDurationMs: 1_000,
      minDurationMs: 1_000,
      maxDurationMs: 1_000,
    },
    markets: marketSummaries,
  });
}

function createSummary(
  strategyId: string,
  totalPnlCents: number,
  overrides: Partial<ParsedStrategyAggregateSummary["performance"]> = {},
): ParsedStrategyAggregateSummary {
  return {
    strategyId,
    sourcePaths: [`${INPUT_ROOT}/${strategyId}/KXBTC15M/aggregate-summary.json`],
    marketCounts: { total: 1, completed: 1, failed: 0 },
    performance: {
      totalTrades: 2,
      totalPnlCents,
      averagePnlCents: totalPnlCents,
      medianPnlCents: totalPnlCents,
      averageReturnPct: 0.1,
      winRatePct: overrides.winRatePct ?? 60,
      lossRatePct: 40,
      maxDrawdownPct: 1,
      sharpeRatio: overrides.sharpeRatio ?? 1,
      ...overrides,
    },
    duration: {
      totalDurationMs: 1_000,
      averageDurationMs: 1_000,
      medianDurationMs: 1_000,
      minDurationMs: 1_000,
      maxDurationMs: 1_000,
    },
    markets: [],
  };
}

function createIo(
  files: Record<string, string>,
  directories: Set<string>,
): StrategyLeaderboardIo {
  return {
    readdir: (path) => {
      const dirEntries = [...directories]
        .filter((entry) => entry.slice(0, entry.lastIndexOf("/")) === path)
        .map((entry) => entry.slice(entry.lastIndexOf("/") + 1));
      const fileEntries = Object.keys(files)
        .filter((filePath) => filePath.slice(0, filePath.lastIndexOf("/")) === path)
        .map((filePath) => filePath.slice(filePath.lastIndexOf("/") + 1));

      return [...new Set([...dirEntries, ...fileEntries])].sort();
    },
    readFile: (path) => {
      const content = files[path];
      if (content === undefined) {
        throw new Error(`Missing file: ${path}`);
      }
      return content;
    },
    fileExists: (path) => files[path] !== undefined,
    isDirectory: (path) => directories.has(path),
  };
}

describe("buildStrategyLeaderboard", () => {
  it("ranks strategies by total PnL descending with deterministic tie-breaks", () => {
    const leaderboard = buildStrategyLeaderboard({
      inputRoot: INPUT_ROOT,
      outputPath: "data/leaderboards/strategy-leaderboard.json",
      generatedAt: GENERATED_AT,
      rankBy: "totalPnL",
      summaries: [
        createSummary("buy-first-ask", 300),
        createSummary("noop", 500),
        createSummary("alpha", 500),
      ],
    });

    expect(leaderboard.strategies.map((entry) => entry.strategyId)).toEqual([
      "alpha",
      "noop",
      "buy-first-ask",
    ]);
    expect(leaderboard.strategies.map((entry) => entry.rank)).toEqual([1, 2, 3]);
  });

  it("supports sharpe and winRate ranking metrics", () => {
    const sharpeLeaderboard = buildStrategyLeaderboard({
      inputRoot: INPUT_ROOT,
      outputPath: "data/leaderboards/strategy-leaderboard.json",
      generatedAt: GENERATED_AT,
      rankBy: "sharpe",
      summaries: [
        createSummary("low-sharpe", 100, { sharpeRatio: 0.5 }),
        createSummary("high-sharpe", 100, { sharpeRatio: 2.5 }),
      ],
    });

    expect(sharpeLeaderboard.strategies[0]?.strategyId).toBe("high-sharpe");

    const winRateLeaderboard = buildStrategyLeaderboard({
      inputRoot: INPUT_ROOT,
      outputPath: "data/leaderboards/strategy-leaderboard.json",
      generatedAt: GENERATED_AT,
      rankBy: "winRate",
      summaries: [
        createSummary("low-win", 100, { winRatePct: 40 }),
        createSummary("high-win", 100, { winRatePct: 80 }),
      ],
    });

    expect(winRateLeaderboard.strategies[0]?.strategyId).toBe("high-win");
  });

  it("sorts null sharpe values after finite values", () => {
    const leaderboard = buildStrategyLeaderboard({
      inputRoot: INPUT_ROOT,
      outputPath: "data/leaderboards/strategy-leaderboard.json",
      generatedAt: GENERATED_AT,
      rankBy: "sharpe",
      summaries: [
        createSummary("null-sharpe", 100, { sharpeRatio: null }),
        createSummary("finite-sharpe", 50, { sharpeRatio: 1.2 }),
      ],
    });

    expect(leaderboard.strategies.map((entry) => entry.strategyId)).toEqual([
      "finite-sharpe",
      "null-sharpe",
    ]);
  });

  it("rejects duplicate strategies and empty datasets", () => {
    expect(() =>
      buildStrategyLeaderboard({
        inputRoot: INPUT_ROOT,
        outputPath: "data/leaderboards/strategy-leaderboard.json",
        generatedAt: GENERATED_AT,
        rankBy: "totalPnL",
        summaries: [],
      }),
    ).toThrowError(
      expect.objectContaining({
        code: StrategyLeaderboardErrorCode.EMPTY_DATASET,
      }),
    );

    expect(() =>
      buildStrategyLeaderboard({
        inputRoot: INPUT_ROOT,
        outputPath: "data/leaderboards/strategy-leaderboard.json",
        generatedAt: GENERATED_AT,
        rankBy: "totalPnL",
        summaries: [createSummary("noop", 100), createSummary("noop", 200)],
      }),
    ).toThrowError(
      expect.objectContaining({
        code: StrategyLeaderboardErrorCode.DUPLICATE_STRATEGY,
      }),
    );
  });

  it("serializes deterministically", () => {
    const leaderboard = buildStrategyLeaderboard({
      inputRoot: INPUT_ROOT,
      outputPath: "data/leaderboards/strategy-leaderboard.json",
      generatedAt: GENERATED_AT,
      rankBy: "totalPnL",
      summaries: [createSummary("noop", 100)],
    });

    expect(serializeStrategyLeaderboard(leaderboard)).toBe(
      serializeStrategyLeaderboard(leaderboard),
    );
  });
});

describe("parseStrategyLeaderboardRankMetric", () => {
  it("accepts supported metrics and rejects invalid values", () => {
    expect(parseStrategyLeaderboardRankMetric("totalPnL")).toBe("totalPnL");
    expect(parseStrategyLeaderboardRankMetric(" sharpe ")).toBe("sharpe");

    expect(() => parseStrategyLeaderboardRankMetric("profit")).toThrowError(
      expect.objectContaining({
        code: StrategyLeaderboardErrorCode.INVALID_RANK_METRIC,
      }),
    );
  });
});

describe("discoverStrategyAggregateSummaries", () => {
  it("discovers and merges aggregate summaries per strategy directory", () => {
    const files = {
      "data/research-results/noop/KXBTC15M/aggregate-summary.json": createAggregateSummary(
        "KXBTC15M",
        [{ marketTicker: "MKT-A", totalPnlCents: 100 }],
      ),
      "data/research-results/buy-first-ask/KXBTC15M/aggregate-summary.json":
        createAggregateSummary("KXBTC15M", [
          { marketTicker: "MKT-B", totalPnlCents: 300 },
        ]),
    };
    const directories = new Set([
      "data/research-results",
      "data/research-results/noop",
      "data/research-results/noop/KXBTC15M",
      "data/research-results/buy-first-ask",
      "data/research-results/buy-first-ask/KXBTC15M",
    ]);

    const summaries = discoverStrategyAggregateSummaries(
      INPUT_ROOT,
      createIo(files, directories),
    );

    expect(summaries.map((summary) => summary.strategyId)).toEqual([
      "buy-first-ask",
      "noop",
    ]);
    expect(summaries[1]?.performance.totalPnlCents).toBe(100);
  });

  it("reports missing summaries, empty datasets, and duplicate markets", () => {
    const directories = new Set([
      "data/research-results",
      "data/research-results/noop",
      "data/research-results/noop/KXBTC15M",
    ]);

    expect(() =>
      discoverStrategyAggregateSummaries(INPUT_ROOT, createIo({}, directories)),
    ).toThrowError(
      expect.objectContaining({
        code: StrategyLeaderboardErrorCode.MISSING_AGGREGATE_SUMMARY,
      }),
    );

    expect(() =>
      discoverStrategyAggregateSummaries(
        INPUT_ROOT,
        createIo({}, new Set(["data/research-results"])),
      ),
    ).toThrowError(
      expect.objectContaining({
        code: StrategyLeaderboardErrorCode.EMPTY_DATASET,
      }),
    );

    expect(() =>
      mergeStrategyMarkets({
        strategyId: "noop",
        sourcePaths: ["a.json", "b.json"],
        summaries: [
          JSON.parse(createAggregateSummary("KXBTC15M", [{ marketTicker: "MKT-A", totalPnlCents: 1 }])),
          JSON.parse(createAggregateSummary("KXBTC15M", [{ marketTicker: "MKT-A", totalPnlCents: 2 }])),
        ],
      }),
    ).toThrowError(
      expect.objectContaining({
        code: StrategyLeaderboardErrorCode.DUPLICATE_MARKET_RESULT,
      }),
    );
  });
});

describe("buildStrategyLeaderboardFromDirectories", () => {
  it("builds a leaderboard from discovered directories", () => {
    const files = {
      "data/research-results/noop/KXBTC15M/aggregate-summary.json": createAggregateSummary(
        "KXBTC15M",
        [{ marketTicker: "MKT-A", totalPnlCents: 250 }],
      ),
    };
    const directories = new Set([
      "data/research-results",
      "data/research-results/noop",
      "data/research-results/noop/KXBTC15M",
    ]);

    const leaderboard = buildStrategyLeaderboardFromDirectories(
      INPUT_ROOT,
      createIo(files, directories),
      { generatedAt: GENERATED_AT },
    );

    expect(leaderboard.strategies).toHaveLength(1);
    expect(leaderboard.strategies[0]).toMatchObject({
      strategyId: "noop",
      totalPnlCents: 250,
      rank: 1,
    });
  });
});
