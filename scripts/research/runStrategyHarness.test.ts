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

  it("accepts --input as an alias for --synthesis", async () => {
    let stdout = "";
    let stderr = "";
    const synthesisPath = "tmp/custom-synthesis.json";

    const exitCode = await runStrategyHarnessCommand(
      ["--input", synthesisPath],
      {
        readFile: (path) =>
          path === synthesisPath
            ? JSON.stringify({
                generatedAt: "2026-07-03T12:00:00.000Z",
                outputPath: synthesisPath,
                inputs: {},
                strategies: [],
                summary: {},
              })
            : "",
        fileExists: (path) => path === synthesisPath,
        readdir: () => [],
        isDirectory: () => false,
        writeStdout: (text) => {
          stdout += text;
        },
        writeStderr: (text) => {
          stderr += text;
        },
        writeFile: () => {},
        mkdirSync: () => {},
      },
    );

    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout).evaluatedStrategies).toBe(0);
    expect(JSON.parse(stdout).warnings).toHaveLength(1);
    expect(stderr).toBe(
      "warning: No synthesized strategies matched harness filters; wrote empty strategy-harness-summary.json\n",
    );
  });

  it("returns non-zero for malformed synthesis JSON", async () => {
    let stderr = "";
    const synthesisPath = "data/research-results/strategy-synthesis-candidates.json";

    const exitCode = await runStrategyHarnessCommand(
      ["--synthesis", synthesisPath],
      {
        readFile: () => "{not-json",
        fileExists: () => true,
        writeStdout: () => {},
        writeStderr: (text) => {
          stderr += text;
        },
        writeFile: () => {},
        mkdirSync: () => {},
        readdir: () => [],
        isDirectory: () => false,
      },
    );

    expect(exitCode).toBe(1);
    expect(stderr).toContain("Invalid JSON");
  });

  it("includes rejected strategies when --include-rejected is passed", async () => {
    let stdout = "";
    const synthesisPath = "data/research-results/strategy-synthesis-candidates.json";
    const registryPath = "data/research-datasets/KXBTC15M/dataset-registry.json";
    const fixturePath = "data/fixtures/KXBTC15M/market-a.json";

    const exitCode = await runStrategyHarnessCommand(
      [
        "--synthesis",
        synthesisPath,
        "--registry-dir",
        "data/research-datasets",
        "--include-rejected",
      ],
      {
        readFile: (path) => {
          if (path === synthesisPath) {
            return JSON.stringify({
              generatedAt: "2026-07-03T12:00:00.000Z",
              outputPath: synthesisPath,
              inputs: {},
              strategies: [
                {
                  strategyId: "synth-rejected",
                  hypothesisId: "atlas-test-over",
                  strategyFamily: "calibration-fade",
                  direction: "fade-yes",
                  entryConditions: { yesMidThresholdCents: 55 },
                  exitAssumption: "Hold to settlement",
                  requiredData: [],
                  riskNotes: [],
                  validationSummary: {
                    robustnessScore: 20,
                    passes: false,
                    observationCount: 2,
                  },
                  promotionStatus: "rejected",
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
        fileExists: (path) =>
          path === synthesisPath
          || path === registryPath
          || path === fixturePath,
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
    expect(JSON.parse(stdout).evaluatedStrategies).toBe(1);
    expect(JSON.parse(stdout).warnings).toEqual([]);
  });

  it("runs research-only backtest mode with metadata on stdout", async () => {
    let stdout = "";
    const synthesisPath = "data/research-results/strategy-synthesis-candidates.json";
    const failureAnalysisPath = "data/research-results/hypothesis-failure-analysis.json";
    const registryPath = "data/research-datasets/KXBTC15M/dataset-registry.json";
    const fixturePath = "data/fixtures/KXBTC15M/market-a.json";

    const exitCode = await runStrategyHarnessCommand(
      [
        "--input",
        synthesisPath,
        "--registry-dir",
        "data/research-datasets",
        "--research-only-backtest",
      ],
      {
        readFile: (path) => {
          if (path === synthesisPath) {
            return JSON.stringify({
              generatedAt: "2026-07-03T12:00:00.000Z",
              outputPath: synthesisPath,
              inputs: {},
              strategies: [
                {
                  strategyId: "synth-rejected-near-promising",
                  hypothesisId: "hypothesis-a",
                  strategyFamily: "calibration-fade",
                  direction: "fade-yes",
                  entryConditions: { yesMidThresholdCents: 55 },
                  exitAssumption: "Hold to settlement",
                  requiredData: [],
                  riskNotes: [],
                  validationSummary: {
                    robustnessScore: 58,
                    passes: false,
                    observationCount: 12,
                  },
                  promotionStatus: "rejected",
                },
              ],
              summary: {},
            });
          }

          if (path === failureAnalysisPath) {
            return JSON.stringify({
              analyses: [
                {
                  hypothesisId: "hypothesis-a",
                  priorityCategory: "near-promising",
                },
              ],
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
        fileExists: (path) =>
          path === synthesisPath
          || path === failureAnalysisPath
          || path === registryPath
          || path === fixturePath,
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

    const payload = JSON.parse(stdout);
    expect(exitCode).toBe(0);
    expect(payload.runMode).toBe("research-only");
    expect(payload.researchOnlyBacktest).toBe(true);
    expect(payload.includedRejectedStrategies).toBe(true);
    expect(payload.promotionEligible).toBe(false);
    expect(payload.evaluatedStrategies).toBe(1);
    expect(payload.outputDir).toBe("data/research-results/harness-research-only");
  });

  it("returns non-zero when research-only and include-rejected are both set", async () => {
    let stderr = "";

    const exitCode = await runStrategyHarnessCommand(
      ["--research-only-backtest", "--include-rejected"],
      {
        readFile: () => "",
        fileExists: () => true,
        writeStdout: () => {},
        writeStderr: (text) => {
          stderr += text;
        },
        writeFile: () => {},
        mkdirSync: () => {},
        readdir: () => [],
        isDirectory: () => false,
      },
    );

    expect(exitCode).toBe(1);
    expect(stderr).toContain("cannot be combined");
  });
});
