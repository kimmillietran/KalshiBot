import { describe, expect, it, vi } from "vitest";

import { stableStringify } from "@/lib/trading/config/hashConfig";
import type { HistoricalResearchCliInputDocument } from "@/lib/data/fixtures";
import { StrategyPluginRegistry } from "@/lib/data/strategies/plugin/StrategyPluginRegistry";

import { buildWalkForwardSweepOutputPath } from "./discoverWalkForwardSplit";
import { runWalkForwardStrategySweep } from "./runWalkForwardStrategySweep";
import {
  WalkForwardSweepError,
  WalkForwardSweepErrorCode,
} from "./walkForwardSweepTypes";
import type { WalkForwardSweepFilesystem, WalkForwardSweepRunnerDeps } from "./walkForwardSweepTypes";

const FIXED_NOW = new Date("2026-06-27T12:00:00.000Z");
const SPLIT_ID = "wf-sweep";
const SPLIT_ROOT = `data/walk-forward/${SPLIT_ID}`;
const SUMMARY_PATH = `${SPLIT_ROOT}/walk-forward-summary.json`;

function createFixtureDocument(marketTicker: string): HistoricalResearchCliInputDocument {
  return {
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
  };
}

function createFoldJson(
  foldIndex: number,
  validationMarkets: Array<{ marketTicker: string; fixturePath: string; orderedIndex: number }>,
): string {
  return stableStringify({
    foldIndex,
    splitId: SPLIT_ID,
    trainingMarkets: [],
    validationMarkets: validationMarkets.map((market) => ({
      seriesTicker: "KXBTC15M",
      marketTicker: market.marketTicker,
      fixturePath: market.fixturePath,
      marketCloseTime: "2026-06-26T23:15:00.000Z",
      registryPath: "data/research-datasets/KXBTC15M/dataset-registry.json",
      orderedIndex: market.orderedIndex,
    })),
    metadata: {
      trainingWindowSize: 4,
      validationWindowSize: validationMarkets.length,
      stepSize: 2,
      embargoMarketCount: 1,
      trainingStartIndex: 0,
      trainingEndIndex: 3,
      validationStartIndex: 5,
      validationEndIndex: 5 + validationMarkets.length - 1,
      trainingStartCloseTime: "2026-06-26T23:00:00.000Z",
      trainingEndCloseTime: "2026-06-26T23:03:00.000Z",
      validationStartCloseTime: "2026-06-26T23:05:00.000Z",
      validationEndCloseTime: "2026-06-26T23:07:00.000Z",
    },
  });
}

function createSplitFilesystem(
  folds: Array<{
    foldIndex: number;
    markets: Array<{ marketTicker: string; fixturePath: string; orderedIndex: number }>;
  }>,
  fixtures: Record<string, string>,
): WalkForwardSweepFilesystem {
  const foldPaths = folds.map((fold) => ({
    foldIndex: fold.foldIndex,
    outputPath: `${SPLIT_ROOT}/folds/fold-${String(fold.foldIndex).padStart(3, "0")}.json`,
  }));
  const files = new Map<string, string>([
    [SPLIT_ROOT, "dir"],
    [
      SUMMARY_PATH,
      stableStringify({
        splitId: SPLIT_ID,
        registryDir: "data/research-datasets",
        outputDir: "data/walk-forward",
        summaryPath: SUMMARY_PATH,
        generatedAt: "2026-06-27T12:00:00.000Z",
        config: {
          splitId: SPLIT_ID,
          trainingWindowSize: 4,
          validationWindowSize: 2,
          stepSize: 2,
          embargoMarketCount: 1,
          allowOverlappingValidationWindows: true,
        },
        orderedMarketCount: 10,
        foldCount: folds.length,
        folds: foldPaths,
      }),
    ],
    ...Object.entries(fixtures),
  ]);

  for (let index = 0; index < folds.length; index += 1) {
    const fold = folds[index];
    const foldPath = foldPaths[index]?.outputPath;
    if (!fold || !foldPath) {
      continue;
    }
    files.set(foldPath, createFoldJson(fold.foldIndex, fold.markets));
  }

  const writes = new Map<string, string>();

  return {
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
  };
}

function createDeps(
  filesystem: WalkForwardSweepFilesystem,
  runResearch?: WalkForwardSweepRunnerDeps["runResearch"],
): WalkForwardSweepRunnerDeps {
  return {
    filesystem,
    strategyRegistry: StrategyPluginRegistry.createBuiltIn(),
    parseFixtureJson: (json) => JSON.parse(json) as HistoricalResearchCliInputDocument,
    runResearch:
      runResearch
      ?? (({ fixture, strategyId }) =>
        `{"runId":"${fixture.runId}","strategyId":"${strategyId}"}`),
    now: () => FIXED_NOW,
  };
}

describe("runWalkForwardStrategySweep", () => {
  it("runs folds, strategies, and validation markets in deterministic order", async () => {
    const marketA = "KXBTC15M-MARKET-A";
    const marketB = "KXBTC15M-MARKET-B";
    const fixtureAPath = `data/fixtures/KXBTC15M/${marketA}/fixture.json`;
    const fixtureBPath = `data/fixtures/KXBTC15M/${marketB}/fixture.json`;
    const filesystem = createSplitFilesystem(
      [
        {
          foldIndex: 0,
          markets: [{ marketTicker: marketA, fixturePath: fixtureAPath, orderedIndex: 5 }],
        },
        {
          foldIndex: 1,
          markets: [{ marketTicker: marketB, fixturePath: fixtureBPath, orderedIndex: 7 }],
        },
      ],
      {
        [fixtureAPath]: JSON.stringify(createFixtureDocument(marketA)),
        [fixtureBPath]: JSON.stringify(createFixtureDocument(marketB)),
      },
    );
    const runOrder: string[] = [];
    const runResearch = vi.fn(({ strategyId, fixture }) => {
      runOrder.push(`${strategyId}:${fixture.runId}`);
      return `{"runId":"${fixture.runId}","strategyId":"${strategyId}"}`;
    });

    await runWalkForwardStrategySweep(
      {
        splitId: SPLIT_ID,
        outputDir: "data/walk-forward-results",
        strategyIds: ["buy-first-ask", "noop"],
      },
      createDeps(filesystem, runResearch),
    );

    expect(runOrder).toEqual([
      "buy-first-ask:fixture-KXBTC15M-MARKET-A",
      "noop:fixture-KXBTC15M-MARKET-A",
      "buy-first-ask:fixture-KXBTC15M-MARKET-B",
      "noop:fixture-KXBTC15M-MARKET-B",
    ]);
  });

  it("writes validation-only outputs and preserves fold metadata in summary runs", async () => {
    const marketTicker = "KXBTC15M-MARKET-A";
    const fixturePath = `data/fixtures/KXBTC15M/${marketTicker}/fixture.json`;
    const outputPath = buildWalkForwardSweepOutputPath(
      "data/walk-forward-results",
      SPLIT_ID,
      0,
      "noop",
      "KXBTC15M",
      marketTicker,
    );
    const filesystem = createSplitFilesystem(
      [
        {
          foldIndex: 0,
          markets: [{ marketTicker, fixturePath, orderedIndex: 5 }],
        },
      ],
      {
        [fixturePath]: JSON.stringify(createFixtureDocument(marketTicker)),
      },
    );

    const summary = await runWalkForwardStrategySweep(
      {
        splitId: SPLIT_ID,
        outputDir: "data/walk-forward-results",
        strategyIds: ["noop"],
      },
      createDeps(filesystem),
    );

    expect(summary.foldsExecuted).toBe(1);
    expect(summary.strategiesExecuted).toEqual(["noop"]);
    expect(summary.marketsEvaluated).toBe(1);
    expect(summary.runs[0]).toMatchObject({
      foldIndex: 0,
      strategyId: "noop",
      marketTicker,
      outputPath,
      status: "success",
      foldMetadata: {
        validationStartIndex: 5,
      },
    });
    expect(filesystem.readFile(outputPath)).toContain(`"runId":"fixture-${marketTicker}"`);
    expect(filesystem.readFile(summary.summaryPath)).toContain('"successfulRuns":1');
  });

  it("continues after partial failures", async () => {
    const marketA = "KXBTC15M-MARKET-A";
    const marketB = "KXBTC15M-MARKET-B";
    const fixtureAPath = `data/fixtures/KXBTC15M/${marketA}/fixture.json`;
    const fixtureBPath = `data/fixtures/KXBTC15M/${marketB}/fixture.json`;
    const filesystem = createSplitFilesystem(
      [
        {
          foldIndex: 0,
          markets: [
            { marketTicker: marketA, fixturePath: fixtureAPath, orderedIndex: 5 },
            { marketTicker: marketB, fixturePath: fixtureBPath, orderedIndex: 6 },
          ],
        },
      ],
      {
        [fixtureAPath]: JSON.stringify(createFixtureDocument(marketA)),
      },
    );
    const runResearch = vi.fn(({ fixture }) => {
      if (fixture.runId.includes(marketB)) {
        throw new Error("simulated failure");
      }
      return `{"runId":"${fixture.runId}"}`;
    });

    const summary = await runWalkForwardStrategySweep(
      {
        splitId: SPLIT_ID,
        outputDir: "data/walk-forward-results",
        strategyIds: ["noop"],
      },
      createDeps(filesystem, runResearch),
    );

    expect(summary.totalRuns).toBe(2);
    expect(summary.successfulRuns).toBe(1);
    expect(summary.failedRuns).toBe(1);
    expect(summary.runs.find((run) => run.marketTicker === marketB)).toMatchObject({
      status: "failed",
    });
  });

  it("rejects unknown strategy ids", async () => {
    const marketTicker = "KXBTC15M-MARKET-A";
    const fixturePath = `data/fixtures/KXBTC15M/${marketTicker}/fixture.json`;
    const filesystem = createSplitFilesystem(
      [
        {
          foldIndex: 0,
          markets: [{ marketTicker, fixturePath, orderedIndex: 5 }],
        },
      ],
      {
        [fixturePath]: JSON.stringify(createFixtureDocument(marketTicker)),
      },
    );

    await expect(
      runWalkForwardStrategySweep(
        {
          splitId: SPLIT_ID,
          outputDir: "data/walk-forward-results",
          strategyIds: ["missing-strategy"],
        },
        createDeps(filesystem),
      ),
    ).rejects.toThrow(WalkForwardSweepError);

    try {
      await runWalkForwardStrategySweep(
        {
          splitId: SPLIT_ID,
          outputDir: "data/walk-forward-results",
          strategyIds: ["missing-strategy"],
        },
        createDeps(filesystem),
      );
    } catch (error) {
      expect((error as WalkForwardSweepError).code).toBe(
        WalkForwardSweepErrorCode.UNKNOWN_STRATEGY_ID,
      );
    }
  });
});
