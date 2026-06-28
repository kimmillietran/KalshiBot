import { describe, expect, it } from "vitest";

import {
  applyOrderbookDelta,
  applyOrderbookSnapshot,
  applyRestOrderbookSnapshot,
  createEmptyOrderbookState,
} from "./orderbookReducer";
import type { KalshiOrderbookDeltaMessage, KalshiOrderbookSnapshotMessage } from "./types";

const snapshotMessage: KalshiOrderbookSnapshotMessage = {
  type: "orderbook_snapshot",
  sid: 2,
  seq: 1,
  msg: {
    market_ticker: "KXBTC15M-26JUN261930-30",
    market_id: "market-id",
    yes_dollars_fp: [
      ["0.4800", "100.00"],
      ["0.4700", "50.00"],
    ],
    no_dollars_fp: [["0.5200", "80.00"]],
  },
};

describe("orderbookReducer", () => {
  it("applies snapshots deterministically", () => {
    const state = applyOrderbookSnapshot(
      createEmptyOrderbookState("KXBTC15M-26JUN261930-30"),
      snapshotMessage,
      1_700_000_000_000,
    );

    expect(state.yesLevels).toEqual({
      "0.4800": "100.00",
      "0.4700": "50.00",
    });
    expect(state.noLevels).toEqual({ "0.5200": "80.00" });
    expect(state.lastSeq).toBe(1);
  });

  it("applies deltas and removes depleted levels", () => {
    let state = applyOrderbookSnapshot(
      createEmptyOrderbookState("KXBTC15M-26JUN261930-30"),
      snapshotMessage,
      1,
    );

    const delta: KalshiOrderbookDeltaMessage = {
      type: "orderbook_delta",
      sid: 2,
      seq: 2,
      msg: {
        market_ticker: "KXBTC15M-26JUN261930-30",
        market_id: "market-id",
        price_dollars: "0.4800",
        delta_fp: "-100.00",
        side: "yes",
      },
    };

    state = applyOrderbookDelta(state, delta, 2);
    expect(state.yesLevels["0.4800"]).toBeUndefined();
    expect(state.yesLevels["0.4700"]).toBe("50.00");
  });

  it("supports REST snapshot resync", () => {
    const state = applyRestOrderbookSnapshot(
      createEmptyOrderbookState("KXBTC15M-26JUN261930-30"),
      "KXBTC15M-26JUN261930-30",
      [["0.5500", "10.00"]],
      [["0.4400", "12.00"]],
      99,
    );

    expect(state.yesLevels).toEqual({ "0.5500": "10.00" });
    expect(state.noLevels).toEqual({ "0.4400": "12.00" });
    expect(state.lastSeq).toBeNull();
  });
});
