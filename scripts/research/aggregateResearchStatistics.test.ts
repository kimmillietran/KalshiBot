import { describe, expect, it, vi } from "vitest";

import { runAggregateResearchStatisticsCommand } from "./aggregateResearchStatistics";

const SERIES_TICKER = "KXBTC15M";
const MARKET_TICKER = "KXBTC15M-26APR281945-45";

function createBatchOutput() {
  return JSON.stringify({
    marketTicker: MARKET_TICKER,
    status: "completed",
    durationMs: 1_500,
    metrics: {
      totalPnlCents: 250,
      totalReturnPct: 0.25,
      maxDrawdownPct: 1.5,
      sharpeRatio: 1.2,
      winRatePct: 66.67,
      lossRatePct: 33.33,
      tradeCount: 3,
      winningTradeCount: 2,
      losingTradeCount: 1,
    },
  });
}

function createIo() {
  const inputRoot = "data/research-results";
  const seriesDir = `${inputRoot}/${SERIES_TICKER}`;
  const marketDir = `${seriesDir}/${MARKET_TICKER}`;
  const outputPath = `${marketDir}/research-output.json`;
  const writes = new Map<string, string>();
  let stdout = "";
  let stderr = "";

  return {
    io: {
      readFile: (path: string) => {
        if (path === outputPath) {
          return createBatchOutput();
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
          return [SERIES_TICKER];
        }
        if (path === seriesDir) {
          return [MARKET_TICKER];
        }
        if (path === marketDir) {
          return ["research-output.json"];
        }
        return [];
      },
      fileExists: (path: string) => path === outputPath,
      isDirectory: (path: string) =>
        path === inputRoot || path === seriesDir || path === marketDir,
    },
    writes,
    getStdout: () => stdout,
    getStderr: () => stderr,
  };
}

describe("runAggregateResearchStatisticsCommand", () => {
  it("writes per-series aggregate summary files", () => {
    const { io, writes, getStdout } = createIo();

    const exitCode = runAggregateResearchStatisticsCommand(
      [
        "--input-dir",
        "data/research-results",
        "--output-dir",
        "data/research-results",
      ],
      io,
      { generatedAt: "2026-06-27T14:00:00.000Z" },
    );

    expect(exitCode).toBe(0);
    expect(
      writes.has("data/research-results/KXBTC15M/aggregate-summary.json"),
    ).toBe(true);

    const summary = JSON.parse(
      writes.get("data/research-results/KXBTC15M/aggregate-summary.json")!,
    );
    expect(summary.marketCounts.total).toBe(1);
    expect(summary.performance.totalPnlCents).toBe(250);
    expect(JSON.parse(getStdout())).toMatchObject({
      seriesCount: 1,
      marketCount: 1,
    });
  });

  it("reports missing input directories", () => {
    const { io, getStderr } = createIo();

    const exitCode = runAggregateResearchStatisticsCommand(
      [
        "--input-dir",
        "missing-results",
        "--output-dir",
        "data/research-results",
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
});
