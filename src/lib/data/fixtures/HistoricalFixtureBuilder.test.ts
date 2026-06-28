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
