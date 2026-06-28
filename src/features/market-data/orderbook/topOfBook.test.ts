import { describe, expect, it } from "vitest";

import { applyOrderbookSnapshot, createEmptyOrderbookState } from "./orderbookReducer";
import { extractTopOfBook } from "./topOfBook";
import type { KalshiOrderbookSnapshotMessage } from "./types";

describe("extractTopOfBook", () => {
  it("derives best bids and complementary asks", () => {
    const state = applyOrderbookSnapshot(
      createEmptyOrderbookState("KXBTC15M-26JUN261930-30"),
      {
        type: "orderbook_snapshot",
        sid: 1,
        seq: 1,
        msg: {
          market_ticker: "KXBTC15M-26JUN261930-30",
          market_id: "market-id",
          yes_dollars_fp: [["0.4800", "100.00"]],
          no_dollars_fp: [["0.5200", "80.00"]],
        },
      } satisfies KalshiOrderbookSnapshotMessage,
      1,
    );

    expect(extractTopOfBook(state)).toEqual({
      yesBidCents: 48,
      yesAskCents: 48,
      noBidCents: 52,
      noAskCents: 52,
    });
  });
});
