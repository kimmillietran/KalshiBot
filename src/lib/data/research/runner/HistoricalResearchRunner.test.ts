import { describe, expect, it, vi } from "vitest";

import { serializeBronzeRecord } from "@/lib/data/bronze";
import { HistoricalResearchCli } from "@/lib/data/cli";
import * as DatasetsModule from "@/lib/data/datasets";
import {
  HistoricalDatasetBuildError,
  HistoricalDatasetBuildErrorCode,
} from "@/lib/data/datasets";
import { DataSource } from "@/lib/data/provenance";
import { SILVER_BRONZE_CONTENT_TYPE } from "@/lib/data/silver";
import type { RawHistoricalRecord } from "@/lib/data/types";
import { DEFAULT_ENGINE_CONFIG } from "@/lib/trading/config/defaults";

import { parseResearchOutputJson } from "@/lib/data/research/aggregation/parseResearchOutputJson";
import {
  HistoricalResearchRunnerError,
  HistoricalResearchRunnerErrorCode,
  runHistoricalResearchFromBronze,
  serializeHistoricalResearchRunnerResult,
} from "./HistoricalResearchRunner";
import type { BacktestStrategy } from "../../backtesting/strategyTypes";
import { DEFAULT_BACKTEST_FILL_SIMULATION_CONFIG } from "../../backtesting/strategyTypes";

const COLLECTION_TIME = "2026-06-27T01:00:00.000Z";
const OBSERVED_AT = "2026-06-27T01:00:05.000Z";
const RUN_ID = "research-run-6.9a";
const DURATION_MS = 2_500;

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

function noopStrategy(): BacktestStrategy {
  return {
    strategyId: "noop",
    decide: () => [],
  };
}

function createInput(
  bronzeRecords: readonly RawHistoricalRecord[],
  overrides: Partial<{
    runId: string;
    durationMs: number;
    initialCashCents: number;
    strategy: BacktestStrategy;
  }> = {},
) {
  return {
    bronzeRecords,
    strategy: overrides.strategy ?? noopStrategy(),
    engineConfig: DEFAULT_ENGINE_CONFIG,
    initialCashCents: overrides.initialCashCents ?? 10_000,
    runId: overrides.runId ?? RUN_ID,
    durationMs: overrides.durationMs ?? DURATION_MS,
    fillConfig: FILL_CONFIG,
  };
}

describe("runHistoricalResearchFromBronze", () => {
  it("runs a complete bronze-to-research pipeline happy path", () => {
    const bronzeRecords = completeMarketRecords(
      "KXBTC15M-RUNNER-A",
      "2026-06-26T23:15:00.000Z",
      "2026-06-26T23:30:00.000Z",
      "runner-a",
    );

    const result = runHistoricalResearchFromBronze(createInput(bronzeRecords));

    expect(result.dataset.snapshots).toHaveLength(1);
    expect(result.researchRun.datasetMetadata.datasetId).toBe(
      result.dataset.metadata.datasetId,
    );
    expect(result.researchRun.backtestResult.metadata.snapshotCount).toBe(1);
    expect(result.metadata.runId).toBe(RUN_ID);
    expect(result.metadata.durationMs).toBe(DURATION_MS);
    expect(result.metadata.bronzeRecordCount).toBe(4);
    expect(result.serialized).toBe(
      serializeHistoricalResearchRunnerResult({
        dataset: result.dataset,
        researchRun: result.researchRun,
        metadata: result.metadata,
      }),
    );
    expect(result.serializedDecisionTrace).toContain('"entries"');
    expect(
      JSON.parse(result.serializedDecisionTrace).entries.length,
    ).toBe(result.researchRun.backtestResult.strategyRun.decisionTrace.length);
  });

  it("rejects empty bronze record input", () => {
    expect(() => runHistoricalResearchFromBronze(createInput([]))).toThrow(
      HistoricalResearchRunnerError,
    );

    try {
      runHistoricalResearchFromBronze(createInput([]));
    } catch (error) {
      expect((error as HistoricalResearchRunnerError).code).toBe(
        HistoricalResearchRunnerErrorCode.EMPTY_BRONZE_RECORDS,
      );
    }
  });

  it("serializes results deterministically", () => {
    const bronzeRecords = completeMarketRecords(
      "KXBTC15M-RUNNER-SERIALIZE",
      "2026-06-26T23:15:00.000Z",
      "2026-06-26T23:30:00.000Z",
      "runner-serialize",
    );
    const input = createInput(bronzeRecords);

    const first = runHistoricalResearchFromBronze(input).serialized;
    const second = runHistoricalResearchFromBronze(input).serialized;

    expect(first).toBe(second);
  });

  it("serializes output that aggregation can parse when optional configs are omitted", () => {
    const bronzeRecords = completeMarketRecords(
      "KXBTC15M-RUNNER-PARSE",
      "2026-06-26T23:15:00.000Z",
      "2026-06-26T23:30:00.000Z",
      "runner-parse",
    );
    const { fillConfig: _unusedFillConfig, ...inputWithoutOptionals } = createInput(bronzeRecords);
    void _unusedFillConfig;
    const result = runHistoricalResearchFromBronze(inputWithoutOptionals);

    expect(() => parseResearchOutputJson(result.serialized, "KXBTC15M-RUNNER-PARSE")).not.toThrow();
    expect(result.serialized).not.toContain("undefined");
  });

  it("returns deeply frozen immutable outputs", () => {
    const result = runHistoricalResearchFromBronze(
      createInput(
        completeMarketRecords(
          "KXBTC15M-RUNNER-FROZEN",
          "2026-06-26T23:15:00.000Z",
          "2026-06-26T23:30:00.000Z",
          "runner-frozen",
        ),
      ),
    );

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.dataset)).toBe(true);
    expect(Object.isFrozen(result.metadata)).toBe(true);
    expect(Object.isFrozen(result.researchRun)).toBe(true);
    expect(Object.isFrozen(result.researchRun.config)).toBe(true);
    expect(() => {
      (result as { serialized: string }).serialized = "";
    }).toThrow();
  });

  it("rejects invalid runner config before pipeline execution", () => {
    const bronzeRecords = completeMarketRecords(
      "KXBTC15M-RUNNER-INVALID",
      "2026-06-26T23:15:00.000Z",
      "2026-06-26T23:30:00.000Z",
      "runner-invalid",
    );

    expect(() =>
      runHistoricalResearchFromBronze(null as never),
    ).toThrow(HistoricalResearchRunnerError);

    try {
      runHistoricalResearchFromBronze(null as never);
    } catch (error) {
      expect((error as HistoricalResearchRunnerError).code).toBe(
        HistoricalResearchRunnerErrorCode.INVALID_CONFIG,
      );
    }

    expect(() =>
      runHistoricalResearchFromBronze(
        createInput(bronzeRecords, { durationMs: Number.NaN }),
      ),
    ).toThrow(HistoricalResearchRunnerError);

    try {
      runHistoricalResearchFromBronze(
        createInput(bronzeRecords, { durationMs: Number.NaN }),
      );
    } catch (error) {
      expect((error as HistoricalResearchRunnerError).code).toBe(
        HistoricalResearchRunnerErrorCode.INVALID_DURATION_MS,
      );
    }

    expect(() =>
      runHistoricalResearchFromBronze(
        createInput(bronzeRecords, {
          strategy: { strategyId: "  ", decide: () => [] },
        }),
      ),
    ).toThrow(HistoricalResearchRunnerError);
  });

  it("does not mutate input bronze records", () => {
    const bronzeRecords = completeMarketRecords(
      "KXBTC15M-RUNNER-UNCHANGED",
      "2026-06-26T23:15:00.000Z",
      "2026-06-26T23:30:00.000Z",
      "runner-unchanged",
    );
    const before = bronzeRecords.map((record) => serializeBronzeRecord(record));

    runHistoricalResearchFromBronze(createInput(bronzeRecords));

    const after = bronzeRecords.map((record) => serializeBronzeRecord(record));
    expect(after).toEqual(before);
  });

  it("invokes buildHistoricalDataset once", () => {
    const buildSpy = vi.spyOn(DatasetsModule, "buildHistoricalDataset");
    const bronzeRecords = completeMarketRecords(
      "KXBTC15M-RUNNER-BUILD",
      "2026-06-26T23:15:00.000Z",
      "2026-06-26T23:30:00.000Z",
      "runner-build",
    );

    runHistoricalResearchFromBronze(createInput(bronzeRecords));

    expect(buildSpy).toHaveBeenCalledTimes(1);
    buildSpy.mockRestore();
  });

  it("invokes HistoricalResearchCli.run once", () => {
    const cliSpy = vi.spyOn(HistoricalResearchCli, "run");
    const bronzeRecords = completeMarketRecords(
      "KXBTC15M-RUNNER-CLI",
      "2026-06-26T23:15:00.000Z",
      "2026-06-26T23:30:00.000Z",
      "runner-cli",
    );

    runHistoricalResearchFromBronze(createInput(bronzeRecords));

    expect(cliSpy).toHaveBeenCalledTimes(1);
    cliSpy.mockRestore();
  });

  it("propagates dataset builder errors", () => {
    const ticker = "KXBTC15M-RUNNER-INCOMPLETE";
    const incompleteRecords = [
      baseBronze(
        SILVER_BRONZE_CONTENT_TYPE.MARKET,
        {
          open_time: "2026-06-26T23:15:00.000Z",
          close_time: "2026-06-26T23:30:00.000Z",
          floor_strike: 59_990.31,
          event_ticker: "KXBTC15M-EVENT",
          status: "closed",
        },
        {
          recordId: "incomplete-market",
          ticker,
          eventTime: "2026-06-26T23:15:00.000Z",
        },
      ),
    ];

    expect(() =>
      runHistoricalResearchFromBronze(createInput(incompleteRecords)),
    ).toThrow(HistoricalDatasetBuildError);

    try {
      runHistoricalResearchFromBronze(createInput(incompleteRecords));
    } catch (error) {
      expect((error as HistoricalDatasetBuildError).code).toBe(
        HistoricalDatasetBuildErrorCode.INCOMPLETE_SNAPSHOT_GROUP,
      );
    }
  });

  it("propagates research CLI errors", () => {
    const bronzeRecords = completeMarketRecords(
      "KXBTC15M-RUNNER-CLI-ERR",
      "2026-06-26T23:15:00.000Z",
      "2026-06-26T23:30:00.000Z",
      "runner-cli-err",
    );

    expect(() =>
      runHistoricalResearchFromBronze(
        createInput(bronzeRecords, { runId: "  " }),
      ),
    ).toThrow();
  });
});
