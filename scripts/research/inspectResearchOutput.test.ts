import { describe, expect, it } from "vitest";

import { runInspectResearchOutputCommand } from "./inspectResearchOutput";

const MARKET_TICKER = "KXBTC15M-26APR281945-45";
const STRATEGY_ID = "buy-first-ask";

function createRunnerOutputJson(): string {
  const backtestResult = {
    replayResult: {
      results: [{ stepIndex: 0 }],
    },
    strategyRun: {
      strategyId: STRATEGY_ID,
      steps: [
        {
          stepIndex: 0,
          acceptedFills: [
            {
              fillId: "sim-fill-000001",
              intentId: "intent-000001",
              ticker: MARKET_TICKER,
              side: "yes",
              action: "buy",
              priceCents: 52,
              quantity: 1,
            },
          ],
          rejectedIntents: [],
        },
      ],
    },
    metrics: {
      totalPnlCents: 250,
      netPnlCents: 240,
      grossPnlCents: 250,
      tradeCount: 1,
      totalReturnPct: 0.25,
      maxDrawdownPct: 1.5,
      sharpeRatio: 1.2,
      winRatePct: 100,
      lossRatePct: 0,
      winningTradeCount: 1,
      losingTradeCount: 0,
    },
  };

  return JSON.stringify({
    dataset: JSON.stringify({
      metadata: { marketTickers: [MARKET_TICKER] },
    }),
    researchRun: JSON.stringify({
      config: { runId: "run-001", strategyId: STRATEGY_ID },
      backtestResult: JSON.stringify(backtestResult),
    }),
    metadata: {
      runId: "run-001",
      strategyId: STRATEGY_ID,
    },
    diagnostics: {
      decisionCount: 1,
      zeroPriceDecisionCount: 0,
      nonZeroPriceDecisionCount: 1,
      percentZeroPriceDecisions: 0,
      warnings: [],
    },
  });
}

function createIo(files: Record<string, string>) {
  let stdout = "";
  let stderr = "";

  return {
    io: {
      readFile: (path: string) => {
        const content = files[path];
        if (content === undefined) {
          throw new Error(`Missing file: ${path}`);
        }
        return content;
      },
      writeStdout: (text: string) => {
        stdout += text;
      },
      writeStderr: (text: string) => {
        stderr += text;
      },
      readdir: (path: string) => {
        const entries = new Set<string>();
        for (const filePath of Object.keys(files)) {
          const normalized = filePath.replace(/\\/g, "/");
          const normalizedDir = path.replace(/\\/g, "/");
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
      fileExists: (path: string) => files[path] !== undefined,
      isDirectory: (path: string) =>
        Object.keys(files).some((filePath) =>
          filePath.replace(/\\/g, "/").startsWith(`${path.replace(/\\/g, "/")}/`),
        ),
    },
    getStdout: () => stdout,
    getStderr: () => stderr,
  };
}

describe("runInspectResearchOutputCommand", () => {
  it("inspects a single research-output.json file", () => {
    const inputPath = `data/research-results/${STRATEGY_ID}/KXBTC15M/${MARKET_TICKER}/research-output.json`;
    const { io, getStdout } = createIo({
      [inputPath]: createRunnerOutputJson(),
    });

    const exitCode = runInspectResearchOutputCommand(
      ["--input", inputPath],
      io,
    );

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(getStdout());
    expect(parsed.strategyId).toBe(STRATEGY_ID);
    expect(parsed.marketTicker).toBe(MARKET_TICKER);
    expect(parsed.acceptedFillCount).toBe(1);
    expect(parsed.diagnostics.decisionCount).toBe(1);
  });

  it("normalizes equals-style Windows npm argv for --input", () => {
    const inputPath = `data/research-results/${STRATEGY_ID}/KXBTC15M/${MARKET_TICKER}/research-output.json`;
    const { io, getStdout } = createIo({
      [inputPath]: createRunnerOutputJson(),
    });

    const exitCode = runInspectResearchOutputCommand(
      [`--input=${inputPath}`],
      io,
    );

    expect(exitCode).toBe(0);
    expect(JSON.parse(getStdout()).runId).toBe("run-001");
  });

  it("fails clearly on invalid JSON", () => {
    const inputPath = "research-output.json";
    const { io, getStderr } = createIo({
      [inputPath]: "{bad-json",
    });

    const exitCode = runInspectResearchOutputCommand(
      ["--input", inputPath],
      io,
    );

    expect(exitCode).toBe(1);
    expect(getStderr()).toContain("invalid JSON");
  });

  it("scans an input directory with strategy filter and limit", () => {
    const inputRoot = "data/research-results";
    const firstPath = `${inputRoot}/${STRATEGY_ID}/KXBTC15M/${MARKET_TICKER}/research-output.json`;
    const secondPath = `${inputRoot}/${STRATEGY_ID}/KXBTC15M/KXBTC15M-MARKET-B/research-output.json`;
    const noopPath = `${inputRoot}/noop/KXBTC15M/${MARKET_TICKER}/research-output.json`;

    const { io, getStdout } = createIo({
      [firstPath]: createRunnerOutputJson(),
      [secondPath]: createRunnerOutputJson(),
      [noopPath]: createRunnerOutputJson(),
    });

    const exitCode = runInspectResearchOutputCommand(
      ["--input-dir", inputRoot, "--strategy", STRATEGY_ID, "--limit", "1"],
      io,
    );

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(getStdout());
    expect(parsed).toHaveLength(1);
    expect(parsed[0].inputPath).toBe(firstPath);
  });

  it("reports missing fields for incomplete runner output", () => {
    const inputPath = "research-output.json";
    const { io, getStdout } = createIo({
      [inputPath]: JSON.stringify({
        dataset: JSON.stringify({
          metadata: { marketTickers: [MARKET_TICKER] },
        }),
        researchRun: JSON.stringify({
          config: { strategyId: STRATEGY_ID },
        }),
        metadata: { strategyId: STRATEGY_ID },
      }),
    });

    const exitCode = runInspectResearchOutputCommand(
      ["--input", inputPath],
      io,
    );

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(getStdout());
    expect(parsed.missingFields).toContain("backtestResult.metrics");
  });
});
