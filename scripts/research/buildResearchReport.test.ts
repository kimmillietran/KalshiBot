import { describe, expect, it } from "vitest";

import { runBuildResearchReportCommand } from "./buildResearchReport";

const GENERATED_AT = "2026-06-27T16:00:00.000Z";
const INPUT_ROOT = "data/research-results";
const OUTPUT_PATH = "data/reports/research-report.html";

function createAggregateSummary(strategyId: string): string {
  return JSON.stringify({
    generatedAt: GENERATED_AT,
    seriesTicker: "KXBTC15M",
    inputRoot: INPUT_ROOT,
    marketCounts: { total: 1, completed: 1, failed: 0 },
    performance: {
      totalTrades: 2,
      totalFills: 3,
      totalContractsFilled: 3,
      totalPnlCents: 200,
      averagePnlCents: 200,
      medianPnlCents: 200,
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
    markets: [
      {
        marketTicker: "MARKET-A",
        outputPath: `${INPUT_ROOT}/${strategyId}/KXBTC15M/MARKET-A/research-output.json`,
        status: "completed",
        durationMs: 1_000,
        error: null,
        metrics: {
          totalPnlCents: 200,
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
      },
    ],
  });
}

describe("runBuildResearchReportCommand", () => {
  it("writes research-report.html and reports metadata on stdout", () => {
    const writes = new Map<string, string>();
    let stdout = "";

    const aggregatePath = `${INPUT_ROOT}/alpha/KXBTC15M/aggregate-summary.json`;

    const exitCode = runBuildResearchReportCommand(
      ["--output", OUTPUT_PATH],
      {
        readdir: (path) => {
          if (path === INPUT_ROOT) {
            return ["alpha"];
          }
          if (path === `${INPUT_ROOT}/alpha`) {
            return ["KXBTC15M"];
          }
          if (path === `${INPUT_ROOT}/alpha/KXBTC15M`) {
            return ["aggregate-summary.json"];
          }
          return [];
        },
        readFile: (path) => {
          if (path === aggregatePath) {
            return createAggregateSummary("alpha");
          }
          throw new Error(`Missing file: ${path}`);
        },
        fileExists: (path) => path === aggregatePath,
        isDirectory: (path) =>
          path === INPUT_ROOT
          || path === `${INPUT_ROOT}/alpha`
          || path === `${INPUT_ROOT}/alpha/KXBTC15M`,
        writeStdout: (text) => {
          stdout += text;
        },
        writeStderr: () => {},
        writeFile: (path, data) => {
          writes.set(path, data);
        },
        mkdirSync: () => {},
      },
      { generatedAt: GENERATED_AT },
    );

    expect(exitCode).toBe(0);
    const html = writes.get(OUTPUT_PATH);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("alpha");
    expect(JSON.parse(stdout).outputPath).toBe(OUTPUT_PATH);
  });

  it("writes empty-state HTML when no inputs exist", () => {
    const writes = new Map<string, string>();

    const exitCode = runBuildResearchReportCommand(
      ["--output", OUTPUT_PATH],
      {
        readdir: () => [],
        readFile: () => {
          throw new Error("should not read");
        },
        fileExists: () => false,
        isDirectory: () => false,
        writeStdout: () => {},
        writeStderr: () => {},
        writeFile: (path, data) => {
          writes.set(path, data);
        },
        mkdirSync: () => {},
      },
      { generatedAt: GENERATED_AT },
    );

    expect(exitCode).toBe(0);
    expect(writes.get(OUTPUT_PATH)).toContain("No Research Data");
  });
});
