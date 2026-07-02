import { describe, expect, it } from "vitest";

import type { HistoricalResearchCliInputDocument } from "@/lib/data/fixtures";
import { stableStringify } from "@/lib/trading/config/hashConfig";
import { StrategyPluginRegistry } from "@/lib/data/strategies/plugin/StrategyPluginRegistry";

import { runWalkForwardStrategySweepCommand } from "./runWalkForwardStrategySweep";
import {
  parseConcurrencyFromArgv,
  parseOutputDirFromArgv,
  parseSplitIdFromArgv,
  resolveStrategySelectionFromArgv,
  WalkForwardSweepCommandError,
} from "./walkForwardSweepCommandTypes";

const SPLIT_ID = "wf-cli";
const SPLIT_ROOT = `data/walk-forward/${SPLIT_ID}`;
const SUMMARY_PATH = `${SPLIT_ROOT}/walk-forward-summary.json`;

function minimalValidResearchOutput(marketTicker: string): string {
  const backtestResult = JSON.stringify({
    metrics: {
      totalPnlCents: 0,
      totalReturnPct: 0,
      maxDrawdownPct: 0,
      sharpeRatio: null,
      winRatePct: 0,
      lossRatePct: 0,
      tradeCount: 0,
      winningTradeCount: 0,
      losingTradeCount: 0,
    },
  });
  const researchRun = JSON.stringify({
    durationMs: 1000,
    config: { strategyId: "noop" },
    backtestResult,
  });

  return JSON.stringify({
    dataset: JSON.stringify({ metadata: { marketTickers: [marketTicker] } }),
    researchRun,
    metadata: { durationMs: 1000 },
  });
}

function createIo() {
  const stdout: string[] = [];
  const stderr: string[] = [];

  return {
    io: {
      writeStdout: (text: string) => {
        stdout.push(text);
      },
      writeStderr: (text: string) => {
        stderr.push(text);
      },
    },
    stdout,
    stderr,
  };
}

describe("walk-forward sweep argv parsing", () => {
  it("parses split and output flags", () => {
    expect(parseSplitIdFromArgv(["--split-id", "wf-test"])).toBe("wf-test");
    expect(parseOutputDirFromArgv(["--output-dir", "results"])).toBe("results");
    expect(parseConcurrencyFromArgv(["--concurrency", "2"])).toBe(2);
  });

  it("resolves strategy selection", () => {
    expect(
      resolveStrategySelectionFromArgv(["--strategy", "noop"], () => ["noop", "buy-first-ask"]),
    ).toEqual(["noop"]);
    expect(resolveStrategySelectionFromArgv(["--all"], () => ["noop"])).toEqual(["noop"]);
  });

  it("rejects invalid concurrency", () => {
    expect(() => parseConcurrencyFromArgv(["--concurrency", "0"])).toThrow(
      WalkForwardSweepCommandError,
    );
  });
});

describe("runWalkForwardStrategySweepCommand", () => {
  it("requires split id", async () => {
    const { io, stderr } = createIo();
    const exitCode = await runWalkForwardStrategySweepCommand(["--all"], io);
    expect(exitCode).toBe(1);
    expect(stderr.join("")).toContain("split-id");
  });

  it("runs with injected dependencies", async () => {
    const marketTicker = "KXBTC15M-MARKET-A";
    const fixturePath = `data/fixtures/KXBTC15M/${marketTicker}/fixture.json`;
    const foldPath = `${SPLIT_ROOT}/folds/fold-000.json`;
    const files = new Map<string, string>([
      [SPLIT_ROOT, "dir"],
      [
        SUMMARY_PATH,
        stableStringify({
          splitId: SPLIT_ID,
          folds: [{ foldIndex: 0, outputPath: foldPath }],
        }),
      ],
      [
        foldPath,
        stableStringify({
          foldIndex: 0,
          splitId: SPLIT_ID,
          trainingMarkets: [],
          validationMarkets: [
            {
              seriesTicker: "KXBTC15M",
              marketTicker,
              fixturePath,
              marketCloseTime: "2026-06-26T23:15:00.000Z",
              registryPath: "data/research-datasets/KXBTC15M/dataset-registry.json",
              orderedIndex: 5,
            },
          ],
          metadata: {
            trainingWindowSize: 4,
            validationWindowSize: 1,
            stepSize: 2,
            embargoMarketCount: 1,
            trainingStartIndex: 0,
            trainingEndIndex: 3,
            validationStartIndex: 5,
            validationEndIndex: 5,
            trainingStartCloseTime: "2026-06-26T23:00:00.000Z",
            trainingEndCloseTime: "2026-06-26T23:03:00.000Z",
            validationStartCloseTime: "2026-06-26T23:05:00.000Z",
            validationEndCloseTime: "2026-06-26T23:05:00.000Z",
          },
        }),
      ],
      [
        fixturePath,
        JSON.stringify({
          runId: `fixture-${marketTicker}`,
          durationMs: 1_000,
          initialCashCents: 10_000,
          strategyId: "noop",
          engineConfig: {
            enabled: true,
            minEdgePercent: 1,
            minLiquidityQuality: "Fair",
            maxSpreadPercent: 10,
            minimumTimeRemaining: 60_000,
            minimumCandles: 1,
          },
          fillConfig: {
            feeCentsPerContract: 1,
            allowPartialFills: false,
            priceSource: "engine-input-pricing",
          },
          bronzeRecords: [],
        } satisfies HistoricalResearchCliInputDocument),
      ],
    ]);
    const writes = new Map<string, string>();
    const { io, stdout, stderr } = createIo();

    const exitCode = await runWalkForwardStrategySweepCommand(
      ["--split-id", SPLIT_ID, "--strategy", "noop"],
      io,
      {
        filesystem: {
          exists: (path) => files.has(path) || writes.has(path),
          readFile: (path) => {
            const written = writes.get(path);
            if (written !== undefined) {
              return written;
            }
            const value = files.get(path);
            if (value === undefined) {
              throw new Error(`missing file: ${path}`);
            }
            return value;
          },
          writeFile: (path, data) => {
            writes.set(path, data);
          },
          mkdir: () => undefined,
        },
        strategyRegistry: StrategyPluginRegistry.createBuiltIn(),
        parseFixtureJson: (json) => JSON.parse(json) as HistoricalResearchCliInputDocument,
        runResearch: ({ fixture }) => minimalValidResearchOutput(fixture.runId.replace("fixture-", "")),
        now: () => new Date("2026-06-27T12:00:00.000Z"),
      },
    );

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(stdout[0]).toContain('"splitId":"wf-cli"');
    expect(stdout[0]).toContain('"successfulRuns":1');
  });
});
