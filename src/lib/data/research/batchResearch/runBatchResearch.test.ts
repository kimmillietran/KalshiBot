import { describe, expect, it, vi } from "vitest";

import { DataSource } from "@/lib/data/provenance";
import { SILVER_BRONZE_CONTENT_TYPE } from "@/lib/data/silver";
import type { RawHistoricalRecord } from "@/lib/data/types";
import { DATASET_BRONZE_CONTENT_TYPE } from "@/lib/data/datasets/datasetTypes";
import { runHistoricalResearchFromBronze } from "@/lib/data/research/runner";
import { DEFAULT_ENGINE_CONFIG } from "@/lib/trading/config/defaults";
import { DEFAULT_BACKTEST_FILL_SIMULATION_CONFIG } from "@/lib/data/backtesting/strategyTypes";

import { buildBatchResearchOutputPath } from "./buildBatchResearchOutputPath";
import { runBatchResearch } from "./runBatchResearch";
import type {
  BatchResearchFilesystem,
  BatchResearchRunnerDeps,
  ResearchDatasetSeriesRegistryDocument,
  RunSingleBatchResearchFn,
} from "./batchResearchTypes";

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

function createFixtureDocument(marketTicker: string): HistoricalResearchCliInput {
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

function buildRegistry(
  markets: Array<{ marketTicker: string; fixturePath: string; valid?: boolean }>,
): ResearchDatasetSeriesRegistryDocument {
  return {
    seriesTicker: "KXBTC15M",
    markets: markets.map(({ marketTicker, fixturePath, valid = true }) => ({
      seriesTicker: "KXBTC15M",
      marketTicker,
      fixturePath,
      validationStatus: { valid },
    })),
  };
}

function createFilesystem(
  registries: Record<string, string>,
  fixtures: Record<string, string>,
  existingOutputs: Set<string> = new Set(),
): BatchResearchFilesystem {
  const files = new Map<string, string>([
    ...Object.entries(registries),
    ...Object.entries(fixtures),
  ]);
  const writes = new Map<string, string>();

  return {
    exists: (path) => existingOutputs.has(path),
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

function productionResearchFn(): RunSingleBatchResearchFn {
  return ({ fixture }) =>
    runHistoricalResearchFromBronze({
      bronzeRecords: fixture.bronzeRecords,
      strategy: { strategyId: "noop", decide: () => [] },
      engineConfig: fixture.engineConfig,
      initialCashCents: fixture.initialCashCents,
      runId: fixture.runId,
      durationMs: fixture.durationMs,
      fillConfig: fixture.fillConfig,
    }).serialized;
}

function createDeps(
  filesystem: BatchResearchFilesystem,
  runResearch?: RunSingleBatchResearchFn,
): BatchResearchRunnerDeps {
  return {
    filesystem,
    parseFixtureJson: (json) => JSON.parse(json) as HistoricalResearchCliInput,
    runResearch: runResearch ?? productionResearchFn(),
    now: () => FIXED_NOW,
  };
}

describe("buildBatchResearchOutputPath", () => {
  it("maps series and market tickers to research-output.json", () => {
    expect(
      buildBatchResearchOutputPath(
        "data/research-results",
        "KXBTC15M",
        "KXBTC15M-MARKET-A",
      ),
    ).toBe("data/research-results/KXBTC15M/KXBTC15M-MARKET-A/research-output.json");
  });
});

describe("runBatchResearch", () => {
  it("runs research in deterministic market order", async () => {
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
    const runResearch = vi.fn(({ entry }) => {
      runOrder.push(entry.marketTicker);
      return `{"runId":"fixture-${entry.marketTicker}"}`;
    });

    await runBatchResearch(
      {
        registryDir: "data/research-datasets",
        outputDir: "data/research-results",
      },
      createDeps(filesystem, runResearch),
    );

    expect(runOrder).toEqual([marketA, marketB]);
  });

  it("writes research outputs using the existing research engine", async () => {
    const marketTicker = "KXBTC15M-MARKET-A";
    const fixturePath = `data/fixtures/KXBTC15M/${marketTicker}/fixture.json`;
    const registryPath = "data/research-datasets/KXBTC15M/dataset-registry.json";
    const outputPath = `data/research-results/KXBTC15M/${marketTicker}/research-output.json`;
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

    const summary = await runBatchResearch(
      {
        registryDir: "data/research-datasets",
        outputDir: "data/research-results",
      },
      createDeps(filesystem),
    );

    expect(summary.successfulRuns).toBe(1);
    expect(summary.markets[0]).toMatchObject({
      marketTicker,
      fixturePath,
      outputPath,
      status: "success",
      runId: `fixture-${marketTicker}`,
    });
    expect(filesystem.readFile(outputPath)).toContain(`"runId":"fixture-${marketTicker}"`);
  });

  it("continues after missing fixtures and research failures", async () => {
    const marketA = "KXBTC15M-MARKET-A";
    const marketB = "KXBTC15M-MARKET-B";
    const registryPath = "data/research-datasets/KXBTC15M/dataset-registry.json";
    const filesystem = createFilesystem(
      {
        [registryPath]: JSON.stringify(
          buildRegistry([
            {
              marketTicker: marketA,
              fixturePath: `data/fixtures/KXBTC15M/${marketA}/fixture.json`,
            },
            {
              marketTicker: marketB,
              fixturePath: `data/fixtures/KXBTC15M/${marketB}/fixture.json`,
            },
          ]),
        ),
      },
      {
        [`data/fixtures/KXBTC15M/${marketA}/fixture.json`]: JSON.stringify(
          createFixtureDocument(marketA),
        ),
      },
    );
    const runResearch = vi.fn(({ entry }) => {
      if (entry.marketTicker === marketA) {
        throw new Error("research execution failed");
      }
      return `{"runId":"fixture-${entry.marketTicker}"}`;
    });

    const summary = await runBatchResearch(
      {
        registryDir: "data/research-datasets",
        outputDir: "data/research-results",
      },
      createDeps(filesystem, runResearch),
    );

    expect(summary.successfulRuns).toBe(0);
    expect(summary.failedRuns).toBe(2);
  });

  it("skips markets when research outputs already exist", async () => {
    const marketTicker = "KXBTC15M-MARKET-A";
    const fixturePath = `data/fixtures/KXBTC15M/${marketTicker}/fixture.json`;
    const outputPath = `data/research-results/KXBTC15M/${marketTicker}/research-output.json`;
    const filesystem = createFilesystem(
      {
        "data/research-datasets/KXBTC15M/dataset-registry.json": JSON.stringify(
          buildRegistry([{ marketTicker, fixturePath }]),
        ),
      },
      {
        [fixturePath]: JSON.stringify(createFixtureDocument(marketTicker)),
      },
      new Set([outputPath]),
    );
    const runResearch = vi.fn();

    const summary = await runBatchResearch(
      {
        registryDir: "data/research-datasets",
        outputDir: "data/research-results",
      },
      createDeps(filesystem, runResearch),
    );

    expect(summary.skippedRuns).toBe(1);
    expect(runResearch).not.toHaveBeenCalled();
  });

  it("rejects duplicate output paths before running research", async () => {
    const registryPath = "data/research-datasets/KXBTC15M/dataset-registry.json";
    const filesystem = createFilesystem(
      {
        [registryPath]: JSON.stringify(
          buildRegistry([
            {
              marketTicker: "KXBTC15M-MARKET-A",
              fixturePath: "data/fixtures/KXBTC15M/MARKET-A/fixture.json",
            },
          ]),
        ),
      },
      {},
    );
    filesystem.listRegistryPaths = () => [registryPath, registryPath];

    await expect(
      runBatchResearch(
        {
          registryDir: "data/research-datasets",
          outputDir: "data/research-results",
        },
        createDeps(filesystem),
      ),
    ).rejects.toMatchObject({
      code: "duplicate-output-path",
    });
  });

  it("writes a deterministic batch summary", async () => {
    const marketTicker = "KXBTC15M-MARKET-A";
    const fixturePath = `data/fixtures/KXBTC15M/${marketTicker}/fixture.json`;
    const filesystem = createFilesystem(
      {
        "data/research-datasets/KXBTC15M/dataset-registry.json": JSON.stringify(
          buildRegistry([{ marketTicker, fixturePath }]),
        ),
      },
      {
        [fixturePath]: JSON.stringify(createFixtureDocument(marketTicker)),
      },
    );

    const summary = await runBatchResearch(
      {
        registryDir: "data/research-datasets",
        outputDir: "data/research-results",
      },
      createDeps(filesystem),
    );

    expect(filesystem.readFile(summary.summaryPath)).toContain('"successfulRuns":1');
    expect(filesystem.readFile(summary.summaryPath)).toContain(`"marketTicker":"${marketTicker}"`);
  });
});
