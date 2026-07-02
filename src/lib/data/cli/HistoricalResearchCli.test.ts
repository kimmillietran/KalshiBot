import { describe, expect, it, vi } from "vitest";

import * as BacktestModule from "@/lib/data/backtesting";
import { buildHistoricalDataset } from "@/lib/data/datasets";
import { DataSource } from "@/lib/data/provenance";
import { SILVER_BRONZE_CONTENT_TYPE } from "@/lib/data/silver";
import type { HistoricalDataset } from "@/lib/data/datasets";
import type { RawHistoricalRecord } from "@/lib/data/types";
import { DATA_CONTRACT_VERSION } from "@/lib/data/versioning";
import { DEFAULT_ENGINE_CONFIG } from "@/lib/trading/config/defaults";

import {
  HistoricalResearchCli,
  HistoricalResearchCliError,
  HistoricalResearchCliErrorCode,
  HistoricalResearchProgressEventType,
  serializeHistoricalResearchRun,
} from "./HistoricalResearchCli";
import type {
  HistoricalResearchProgressEvent,
  HistoricalResearchRunConfig,
} from "./types";
import type { BacktestStrategy } from "../backtesting/strategyTypes";
import { DEFAULT_BACKTEST_FILL_SIMULATION_CONFIG } from "../backtesting/strategyTypes";

const COLLECTION_TIME = "2026-06-27T01:00:00.000Z";
const OBSERVED_AT = "2026-06-27T01:00:05.000Z";
const RUN_ID = "research-run-6.8a";
const DURATION_MS = 1_250;

const FILL_CONFIG = {
  ...DEFAULT_BACKTEST_FILL_SIMULATION_CONFIG,
  feeCentsPerContract: 1,
};

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
    collectionTime: COLLECTION_TIME,
    observedAt: OBSERVED_AT,
    payload,
    provenance: {
      source: DataSource.KALSHI_REST,
      collectionTime: COLLECTION_TIME,
      observedAt: OBSERVED_AT,
      fetchId: `fetch-${options.recordId}`,
    },
  };
}

function completeMarketRecords(
  ticker: string,
  eventTime: string,
  windowClose: string,
  idPrefix: string,
): RawHistoricalRecord[] {
  const openTime = eventTime;
  const closeTime = new Date(Date.parse(eventTime) + 60_000).toISOString();

  return [
    baseBronze(
      SILVER_BRONZE_CONTENT_TYPE.MARKET,
      {
        open_time: eventTime,
        close_time: windowClose,
        floor_strike: 59_990.31,
        event_ticker: `${ticker.split("-")[0]}-EVENT`,
        status: "closed",
      },
      { recordId: `${idPrefix}-market`, ticker, eventTime },
    ),
    baseBronze(
      SILVER_BRONZE_CONTENT_TYPE.CANDLESTICK,
      {
        open_time: openTime,
        close_time: closeTime,
        yes_bid_cents: 48,
        yes_ask_cents: 52,
        no_bid_cents: 47,
        no_ask_cents: 51,
        volume_contracts: 120,
      },
      { recordId: `${idPrefix}-candle`, ticker, eventTime: openTime },
    ),
    baseBronze(
      "binance.historical.kline",
      {
        open_time: openTime,
        close_time: closeTime,
        open_usd: 59_980.5,
        high_usd: 60_010.25,
        low_usd: 59_960.0,
        close_usd: 59_995.75,
        volume_btc: 12.5,
      },
      { recordId: `${idPrefix}-btc`, ticker, eventTime: closeTime },
    ),
    baseBronze(
      SILVER_BRONZE_CONTENT_TYPE.SETTLEMENT,
      {
        floor_strike: 59_990.31,
        expiration_value: "60010.25",
        result: "yes",
        settlement_ts: windowClose,
      },
      { recordId: `${idPrefix}-settlement`, ticker, eventTime },
    ),
  ];
}

function buildDataset(ticker: string, idPrefix: string): HistoricalDataset {
  return buildHistoricalDataset(
    completeMarketRecords(
      ticker,
      "2026-06-26T23:15:00.000Z",
      "2026-06-26T23:30:00.000Z",
      idPrefix,
    ),
  );
}

function noopStrategy(): BacktestStrategy {
  return {
    strategyId: "noop",
    decide: () => [],
  };
}

function createConfig(
  overrides: Partial<HistoricalResearchRunConfig> = {},
): HistoricalResearchRunConfig {
  return {
    runId: RUN_ID,
    strategy: noopStrategy(),
    engineConfig: DEFAULT_ENGINE_CONFIG,
    initialCashCents: 10_000,
    durationMs: DURATION_MS,
    fillConfig: FILL_CONFIG,
    ...overrides,
  };
}

function emptyDataset(): HistoricalDataset {
  return {
    snapshots: [],
    metadata: {
      datasetId: "empty-dataset",
      contractVersion: DATA_CONTRACT_VERSION,
      snapshotCount: 0,
      marketTickers: [],
    },
    provenance: {
      bronzeRecordCount: 0,
      bronzeRecordIds: [],
      provenanceByBronzeRecordId: {},
      rejectedMarketTickers: [],
    },
  };
}

describe("HistoricalResearchCli", () => {
  it("runs a successful historical research backtest", () => {
    const dataset = buildDataset("KXBTC15M-CLI-A", "cli-a");
    const config = createConfig();

    const run = HistoricalResearchCli.run({ dataset, config });

    expect(run.datasetMetadata.datasetId).toBe(dataset.metadata.datasetId);
    expect(run.backtestResult.metadata.snapshotCount).toBe(1);
    expect(run.durationMs).toBe(DURATION_MS);
    expect(run.config.runId).toBe(RUN_ID);
    expect(run.config.strategy.strategyId).toBe("noop");
  });

  it("runs multiple datasets sequentially in declaration order", () => {
    const datasetA = buildDataset("KXBTC15M-CLI-B", "cli-b");
    const datasetB = buildDataset("KXBTC15M-CLI-C", "cli-c");
    const config = createConfig();

    const runs = HistoricalResearchCli.runAll({
      datasets: [datasetA, datasetB],
      config,
    });

    expect(runs).toHaveLength(2);
    expect(runs[0]!.datasetMetadata.datasetId).toBe(datasetA.metadata.datasetId);
    expect(runs[1]!.datasetMetadata.datasetId).toBe(datasetB.metadata.datasetId);
  });

  it("serializes runs deterministically", () => {
    const dataset = buildDataset("KXBTC15M-CLI-SERIALIZE", "cli-serialize");
    const config = createConfig();

    const first = serializeHistoricalResearchRun(
      HistoricalResearchCli.run({ dataset, config }),
    );
    const second = serializeHistoricalResearchRun(
      HistoricalResearchCli.run({ dataset, config }),
    );

    expect(first).toBe(second);
  });

  it("serializes to valid JSON when optional configs are omitted", () => {
    const run = HistoricalResearchCli.run({
      dataset: buildDataset("KXBTC15M-CLI-JSON", "cli-json"),
      config: {
        runId: RUN_ID,
        strategy: noopStrategy(),
        engineConfig: DEFAULT_ENGINE_CONFIG,
        initialCashCents: 10_000,
        durationMs: DURATION_MS,
      },
    });

    const serialized = serializeHistoricalResearchRun(run);

    expect(() => JSON.parse(serialized)).not.toThrow();
    expect(serialized).not.toContain("undefined");
  });

  it("returns deeply frozen immutable outputs", () => {
    const run = HistoricalResearchCli.run({
      dataset: buildDataset("KXBTC15M-CLI-FROZEN", "cli-frozen"),
      config: createConfig(),
    });

    expect(Object.isFrozen(run)).toBe(true);
    expect(Object.isFrozen(run.datasetMetadata)).toBe(true);
    expect(Object.isFrozen(run.config)).toBe(true);
    expect(() => {
      (run as { durationMs: number }).durationMs = 0;
    }).toThrow();
  });

  it("emits progress events in started → dataset-complete → finished order", () => {
    const datasetA = buildDataset("KXBTC15M-CLI-P1", "cli-p1");
    const datasetB = buildDataset("KXBTC15M-CLI-P2", "cli-p2");
    const events: HistoricalResearchProgressEvent[] = [];

    HistoricalResearchCli.runAll({
      datasets: [datasetA, datasetB],
      config: createConfig(),
      onProgress: (event) => {
        events.push(event);
      },
    });

    expect(events).toHaveLength(4);
    expect(events[0]).toMatchObject({
      type: HistoricalResearchProgressEventType.STARTED,
      runId: RUN_ID,
      datasetCount: 2,
    });
    expect(events[1]).toMatchObject({
      type: HistoricalResearchProgressEventType.DATASET_COMPLETE,
      runId: RUN_ID,
      datasetIndex: 0,
      datasetId: datasetA.metadata.datasetId,
    });
    expect(events[2]).toMatchObject({
      type: HistoricalResearchProgressEventType.DATASET_COMPLETE,
      runId: RUN_ID,
      datasetIndex: 1,
      datasetId: datasetB.metadata.datasetId,
    });
    expect(events[3]).toMatchObject({
      type: HistoricalResearchProgressEventType.FINISHED,
      runId: RUN_ID,
    });
    expect(events[3]!.type === "finished" ? events[3]!.runs : []).toHaveLength(2);
  });

  it("allows runs without a progress callback", () => {
    const run = HistoricalResearchCli.run({
      dataset: buildDataset("KXBTC15M-CLI-NO-CB", "cli-no-cb"),
      config: createConfig(),
    });

    expect(run.backtestResult.replayResult.results).toHaveLength(1);
  });

  it("rejects datasets with no snapshots", () => {
    expect(() =>
      HistoricalResearchCli.run({
        dataset: emptyDataset(),
        config: createConfig(),
      }),
    ).toThrow(HistoricalResearchCliError);

    try {
      HistoricalResearchCli.run({
        dataset: emptyDataset(),
        config: createConfig(),
      });
    } catch (error) {
      expect((error as HistoricalResearchCliError).code).toBe(
        HistoricalResearchCliErrorCode.EMPTY_DATASET,
      );
    }

    expect(() =>
      HistoricalResearchCli.runAll({
        datasets: [],
        config: createConfig(),
      }),
    ).toThrow(HistoricalResearchCliError);
  });

  it("rejects invalid config values", () => {
    const dataset = buildDataset("KXBTC15M-CLI-INVALID", "cli-invalid");

    expect(() =>
      HistoricalResearchCli.run({
        dataset,
        config: createConfig({ runId: "  " }),
      }),
    ).toThrow(HistoricalResearchCliError);

    expect(() =>
      HistoricalResearchCli.run({
        dataset,
        config: createConfig({ durationMs: Number.NaN }),
      }),
    ).toThrow(HistoricalResearchCliError);

    try {
      HistoricalResearchCli.run({
        dataset,
        config: createConfig({ initialCashCents: -1 }),
      });
    } catch (error) {
      expect((error as HistoricalResearchCliError).code).toBe(
        HistoricalResearchCliErrorCode.INVALID_INITIAL_CASH,
      );
    }
  });

  it("invokes runHistoricalBacktest once per dataset", () => {
    const backtestSpy = vi.spyOn(BacktestModule, "runHistoricalBacktest");
    const datasetA = buildDataset("KXBTC15M-CLI-SPY-A", "cli-spy-a");
    const datasetB = buildDataset("KXBTC15M-CLI-SPY-B", "cli-spy-b");

    HistoricalResearchCli.runAll({
      datasets: [datasetA, datasetB],
      config: createConfig(),
    });

    expect(backtestSpy).toHaveBeenCalledTimes(2);
    backtestSpy.mockRestore();
  });
});
