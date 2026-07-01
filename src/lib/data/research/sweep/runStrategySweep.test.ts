import { describe, expect, it, vi } from "vitest";

import { DataSource } from "@/lib/data/provenance";
import { SILVER_BRONZE_CONTENT_TYPE } from "@/lib/data/silver";
import type { RawHistoricalRecord } from "@/lib/data/types";
import { DATASET_BRONZE_CONTENT_TYPE } from "@/lib/data/datasets/datasetTypes";
import type { HistoricalResearchCliInputDocument } from "@/lib/data/fixtures";
import { runHistoricalResearchFromBronze } from "@/lib/data/research/runner";
import { StrategyPluginRegistry } from "@/lib/data/strategies/plugin/StrategyPluginRegistry";
import { DEFAULT_ENGINE_CONFIG } from "@/lib/trading/config/defaults";
import { DEFAULT_BACKTEST_FILL_SIMULATION_CONFIG } from "@/lib/data/backtesting/strategyTypes";

import { buildStrategySweepOutputPath } from "./buildStrategySweepOutputPath";
import { runStrategySweep } from "./runStrategySweep";
import {
  StrategySweepError,
  StrategySweepErrorCode,
  type StrategySweepFilesystem,
  type StrategySweepRunnerDeps,
} from "./strategySweepTypes";
import type { StrategySweepSeriesRegistryDocument } from "./parseDatasetRegistryJson";

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

function createFixtureDocument(
  marketTicker: string,
  options?: { strategyConfig?: Record<string, unknown> },
): HistoricalResearchCliInputDocument {
  const eventTime = "2026-06-26T23:15:00.000Z";
  const closeTime = "2026-06-26T23:30:00.000Z";

  return {
    runId: `fixture-${marketTicker}`,
    durationMs: 3_000,
    initialCashCents: 10_000,
    strategyId: "noop",
    ...(options?.strategyConfig ? { strategyConfig: options.strategyConfig } : {}),
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
  markets: Array<{ marketTicker: string; fixturePath: string; valid?: boolean }>,
): StrategySweepSeriesRegistryDocument {
  return {
    seriesTicker: "KXBTC15M",
    markets: markets.map(({ marketTicker, fixturePath, valid = true }) => ({
      seriesTicker: "KXBTC15M",
      marketTicker,
      fixturePath,
      registryPath: "data/research-datasets/KXBTC15M/dataset-registry.json",
      validationStatus: { valid },
    })),
  };
}

function createFilesystem(
  registries: Record<string, string>,
  fixtures: Record<string, string>,
): StrategySweepFilesystem {
  const files = new Map<string, string>([
    ...Object.entries(registries),
    ...Object.entries(fixtures),
  ]);
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
    listRegistryPaths: () =>
      [...Object.keys(registries)].sort((left, right) => left.localeCompare(right)),
  };
}

function productionResearchFn(): StrategySweepRunnerDeps["runResearch"] {
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
    }).serialized;
}

function createDeps(
  filesystem: StrategySweepFilesystem,
  runResearch?: StrategySweepRunnerDeps["runResearch"],
): StrategySweepRunnerDeps {
  return {
    filesystem,
    strategyRegistry: StrategyPluginRegistry.createBuiltIn(),
    parseFixtureJson: (json) => JSON.parse(json) as HistoricalResearchCliInputDocument,
    runResearch: runResearch ?? productionResearchFn(),
    now: () => FIXED_NOW,
  };
}

describe("buildStrategySweepOutputPath", () => {
  it("maps strategy, series, and market tickers to research-output.json", () => {
    expect(
      buildStrategySweepOutputPath(
        "data/research-results",
        "noop",
        "KXBTC15M",
        "KXBTC15M-MARKET-A",
      ),
    ).toBe(
      "data/research-results/noop/KXBTC15M/KXBTC15M-MARKET-A/research-output.json",
    );
  });
});

describe("runStrategySweep", () => {
  it("runs strategies in deterministic strategy then market order", async () => {
    const marketB = "KXBTC15M-MARKET-B";
    const marketA = "KXBTC15M-MARKET-A";
    const fixtureBPath = `data/fixtures/KXBTC15M/${marketB}/fixture.json`;
    const fixtureAPath = `data/fixtures/KXBTC15M/${marketA}/fixture.json`;
    const registryPath = "data/research-datasets/KXBTC15M/dataset-registry.json";
    const filesystem = createFilesystem(
      {
        [registryPath]: JSON.stringify(
          buildRegistry([
            { marketTicker: marketB, fixturePath: fixtureBPath },
            { marketTicker: marketA, fixturePath: fixtureAPath },
          ]),
        ),
      },
      {
        [fixtureBPath]: JSON.stringify(createFixtureDocument(marketB)),
        [fixtureAPath]: JSON.stringify(createFixtureDocument(marketA)),
      },
    );
    const runOrder: string[] = [];
    const runResearch = vi.fn(({ strategyId, fixture }) => {
      runOrder.push(`${strategyId}:${fixture.runId}`);
      return `{"runId":"${fixture.runId}","strategyId":"${strategyId}"}`;
    });

    await runStrategySweep(
      {
        registryDir: "data/research-datasets",
        outputDir: "data/research-results",
        strategyIds: ["buy-first-ask", "noop"],
      },
      createDeps(filesystem, runResearch),
    );

    expect(runOrder).toEqual([
      "buy-first-ask:fixture-KXBTC15M-MARKET-A",
      "buy-first-ask:fixture-KXBTC15M-MARKET-B",
      "noop:fixture-KXBTC15M-MARKET-A",
      "noop:fixture-KXBTC15M-MARKET-B",
    ]);
  });

  it("writes outputs under strategy-specific directories", async () => {
    const marketTicker = "KXBTC15M-MARKET-A";
    const fixturePath = `data/fixtures/KXBTC15M/${marketTicker}/fixture.json`;
    const registryPath = "data/research-datasets/KXBTC15M/dataset-registry.json";
    const outputPath = buildStrategySweepOutputPath(
      "data/research-results",
      "noop",
      "KXBTC15M",
      marketTicker,
    );
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

    const summary = await runStrategySweep(
      {
        registryDir: "data/research-datasets",
        outputDir: "data/research-results",
        strategyIds: ["noop"],
      },
      createDeps(filesystem),
    );

    expect(summary.successfulRuns).toBe(1);
    expect(summary.runs[0]).toMatchObject({
      strategyId: "noop",
      marketTicker,
      fixturePath,
      outputPath,
      status: "success",
      runId: `fixture-${marketTicker}`,
    });
    expect(filesystem.readFile(outputPath)).toContain(`"runId":"fixture-${marketTicker}"`);
  });

  it("continues after partial failures and records them in the summary", async () => {
    const marketA = "KXBTC15M-MARKET-A";
    const marketB = "KXBTC15M-MARKET-B";
    const fixtureAPath = `data/fixtures/KXBTC15M/${marketA}/fixture.json`;
    const fixtureBPath = `data/fixtures/KXBTC15M/${marketB}/fixture.json`;
    const registryPath = "data/research-datasets/KXBTC15M/dataset-registry.json";
    const filesystem = createFilesystem(
      {
        [registryPath]: JSON.stringify(
          buildRegistry([
            { marketTicker: marketA, fixturePath: fixtureAPath },
            { marketTicker: marketB, fixturePath: fixtureBPath },
          ]),
        ),
      },
      {
        [fixtureAPath]: JSON.stringify(createFixtureDocument(marketA)),
        [fixtureBPath]: JSON.stringify(createFixtureDocument(marketB)),
      },
    );
    const runResearch = vi.fn(({ fixture }) => {
      if (fixture.runId.includes(marketB)) {
        throw new Error("simulated failure");
      }
      return `{"runId":"${fixture.runId}"}`;
    });

    const summary = await runStrategySweep(
      {
        registryDir: "data/research-datasets",
        outputDir: "data/research-results",
        strategyIds: ["noop"],
      },
      createDeps(filesystem, runResearch),
    );

    expect(summary.totalRuns).toBe(2);
    expect(summary.successfulRuns).toBe(1);
    expect(summary.failedRuns).toBe(1);
    expect(summary.runs.find((run) => run.marketTicker === marketB)).toMatchObject({
      status: "failed",
      errorMessage: "simulated failure",
    });
  });

  it("records missing fixtures as failures without aborting the sweep", async () => {
    const marketTicker = "KXBTC15M-MARKET-A";
    const fixturePath = `data/fixtures/KXBTC15M/${marketTicker}/fixture.json`;
    const registryPath = "data/research-datasets/KXBTC15M/dataset-registry.json";
    const filesystem = createFilesystem(
      {
        [registryPath]: JSON.stringify(
          buildRegistry([{ marketTicker, fixturePath }]),
        ),
      },
      {},
    );

    const summary = await runStrategySweep(
      {
        registryDir: "data/research-datasets",
        outputDir: "data/research-results",
        strategyIds: ["noop"],
      },
      createDeps(filesystem),
    );

    expect(summary.failedRuns).toBe(1);
    expect(summary.runs[0]?.errorMessage).toContain("Missing fixture");
  });

  it("records invalid strategy config as failures", async () => {
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
        [fixturePath]: JSON.stringify(
          createFixtureDocument(marketTicker, {
            strategyConfig: { maxYesMidCents: "invalid" },
          }),
        ),
      },
    );

    const summary = await runStrategySweep(
      {
        registryDir: "data/research-datasets",
        outputDir: "data/research-results",
        strategyIds: ["buy-below-probability"],
      },
      createDeps(filesystem),
    );

    expect(summary.failedRuns).toBe(1);
    expect(summary.runs[0]?.errorMessage).toContain("Invalid strategy config");
  });

  it("writes sweep-summary.json with aggregate counts and durations", async () => {
    const marketTicker = "KXBTC15M-MARKET-A";
    const fixturePath = `data/fixtures/KXBTC15M/${marketTicker}/fixture.json`;
    const registryPath = "data/research-datasets/KXBTC15M/dataset-registry.json";
    const summaryPath = "data/research-results/sweep-summary.json";
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

    const summary = await runStrategySweep(
      {
        registryDir: "data/research-datasets",
        outputDir: "data/research-results",
        strategyIds: ["noop", "buy-first-ask"],
        summaryPath,
      },
      createDeps(filesystem),
    );

    expect(summary.summaryPath).toBe(summaryPath);
    expect(summary.strategiesExecuted).toEqual(["noop", "buy-first-ask"]);
    expect(summary.marketsTested).toBe(1);
    expect(summary.totalRuns).toBe(2);
    expect(summary.startedAt).toBe(FIXED_NOW.toISOString());
    expect(summary.runs.every((run) => run.durationMs >= 0)).toBe(true);

    const serialized = filesystem.readFile(summaryPath);
    expect(serialized).toContain('"successfulRuns":2');
    expect(serialized).toContain('"failedRuns":0');
  });

  it("rejects duplicate strategy ids", async () => {
    await expect(
      runStrategySweep(
        {
          registryDir: "data/research-datasets",
          outputDir: "data/research-results",
          strategyIds: ["noop", "noop"],
        },
        createDeps(createFilesystem({}, {})),
      ),
    ).rejects.toMatchObject({
      code: StrategySweepErrorCode.DUPLICATE_STRATEGY_ID,
    });
  });

  it("rejects unknown strategy ids", async () => {
    await expect(
      runStrategySweep(
        {
          registryDir: "data/research-datasets",
          outputDir: "data/research-results",
          strategyIds: ["unknown-strategy"],
        },
        createDeps(createFilesystem({}, {})),
      ),
    ).rejects.toMatchObject({
      code: StrategySweepErrorCode.UNKNOWN_STRATEGY_ID,
    });
  });

  it("rejects missing registry directories", async () => {
    const filesystem: StrategySweepFilesystem = {
      exists: () => false,
      readFile: () => {
        throw new Error("missing");
      },
      writeFile: () => undefined,
      mkdir: () => undefined,
      listRegistryPaths: () => {
        throw new StrategySweepError(
          "Registry directory does not exist",
          StrategySweepErrorCode.MISSING_REGISTRY_DIR,
        );
      },
    };

    await expect(
      runStrategySweep(
        {
          registryDir: "missing",
          outputDir: "data/research-results",
          strategyIds: ["noop"],
        },
        createDeps(filesystem),
      ),
    ).rejects.toMatchObject({
      code: StrategySweepErrorCode.MISSING_REGISTRY_DIR,
    });
  });
});
