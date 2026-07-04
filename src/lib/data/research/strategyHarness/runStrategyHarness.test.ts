import { describe, expect, it } from "vitest";

import { DATASET_REGISTRY_FILENAME } from "@/lib/data/research/batchResearch/batchResearchTypes";
import type { HistoricalResearchCliInput } from "@/lib/data/fixtures/historicalFixtureTypes";

import { runStrategyHarness } from "./runStrategyHarness";
import type { SynthesizedStrategySpec } from "./strategyHarnessTypes";

const GENERATED_AT = "2026-07-03T12:00:00.000Z";

function createSynthesisJson(strategies: SynthesizedStrategySpec[]): string {
  return JSON.stringify({
    generatedAt: GENERATED_AT,
    outputPath: "data/research-results/strategy-synthesis-candidates.json",
    inputs: {},
    strategies,
    summary: { strategyCount: strategies.length },
  });
}

function createRegistryJson(marketTicker: string, fixturePath: string): string {
  return JSON.stringify({
    seriesTicker: "KXBTC15M",
    markets: [
      {
        seriesTicker: "KXBTC15M",
        marketTicker,
        fixturePath,
        validationStatus: { valid: true },
      },
    ],
  });
}

describe("runStrategyHarness", () => {
  it("evaluates synthesized strategies and writes harness outputs", async () => {
    const synthesisPath = "data/research-results/strategy-synthesis-candidates.json";
    const registryPath = `data/research-datasets/KXBTC15M/${DATASET_REGISTRY_FILENAME}`;
    const fixturePath = "data/fixtures/KXBTC15M/market-a.json";
    const outputDir = "data/research-results/harness";

    const writes = new Map<string, string>();
    const files = new Map<string, string>([
      [
        synthesisPath,
        createSynthesisJson([
          {
            strategyId: "synth-atlas-vol-high-over",
            hypothesisId: "atlas-volatility-vol-high-over",
            strategyFamily: "calibration-fade",
            direction: "fade-yes",
            entryConditions: { yesMidThresholdCents: 55 },
            exitAssumption: "Hold to settlement",
            requiredData: ["research-output.json"],
            riskNotes: [],
            validationSummary: {
              robustnessScore: 84,
              passes: true,
              observationCount: 12,
            },
            promotionStatus: "candidate",
          },
        ]),
      ],
      [registryPath, createRegistryJson("MARKET-A", fixturePath)],
      [fixturePath, JSON.stringify({ runId: "fixture-run" })],
    ]);

    const summary = await runStrategyHarness({
      synthesisPath,
      registryDir: "data/research-datasets",
      outputDir,
      io: {
        readFile: (path) => files.get(path) ?? "",
        fileExists: (path) => files.has(path) && !writes.has(path),
        readdir: (path) =>
          path.endsWith("KXBTC15M") ? [DATASET_REGISTRY_FILENAME] : ["KXBTC15M"],
        isDirectory: (path) =>
          path.endsWith("research-datasets") || path.endsWith("KXBTC15M"),
        writeFile: (path, data) => {
          writes.set(path, data);
        },
        mkdir: () => {},
      },
      parseFixtureJson: () =>
        ({
          bronzeRecords: [],
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
        }) as HistoricalResearchCliInput,
      runEvaluation: () => JSON.stringify({ metadata: { runId: "harness-run" } }),
      now: () => new Date(GENERATED_AT),
    });

    expect(summary.evaluatedStrategies).toBe(1);
    expect(summary.successfulRuns).toBe(1);
    expect(
      writes.has(
        "data/research-results/harness/synth-atlas-vol-high-over/KXBTC15M/MARKET-A/research-output.json",
      ),
    ).toBe(true);
    expect(writes.has(`${outputDir}/strategy-harness-summary.json`)).toBe(true);
  });

  it("no-ops with an empty harness summary when rejected strategies are excluded", async () => {
    const synthesisPath = "data/research-results/strategy-synthesis-candidates.json";
    const outputDir = "data/research-results/harness";
    const writes = new Map<string, string>();

    const summary = await runStrategyHarness({
      synthesisPath,
      registryDir: "data/research-datasets",
      outputDir,
      io: {
        readFile: (path) =>
          path === synthesisPath
            ? createSynthesisJson([
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
              ])
            : "",
        fileExists: (path) => path === synthesisPath,
        readdir: () => [],
        isDirectory: () => false,
        writeFile: (path, data) => {
          writes.set(path, data);
        },
        mkdir: () => {},
      },
      parseFixtureJson: () => {
        throw new Error("should not parse fixtures");
      },
      runEvaluation: () => "",
    });

    expect(summary.evaluatedStrategies).toBe(0);
    expect(summary.totalRuns).toBe(0);
    expect(summary.warnings).toEqual([
      "No synthesized strategies matched harness filters; wrote empty strategy-harness-summary.json",
    ]);
    expect(writes.has(`${outputDir}/strategy-harness-summary.json`)).toBe(true);
  });

  it("no-ops when synthesis file contains only rejected strategies with unsupported families", async () => {
    const synthesisPath = "data/research-results/strategy-synthesis-candidates.json";
    const outputDir = "data/research-results/harness";
    const writes = new Map<string, string>();

    const summary = await runStrategyHarness({
      synthesisPath,
      registryDir: "data/research-datasets",
      outputDir,
      io: {
        readFile: (path) =>
          path === synthesisPath
            ? createSynthesisJson([
                {
                  strategyId: "synth-rejected-unsupported",
                  hypothesisId: "atlas-test-over",
                  strategyFamily: "delayed-reaction",
                  direction: "buy-yes",
                  entryConditions: { yesMidThresholdCents: 50 },
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
              ] as SynthesizedStrategySpec[])
            : "",
        fileExists: (path) => path === synthesisPath,
        readdir: () => [],
        isDirectory: () => false,
        writeFile: (path, data) => {
          writes.set(path, data);
        },
        mkdir: () => {},
      },
      parseFixtureJson: () => {
        throw new Error("should not parse fixtures");
      },
      runEvaluation: () => "",
    });

    expect(summary.evaluatedStrategies).toBe(0);
    expect(summary.warnings).toHaveLength(1);
  });

  it("evaluates rejected strategies when includeRejected is enabled", async () => {
    const synthesisPath = "data/research-results/strategy-synthesis-candidates.json";
    const registryPath = `data/research-datasets/KXBTC15M/${DATASET_REGISTRY_FILENAME}`;
    const fixturePath = "data/fixtures/KXBTC15M/market-a.json";
    const outputDir = "data/research-results/harness";

    const summary = await runStrategyHarness({
      synthesisPath,
      registryDir: "data/research-datasets",
      outputDir,
      includeRejected: true,
      io: {
        readFile: (path) => {
          if (path === synthesisPath) {
            return createSynthesisJson([
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
            ]);
          }

          if (path === registryPath) {
            return createRegistryJson("MARKET-A", fixturePath);
          }

          return JSON.stringify({ runId: "fixture-run" });
        },
        fileExists: (path) =>
          path === synthesisPath
          || path === registryPath
          || path === fixturePath,
        readdir: (path) =>
          path.endsWith("KXBTC15M") ? [DATASET_REGISTRY_FILENAME] : ["KXBTC15M"],
        isDirectory: (path) =>
          path.endsWith("research-datasets") || path.endsWith("KXBTC15M"),
        writeFile: () => {},
        mkdir: () => {},
      },
      parseFixtureJson: () =>
        ({
          bronzeRecords: [],
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
        }) as HistoricalResearchCliInput,
      runEvaluation: () => JSON.stringify({ metadata: { runId: "harness-run" } }),
    });

    expect(summary.evaluatedStrategies).toBe(1);
    expect(summary.warnings).toEqual([]);
  });
});
