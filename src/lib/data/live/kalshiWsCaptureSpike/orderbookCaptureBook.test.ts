import { describe, expect, it } from "vitest";

import { OrderbookCaptureBook } from "./orderbookCaptureBook";

const MARKET = "KXBTC15M-TEST";

describe("OrderbookCaptureBook", () => {
  it("initializes from snapshot and derives YES ask from best NO bid", () => {
    const book = new OrderbookCaptureBook({
      marketTicker: MARKET,
      seriesTicker: "KXBTC15M",
    });

    book.applySnapshot({
      type: "orderbook_snapshot",
      sid: 1,
      seq: 1,
      msg: {
        market_ticker: MARKET,
        market_id: "id",
        yes_dollars_fp: [["0.4500", "100.00"]],
        no_dollars_fp: [["0.5000", "80.00"]],
      },
    });

    const top = book.toTopOfBookRecord({
      runId: "run",
      receivedAtLocal: "2026-07-08T12:00:00.000Z",
      exchangeTimestampMs: null,
      rawMessageType: "orderbook_snapshot",
    });

    expect(top.yesBestBidCents).toBe(45);
    expect(top.noBestBidCents).toBe(50);
    expect(top.yesBestAskCents).toBe(50);
    expect(top.noBestAskCents).toBe(55);
    expect(top.yesSpreadCents).toBe(5);
    expect(top.bookState).toBe("valid");
  });

  it("updates levels from deltas and removes zero-size levels", () => {
    const book = new OrderbookCaptureBook({
      marketTicker: MARKET,
      seriesTicker: "KXBTC15M",
    });

    book.applySnapshot({
      type: "orderbook_snapshot",
      sid: 1,
      seq: 1,
      msg: {
        market_ticker: MARKET,
        market_id: "id",
        yes_dollars_fp: [["0.4500", "100.00"]],
        no_dollars_fp: [["0.5000", "80.00"]],
      },
    });

    book.applyDelta({
      type: "orderbook_delta",
      sid: 1,
      seq: 2,
      msg: {
        market_ticker: MARKET,
        market_id: "id",
        price_dollars: "0.4500",
        delta_fp: "-100.00",
        side: "yes",
      },
    });

    const top = book.toTopOfBookRecord({
      runId: "run",
      receivedAtLocal: "2026-07-08T12:00:00.000Z",
      exchangeTimestampMs: null,
      rawMessageType: "orderbook_delta",
    });

    expect(top.yesBestBidCents).toBeNull();
    expect(top.bookState).toBe("valid");
  });

  it("marks gap-detected on sequence gaps and stays invalid until snapshot recovery", () => {
    const book = new OrderbookCaptureBook({
      marketTicker: MARKET,
      seriesTicker: "KXBTC15M",
    });

    book.applySnapshot({
      type: "orderbook_snapshot",
      sid: 1,
      seq: 1,
      msg: {
        market_ticker: MARKET,
        market_id: "id",
        yes_dollars_fp: [["0.4500", "100.00"]],
        no_dollars_fp: [["0.5000", "80.00"]],
      },
    });

    expect(book.applyDelta({
      type: "orderbook_delta",
      sid: 1,
      seq: 2,
      msg: {
        market_ticker: MARKET,
        market_id: "id",
        price_dollars: "0.4600",
        delta_fp: "10.00",
        side: "yes",
      },
    })).toBe("accepted");

    expect(book.applyDelta({
      type: "orderbook_delta",
      sid: 1,
      seq: 5,
      msg: {
        market_ticker: MARKET,
        market_id: "id",
        price_dollars: "0.4700",
        delta_fp: "5.00",
        side: "yes",
      },
    })).toBe("gap");

    expect(book.bookState).toBe("gap-detected");

    book.applySnapshot({
      type: "orderbook_snapshot",
      sid: 1,
      seq: 6,
      msg: {
        market_ticker: MARKET,
        market_id: "id",
        yes_dollars_fp: [["0.4700", "30.00"]],
        no_dollars_fp: [["0.5100", "90.00"]],
      },
    });

    expect(book.bookState).toBe("valid");
  });

  it("counts duplicate/out-of-order sequences", () => {
    const book = new OrderbookCaptureBook({
      marketTicker: MARKET,
      seriesTicker: "KXBTC15M",
    });

    book.applySnapshot({
      type: "orderbook_snapshot",
      sid: 1,
      seq: 1,
      msg: {
        market_ticker: MARKET,
        market_id: "id",
        yes_dollars_fp: [["0.4500", "100.00"]],
        no_dollars_fp: [["0.5000", "80.00"]],
      },
    });

    expect(book.applyDelta({
      type: "orderbook_delta",
      sid: 1,
      seq: 2,
      msg: {
        market_ticker: MARKET,
        market_id: "id",
        price_dollars: "0.4600",
        delta_fp: "10.00",
        side: "yes",
      },
    })).toBe("accepted");

    expect(book.applyDelta({
      type: "orderbook_delta",
      sid: 1,
      seq: 2,
      msg: {
        market_ticker: MARKET,
        market_id: "id",
        price_dollars: "0.4600",
        delta_fp: "1.00",
        side: "yes",
      },
    })).toBe("duplicate");
  });
});
