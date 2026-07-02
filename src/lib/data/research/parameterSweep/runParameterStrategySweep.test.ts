import { describe, expect, it, vi } from "vitest";

import { DataSource } from "@/lib/data/provenance";
import { SILVER_BRONZE_CONTENT_TYPE } from "@/lib/data/silver";
import type { RawHistoricalRecord } from "@/lib/data/types";
import { DATASET_BRONZE_CONTENT_TYPE } from "@/lib/data/datasets/datasetTypes";
import type { HistoricalResearchCliInputDocument } from "@/lib/data/fixtures";
import { StrategyPluginRegistry } from "@/lib/data/strategies/plugin/StrategyPluginRegistry";
import { DEFAULT_ENGINE_CONFIG } from "@/lib/trading/config/defaults";
import { DEFAULT_BACKTEST_FILL_SIMULATION_CONFIG } from "@/lib/data/backtesting/strategyTypes";
import type { StrategySweepFilesystem, StrategySweepRunnerDeps } from "@/lib/data/research/sweep";
import type { StrategySweepSeriesRegistryDocument } from "@/lib/data/research/sweep/parseDatasetRegistryJson";
import { runHistoricalResearchFromBronze } from "@/lib/data/research/runner";

import { buildParameterSweepOutputPath } from "./buildParameterSweepOutputPath";
import { runParameterStrategySweep } from "./runParameterStrategySweep";

const FIXED_NOW = new Date("2026-06-27T12:00:00.000Z");

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
    strategyId: "fair-value-diffusion",
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

function buildRegistry(
  markets: Array<{ marketTicker: string; fixturePath: string }>,
): StrategySweepSeriesRegistryDocument {
  return {
    seriesTicker: "KXBTC15M",
    markets: markets.map(({ marketTicker, fixturePath }) => ({
      seriesTicker: "KXBTC15M",
      marketTicker,
      fixturePath,
      registryPath: "data/research-datasets/KXBTC15M/dataset-registry.json",
      validationStatus: { valid: true },
    })),
  };
}

function createFilesystem(
  registries: Record<string, string>,
  fixtures: Record<string, string>,
): StrategySweepFilesystem & { writes: Map<string, string> } {
  const files = new Map<string, string>([
    ...Object.entries(registries),
    ...Object.entries(fixtures),
  ]);
  const writes = new Map<string, string>();

  return {
    writes,
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
    listRegistryPaths: () =>
      [...Object.keys(registries)].sort((left, right) => left.localeCompare(right)),
  };
}

function productionResearchFn(): StrategySweepRunnerDeps["runResearch"] {
  const strategyRegistry = StrategyPluginRegistry.createBuiltIn();

  return ({ fixture, strategyId, strategyConfig }) => {
    const result = runHistoricalResearchFromBronze({
      bronzeRecords: fixture.bronzeRecords,
      strategy: strategyRegistry.resolveBacktestStrategy(strategyId, strategyConfig),
      engineConfig: fixture.engineConfig,
      initialCashCents: fixture.initialCashCents,
      runId: fixture.runId,
      durationMs: fixture.durationMs,
      fillConfig: fixture.fillConfig,
      costModelConfig: fixture.costModelConfig,
      metricsConfig: fixture.metricsConfig,
    });

    return {
      researchOutput: result.serialized,
      decisionTrace: result.serializedDecisionTrace,
    };
  };
}

function createDeps(
  filesystem: StrategySweepFilesystem,
): StrategySweepRunnerDeps & {
  runResearch: ReturnType<typeof vi.fn<StrategySweepRunnerDeps["runResearch"]>>;
} {
  const runResearch = vi.fn(productionResearchFn());

  return {
    filesystem,
    strategyRegistry: StrategyPluginRegistry.createBuiltIn(),
    parseFixtureJson: (json) => JSON.parse(json) as HistoricalResearchCliInputDocument,
    runResearch,
    now: () => FIXED_NOW,
  };
}

describe("runParameterStrategySweep", () => {
  it("runs markets for each generated parameter set and writes parameter-sweep-summary.json", async () => {
    const marketTicker = "KXBTC15M-MARKET-A";
    const fixturePath = `data/fixtures/KXBTC15M/${marketTicker}/fixture.json`;
    const registryPath = "data/research-datasets/KXBTC15M/dataset-registry.json";
    const filesystem = createFilesystem(
      {
        [registryPath]: JSON.stringify(
          buildRegistry([{ marketTicker, fixturePath }]),
        ),
      },
      {
        [fixturePath]: JSON.stringify(createFixtureDocument(marketTicker)),
      },
    );
    const deps = createDeps(filesystem);
    const outputPathPs1 = buildParameterSweepOutputPath(
      "data/research-results",
      "fair-value-diffusion",
      "ps-0001",
      "KXBTC15M",
      marketTicker,
    );
    const outputPathPs2 = buildParameterSweepOutputPath(
      "data/research-results",
      "fair-value-diffusion",
      "ps-0002",
      "KXBTC15M",
      marketTicker,
    );

    const summary = await runParameterStrategySweep(
      {
        definition: {
          strategyId: "fair-value-diffusion",
          parameters: {
            minimumEdgeThresholdCents: [2, 4],
            volatilityLookbackBars: [10],
          },
        },
        registryDir: "data/research-datasets",
        outputDir: "data/research-results",
      },
      deps,
    );

    expect(deps.runResearch).toHaveBeenCalledTimes(2);
    expect(filesystem.writes.has(outputPathPs1)).toBe(true);
    expect(filesystem.writes.has(outputPathPs2)).toBe(true);
    expect(
      filesystem.writes.has(
        "data/research-results/fair-value-diffusion/parameter-sweep-summary.json",
      ),
    ).toBe(true);
    expect(summary.parameterSets).toHaveLength(2);
    expect(summary.parameterSets[0]).toMatchObject({
      parameterSetId: "ps-0001",
      strategyId: "fair-value-diffusion",
      config: { minimumEdgeThresholdCents: 2, volatilityLookbackBars: 10 },
      totalRuns: 1,
      successfulRuns: 1,
      failedRuns: 0,
    });
    expect(summary.totalRuns).toBe(2);
    expect(summary.successfulRuns).toBe(2);
  });
});
