import { describe, expect, it, vi } from "vitest";

import { DataSource } from "@/lib/data/provenance";
import { SILVER_BRONZE_CONTENT_TYPE } from "@/lib/data/silver";
import type { RawHistoricalRecord } from "@/lib/data/types";
import { DATASET_BRONZE_CONTENT_TYPE } from "@/lib/data/datasets/datasetTypes";
import { stableStringify } from "@/lib/trading/config/hashConfig";
import type { HistoricalResearchCliInputDocument } from "@/lib/data/fixtures";
import { runHistoricalResearchFromBronze } from "@/lib/data/research/runner";
import { StrategyPluginRegistry } from "@/lib/data/strategies/plugin/StrategyPluginRegistry";
import { DEFAULT_ENGINE_CONFIG } from "@/lib/trading/config/defaults";
import { DEFAULT_BACKTEST_FILL_SIMULATION_CONFIG } from "@/lib/data/backtesting/strategyTypes";

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

function baseBronze(
  contentType: string,
  payload: Record<string, unknown>,
  options: {
    recordId: string;
    ticker: string;
    eventTime: string;
  },
): RawHistoricalRecord {
  return {
    recordId: options.recordId,
    ticker: options.ticker,
    contentType,
    eventTime: options.eventTime,
    collectionTime: "2026-06-27T01:00:00.000Z",
    observedAt: "2026-06-27T01:00:05.000Z",
    payload,
    provenance: {
      source: DataSource.KALSHI_REST,
      collectionTime: "2026-06-27T01:00:00.000Z",
      observedAt: "2026-06-27T01:00:05.000Z",
      fetchId: `fetch-${options.recordId}`,
    },
  };
}

function createFixtureDocument(marketTicker: string): HistoricalResearchCliInputDocument {
  const eventTime = "2026-06-26T23:15:00.000Z";
  const closeTime = "2026-06-26T23:30:00.000Z";

  return {
    runId: `fixture-${marketTicker}`,
    durationMs: 3_000,
    initialCashCents: 10_000,
    strategyId: "noop",
    engineConfig: DEFAULT_ENGINE_CONFIG,
    fillConfig: {
      ...DEFAULT_BACKTEST_FILL_SIMULATION_CONFIG,
      feeCentsPerContract: 1,
    },
    bronzeRecords: [
      baseBronze(
        SILVER_BRONZE_CONTENT_TYPE.MARKET,
        {
          open_time: eventTime,
          close_time: closeTime,
          floor_strike: 59_990.31,
          event_ticker: "KXBTC15M-EVENT",
          status: "closed",
        },
        { recordId: "market", ticker: marketTicker, eventTime },
      ),
      baseBronze(
        SILVER_BRONZE_CONTENT_TYPE.CANDLESTICK,
        {
          open_time: eventTime,
          close_time: closeTime,
          yes_bid_cents: 48,
          yes_ask_cents: 52,
          no_bid_cents: 47,
          no_ask_cents: 51,
          volume_contracts: 120,
        },
        { recordId: "candle", ticker: marketTicker, eventTime: closeTime },
      ),
      baseBronze(
        DATASET_BRONZE_CONTENT_TYPE.BTC_KLINE,
        {
          open_time: eventTime,
          close_time: closeTime,
          open_usd: 59_980.5,
          high_usd: 60_010.25,
          low_usd: 59_960.0,
          close_usd: 59_995.75,
          volume_btc: 12.5,
        },
        { recordId: "btc", ticker: marketTicker, eventTime: closeTime },
      ),
      baseBronze(
        SILVER_BRONZE_CONTENT_TYPE.SETTLEMENT,
        {
          floor_strike: 59_990.31,
          expiration_value: "60010.25",
          result: "yes",
          settlement_ts: closeTime,
        },
        { recordId: "settlement", ticker: marketTicker, eventTime },
      ),
    ],
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

function productionResearchFn(): WalkForwardSweepRunnerDeps["runResearch"] {
  const strategyRegistry = StrategyPluginRegistry.createBuiltIn();

  return ({ fixture, strategyId, strategyConfig }) =>
    runHistoricalResearchFromBronze({
      bronzeRecords: fixture.bronzeRecords,
      strategy: strategyRegistry.resolveBacktestStrategy(strategyId, strategyConfig),
      engineConfig: fixture.engineConfig,
      initialCashCents: fixture.initialCashCents,
      runId: fixture.runId,
      durationMs: fixture.durationMs,
      fillConfig: fixture.fillConfig,
      costModelConfig: fixture.costModelConfig,
    }).serialized;
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
      ?? productionResearchFn(),
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
    const production = productionResearchFn();
    const runResearch = vi.fn(({ fixture, strategyId, strategyConfig }) => {
      if (fixture.runId.includes(marketB)) {
        throw new Error("simulated failure");
      }

      return production({ fixture, strategyId, strategyConfig });
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
