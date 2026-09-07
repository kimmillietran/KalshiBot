import { describe, expect, it } from "vitest";

import { CandleRecordIdentityError } from "./btcCandles1mSidecarTypes";
import { assertWritableBtcCandles1mRecord } from "./persistBtcCandles1mRecord";
import type { BtcCandles1mPersistedRecord } from "./btcCandles1mSidecarTypes";

function validRecord(
  overrides: Partial<BtcCandles1mPersistedRecord> = {},
): BtcCandles1mPersistedRecord {
  return {
    runId: "run-A",
    processEpochId: "epoch-1",
    provider: "coinbase-spot",
    productId: "BTC-USD",
    sourceRecordType: "exchange-completed-1m-ohlc",
    source: "coinbase-exchange-rest-candles",
    granularityMs: 60_000,
    candleOpenTime: "2026-07-20T13:59:00.000Z",
    candleCloseTime: "2026-07-20T13:59:59.999Z",
    open: 1,
    high: 2,
    low: 1,
    close: 1,
    volume: 1,
    observedAtLocal: "2026-07-20T14:00:10.000Z",
    firstObservedAtLocal: "2026-07-20T14:00:10.000Z",
    retrievalMethod: "startup-backfill",
    observationIndex: 1,
    revisionClass: "first-observation",
    requestStartedAtLocal: "2026-07-20T14:00:10.000Z",
    ...overrides,
  };
}

describe("assertWritableBtcCandles1mRecord", () => {
  it("rejects empty or missing runId and processEpochId", () => {
    expect(() => assertWritableBtcCandles1mRecord(validRecord({ runId: "" }))).toThrow(
      CandleRecordIdentityError,
    );
    expect(() => assertWritableBtcCandles1mRecord(validRecord({ runId: "   " }))).toThrow(
      /runId/,
    );
    expect(() => assertWritableBtcCandles1mRecord(validRecord({ processEpochId: "" }))).toThrow(
      /processEpochId/,
    );
  });

  it("rejects wrong product or close identity", () => {
    expect(() =>
      assertWritableBtcCandles1mRecord(validRecord({ productId: "ETH-USD" as never })),
    ).toThrow(/productId/);
    expect(() =>
      assertWritableBtcCandles1mRecord(
        validRecord({ candleCloseTime: "2026-07-20T13:59:00.000Z" }),
      ),
    ).toThrow(/59999/);
  });
});
