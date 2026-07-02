import { describe, expect, it } from "vitest";

import { serializeBronzeRecord } from "@/lib/data/bronze";
import {
  HistoricalDatasetBuildError,
  HistoricalDatasetBuildErrorCode,
} from "@/lib/data/datasets";
import { DataSource } from "@/lib/data/provenance";
import { SILVER_BRONZE_CONTENT_TYPE } from "@/lib/data/silver";
import type { RawHistoricalRecord } from "@/lib/data/types";
import { DEFAULT_ENGINE_CONFIG } from "@/lib/trading/config/defaults";
import { DEFAULT_BACKTEST_FILL_SIMULATION_CONFIG } from "@/lib/data/backtesting/strategyTypes";

import {
  HistoricalFixtureError,
  HistoricalFixtureErrorCode,
  buildHistoricalResearchFixture,
  serializeHistoricalResearchFixture,
} from "./HistoricalFixtureBuilder";

const COLLECTION_TIME = "2026-06-27T01:00:00.000Z";
const OBSERVED_AT = "2026-06-27T01:00:05.000Z";
const RUN_ID = "fixture-run-6.12a";
const DURATION_MS = 4_000;

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

function createInput(
  bronzeRecords: readonly RawHistoricalRecord[],
  overrides: Partial<{
    exportConfig: {
      exportId: string;
      generated: { generatedAt: string; label: string };
    };
  }> = {},
) {
  return {
    bronzeRecords,
    strategyId: "noop" as const,
    runId: RUN_ID,
    durationMs: DURATION_MS,
    initialCashCents: 10_000,
    engineConfig: DEFAULT_ENGINE_CONFIG,
    fillConfig: {
      ...DEFAULT_BACKTEST_FILL_SIMULATION_CONFIG,
      feeCentsPerContract: 1,
    },
    ...overrides,
  };
}

describe("buildHistoricalResearchFixture", () => {
  it("builds a valid CLI-ready research fixture", () => {
    const bronzeRecords = completeMarketRecords(
      "KXBTC15M-FIXTURE-A",
      "2026-06-26T23:15:00.000Z",
      "2026-06-26T23:30:00.000Z",
      "fixture-a",
    );

    const fixture = buildHistoricalResearchFixture(createInput(bronzeRecords));

    expect(fixture.runId).toBe(RUN_ID);
    expect(fixture.durationMs).toBe(DURATION_MS);
    expect(fixture.strategyId).toBe("noop");
    expect(fixture.bronzeRecords).toHaveLength(4);
    expect(fixture.engineConfig).toEqual(DEFAULT_ENGINE_CONFIG);
  });

  it("serializes fixtures deterministically", () => {
    const input = createInput(
      completeMarketRecords(
        "KXBTC15M-FIXTURE-SERIALIZE",
        "2026-06-26T23:15:00.000Z",
        "2026-06-26T23:30:00.000Z",
        "fixture-serialize",
      ),
    );

    const first = serializeHistoricalResearchFixture(
      buildHistoricalResearchFixture(input),
    );
    const second = serializeHistoricalResearchFixture(
      buildHistoricalResearchFixture(input),
    );

    expect(first).toBe(second);
  });

  it("serializes to valid JSON when optional configs are omitted", () => {
    const fixture = buildHistoricalResearchFixture(
      createInput(
        completeMarketRecords(
          "KXBTC15M-FIXTURE-JSON",
          "2026-06-26T23:15:00.000Z",
          "2026-06-26T23:30:00.000Z",
          "fixture-json",
        ),
      ),
    );

    const serialized = serializeHistoricalResearchFixture(fixture);

    expect(() => JSON.parse(serialized)).not.toThrow();
    expect(serialized).not.toContain("undefined");
  });

  it("returns deeply frozen immutable outputs", () => {
    const fixture = buildHistoricalResearchFixture(
      createInput(
        completeMarketRecords(
          "KXBTC15M-FIXTURE-FROZEN",
          "2026-06-26T23:15:00.000Z",
          "2026-06-26T23:30:00.000Z",
          "fixture-frozen",
        ),
      ),
    );

    expect(Object.isFrozen(fixture)).toBe(true);
    expect(Object.isFrozen(fixture.bronzeRecords)).toBe(true);
    expect(Object.isFrozen(fixture.engineConfig)).toBe(true);
    expect(() => {
      (fixture as { runId: string }).runId = "mutated";
    }).toThrow();
  });

  it("rejects empty bronze record input", () => {
    expect(() => buildHistoricalResearchFixture(createInput([]))).toThrow(
      HistoricalFixtureError,
    );

    try {
      buildHistoricalResearchFixture(createInput([]));
    } catch (error) {
      expect((error as HistoricalFixtureError).code).toBe(
        HistoricalFixtureErrorCode.EMPTY_BRONZE_RECORDS,
      );
    }
  });

  it("propagates invalid bronze dataset builder errors", () => {
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
          ticker: "KXBTC15M-INCOMPLETE",
          eventTime: "2026-06-26T23:15:00.000Z",
        },
      ),
    ];

    expect(() =>
      buildHistoricalResearchFixture(createInput(incompleteRecords)),
    ).toThrow(HistoricalDatasetBuildError);

    try {
      buildHistoricalResearchFixture(createInput(incompleteRecords));
    } catch (error) {
      expect((error as HistoricalDatasetBuildError).code).toBe(
        HistoricalDatasetBuildErrorCode.INCOMPLETE_SNAPSHOT_GROUP,
      );
    }
  });

  it("passes export config through the fixture and serialization", () => {
    const exportConfig = {
      exportId: "export-fixture-6.12a",
      generated: {
        generatedAt: "2026-06-28T00:00:00.000Z",
        label: "fixture-export",
      },
    };

    const fixture = buildHistoricalResearchFixture(
      createInput(
        completeMarketRecords(
          "KXBTC15M-FIXTURE-EXPORT",
          "2026-06-26T23:15:00.000Z",
          "2026-06-26T23:30:00.000Z",
          "fixture-export",
        ),
        { exportConfig },
      ),
    );

    expect(fixture.exportConfig).toEqual(exportConfig);
    expect(serializeHistoricalResearchFixture(fixture)).toContain("export-fixture-6.12a");
  });

  it("rejects unknown strategy ids", () => {
    const bronzeRecords = completeMarketRecords(
      "KXBTC15M-FIXTURE-UNKNOWN",
      "2026-06-26T23:15:00.000Z",
      "2026-06-26T23:30:00.000Z",
      "fixture-unknown",
    );

    expect(() =>
      buildHistoricalResearchFixture({
        ...createInput(bronzeRecords),
        strategyId: "custom-strategy" as "noop",
      }),
    ).toThrow(HistoricalFixtureError);

    try {
      buildHistoricalResearchFixture({
        ...createInput(bronzeRecords),
        strategyId: "custom-strategy" as "noop",
      });
    } catch (error) {
      expect((error as HistoricalFixtureError).code).toBe(
        HistoricalFixtureErrorCode.INVALID_STRATEGY_ID,
      );
    }
  });

  it("rejects invalid fixture config", () => {
    const bronzeRecords = completeMarketRecords(
      "KXBTC15M-FIXTURE-INVALID",
      "2026-06-26T23:15:00.000Z",
      "2026-06-26T23:30:00.000Z",
      "fixture-invalid",
    );
    const base = createInput(bronzeRecords);

    expect(() => buildHistoricalResearchFixture(null as never)).toThrow(
      HistoricalFixtureError,
    );

    expect(() =>
      buildHistoricalResearchFixture({ ...base, runId: "  " }),
    ).toThrow(HistoricalFixtureError);

    expect(() =>
      buildHistoricalResearchFixture({ ...base, initialCashCents: -1 }),
    ).toThrow(HistoricalFixtureError);

    expect(() =>
      buildHistoricalResearchFixture({ ...base, durationMs: Number.NaN }),
    ).toThrow(HistoricalFixtureError);
  });

  it("passes fillConfig and metricsConfig through unchanged", () => {
    const metricsConfig = {
      periodsPerYear: 252,
      riskFreeRatePerPeriod: 0.02,
    };
    const fillConfig = {
      ...DEFAULT_BACKTEST_FILL_SIMULATION_CONFIG,
      feeCentsPerContract: 2,
    };

    const fixture = buildHistoricalResearchFixture({
      ...createInput(
        completeMarketRecords(
          "KXBTC15M-FIXTURE-CONFIG",
          "2026-06-26T23:15:00.000Z",
          "2026-06-26T23:30:00.000Z",
          "fixture-config",
        ),
      ),
      fillConfig,
      metricsConfig,
    });

    expect(fixture.fillConfig).toEqual(fillConfig);
    expect(fixture.metricsConfig).toEqual(metricsConfig);
    expect(serializeHistoricalResearchFixture(fixture)).toContain('"feeCentsPerContract":2');
    expect(serializeHistoricalResearchFixture(fixture)).toContain('"periodsPerYear":252');
  });

  it("round-trips serialized fixtures through JSON.parse when exportConfig is present", () => {
    const exportConfig = {
      exportId: "export-roundtrip-6.12a",
      generated: {
        generatedAt: "2026-06-28T00:00:00.000Z",
        label: "roundtrip",
      },
    };

    const fixture = buildHistoricalResearchFixture({
      ...createInput(
        completeMarketRecords(
          "KXBTC15M-FIXTURE-ROUNDTRIP",
          "2026-06-26T23:15:00.000Z",
          "2026-06-26T23:30:00.000Z",
          "fixture-roundtrip",
        ),
        { exportConfig },
      ),
      metricsConfig: {
        periodsPerYear: 252,
        riskFreeRatePerPeriod: 0.02,
      },
    });

    const parsed = JSON.parse(serializeHistoricalResearchFixture(fixture));

    expect(parsed.runId).toBe(fixture.runId);
    expect(parsed.strategyId).toBe(fixture.strategyId);
    expect(parsed.bronzeRecords).toHaveLength(fixture.bronzeRecords.length);
    expect(parsed.engineConfig).toEqual(fixture.engineConfig);
    expect(parsed.exportConfig).toEqual(exportConfig);
  });

  it("does not mutate input bronze records", () => {
    const bronzeRecords = completeMarketRecords(
      "KXBTC15M-FIXTURE-UNCHANGED",
      "2026-06-26T23:15:00.000Z",
      "2026-06-26T23:30:00.000Z",
      "fixture-unchanged",
    );
    const before = bronzeRecords.map((record) => serializeBronzeRecord(record));

    buildHistoricalResearchFixture(createInput(bronzeRecords));

    const after = bronzeRecords.map((record) => serializeBronzeRecord(record));
    expect(after).toEqual(before);
  });
});
