import { describe, expect, it, vi } from "vitest";

import { runStrategyLeaderboardCommand } from "./runStrategyLeaderboard";

function createAggregateSummary(totalPnlCents: number): string {
  return JSON.stringify({
    generatedAt: "2026-06-27T14:00:00.000Z",
    seriesTicker: "KXBTC15M",
    inputRoot: "data/research-results",
    marketCounts: { total: 1, completed: 1, failed: 0 },
    performance: {
      totalTrades: 2,
      totalPnlCents,
      averagePnlCents: totalPnlCents,
      medianPnlCents: totalPnlCents,
      averageReturnPct: 0.1,
      winRatePct: 60,
      lossRatePct: 40,
      maxDrawdownPct: 1,
      sharpeRatio: 1,
    },
    duration: {
      totalDurationMs: 1_000,
      averageDurationMs: 1_000,
      medianDurationMs: 1_000,
      minDurationMs: 1_000,
      maxDurationMs: 1_000,
    },
    markets: [
      {
        marketTicker: "MKT-A",
        outputPath: "data/research-results/noop/KXBTC15M/MKT-A/research-output.json",
        status: "completed",
        durationMs: 1_000,
        error: null,
        metrics: {
          totalPnlCents,
          totalReturnPct: 0.1,
          maxDrawdownPct: 1,
          sharpeRatio: 1,
          winRatePct: 60,
          lossRatePct: 40,
          tradeCount: 2,
          winningTradeCount: 1,
          losingTradeCount: 1,
        },
      },
    ],
  });
}

function createIo() {
  const inputRoot = "data/research-results";
  const noopDir = `${inputRoot}/noop`;
  const seriesDir = `${noopDir}/KXBTC15M`;
  const summaryPath = `${seriesDir}/aggregate-summary.json`;
  const writes = new Map<string, string>();
  let stdout = "";
  let stderr = "";

  return {
    io: {
      readFile: (path: string) => {
        if (path === summaryPath) {
          return createAggregateSummary(250);
        }
        throw new Error(`Missing file: ${path}`);
      },
      writeStdout: (text: string) => {
        stdout += text;
      },
      writeStderr: (text: string) => {
        stderr += text;
      },
      writeFile: (path: string, data: string) => {
        writes.set(path, data);
      },
      mkdirSync: vi.fn(),
      readdir: (path: string) => {
        if (path === inputRoot) {
          return ["noop"];
        }
        if (path === noopDir) {
          return ["KXBTC15M"];
        }
        if (path === seriesDir) {
          return ["aggregate-summary.json"];
        }
        return [];
      },
      fileExists: (path: string) => path === summaryPath,
      isDirectory: (path: string) =>
        path === inputRoot || path === noopDir || path === seriesDir,
    },
    writes,
    getStdout: () => stdout,
    getStderr: () => stderr,
  };
}

describe("runStrategyLeaderboardCommand", () => {
  it("writes strategy-leaderboard.json and reports summary metadata", () => {
    const { io, writes, getStdout } = createIo();

    const exitCode = runStrategyLeaderboardCommand(
      [
        "--input-dir",
        "data/research-results",
        "--output",
        "data/leaderboards/strategy-leaderboard.json",
        "--rank-by",
        "totalPnL",
      ],
      io,
      { generatedAt: "2026-06-27T14:00:00.000Z" },
    );

    expect(exitCode).toBe(0);
    expect(writes.has("data/leaderboards/strategy-leaderboard.json")).toBe(true);

    const leaderboard = JSON.parse(
      writes.get("data/leaderboards/strategy-leaderboard.json")!,
    );
    expect(leaderboard.strategies[0]).toMatchObject({
      strategyId: "noop",
      totalPnlCents: 250,
      rank: 1,
    });
    expect(JSON.parse(getStdout())).toMatchObject({
      strategyCount: 1,
      rankBy: "totalPnL",
    });
  });

  it("reports missing input directories", () => {
    const { io, getStderr } = createIo();

    const exitCode = runStrategyLeaderboardCommand(
      [
        "--input-dir",
        "missing-results",
        "--output",
        "data/leaderboards/strategy-leaderboard.json",
      ],
      {
        ...io,
        isDirectory: () => false,
      },
      { generatedAt: "2026-06-27T14:00:00.000Z" },
    );

    expect(exitCode).toBe(1);
    expect(getStderr()).toContain("Research results directory does not exist");
  });

  it("reports invalid rank metrics", () => {
    const { io, getStderr } = createIo();

    const exitCode = runStrategyLeaderboardCommand(
      [
        "--input-dir",
        "data/research-results",
        "--rank-by",
        "profit",
      ],
      io,
      { generatedAt: "2026-06-27T14:00:00.000Z" },
    );

    expect(exitCode).toBe(1);
    expect(getStderr()).toContain("Unsupported rank metric");
  });
});
