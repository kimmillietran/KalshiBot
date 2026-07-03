import { describe, expect, it } from "vitest";

import { runStrategyHarnessCommand } from "./runStrategyHarness";
import type { HistoricalResearchCliInputDocument } from "./types";

describe("runStrategyHarnessCommand", () => {
  it("returns non-zero when synthesis file is missing", async () => {
    let stderr = "";

    const exitCode = await runStrategyHarnessCommand([], {
      readFile: () => "",
      fileExists: () => false,
      writeStdout: () => {},
      writeStderr: (text) => {
        stderr += text;
      },
      writeFile: () => {},
      mkdirSync: () => {},
      readdir: () => [],
      isDirectory: () => false,
    });

    expect(exitCode).toBe(1);
    expect(stderr).toContain("Missing strategy synthesis file");
  });

  it("writes summary metadata on success", async () => {
    let stdout = "";
    const synthesisPath = "data/research-results/strategy-synthesis-candidates.json";
    const registryPath = "data/research-datasets/KXBTC15M/dataset-registry.json";
    const fixturePath = "data/fixtures/KXBTC15M/market-a.json";

    const exitCode = await runStrategyHarnessCommand(
      ["--synthesis", synthesisPath, "--registry-dir", "data/research-datasets"],
      {
        readFile: (path) => {
          if (path === synthesisPath) {
            return JSON.stringify({
              generatedAt: "2026-07-03T12:00:00.000Z",
              outputPath: synthesisPath,
              inputs: {},
              strategies: [
                {
                  strategyId: "synth-atlas-vol-high-over",
                  hypothesisId: "atlas-volatility-vol-high-over",
                  strategyFamily: "calibration-fade",
                  direction: "fade-yes",
                  entryConditions: { yesMidThresholdCents: 55 },
                  exitAssumption: "Hold to settlement",
                  requiredData: [],
                  riskNotes: [],
                  validationSummary: {
                    robustnessScore: 84,
                    passes: true,
                    observationCount: 12,
                  },
                  promotionStatus: "candidate",
                },
              ],
              summary: {},
            });
          }

          if (path === registryPath) {
            return JSON.stringify({
              seriesTicker: "KXBTC15M",
              markets: [
                {
                  seriesTicker: "KXBTC15M",
                  marketTicker: "MARKET-A",
                  fixturePath,
                },
              ],
            });
          }

          return "{}";
        },
        fileExists: (path) => path !== "data/research-results/harness/synth-atlas-vol-high-over/KXBTC15M/MARKET-A/research-output.json",
        readdir: (path) =>
          path.endsWith("KXBTC15M") ? ["dataset-registry.json"] : ["KXBTC15M"],
        isDirectory: (path) =>
          path.endsWith("research-datasets") || path.endsWith("KXBTC15M"),
        writeStdout: (text) => {
          stdout += text;
        },
        writeStderr: () => {},
        writeFile: () => {},
        mkdirSync: () => {},
      },
      {
        runEvaluation: () => JSON.stringify({ metadata: { runId: "harness-run" } }),
        parseFixtureJson: () =>
          ({
            bronzeRecords: [{ recordId: "r1" }],
            strategyId: "noop",
            engineConfig: {
              enabled: true,
              minEdgePercent: 1,
              minLiquidityQuality: "Fair",
              maxSpreadPercent: 10,
              minimumTimeRemaining: 0,
              minimumCandles: 0,
            },
            initialCashCents: 10_000,
            runId: "fixture-run",
            durationMs: 1_000,
          }) as HistoricalResearchCliInputDocument,
      },
    );

    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout).successfulRuns).toBe(1);
  });
});
