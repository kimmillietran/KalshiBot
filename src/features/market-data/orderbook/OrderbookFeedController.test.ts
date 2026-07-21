import { describe, expect, it } from "vitest";

import { MockKalshiWsTransport } from "./KalshiOrderbookWsClient";
import { OrderbookFeedController } from "./OrderbookFeedController";
import { OrderbookSubscriptionManager } from "./OrderbookSubscriptionManager";

describe("OrderbookSubscriptionManager", () => {
  it("builds deterministic subscribe commands", () => {
    const manager = new OrderbookSubscriptionManager();
    const transport = new MockKalshiWsTransport();

    manager.subscribe(transport, "KXBTC15M-26JUN261930-30");

    expect(JSON.parse(transport.sent[0]!)).toEqual({
      id: 1,
      cmd: "subscribe",
      params: {
        channels: ["orderbook_delta"],
        market_tickers: ["KXBTC15M-26JUN261930-30"],
        use_yes_price: false,
      },
    });
  });
});

describe("OrderbookFeedController", () => {
  it("hydrates from REST then applies websocket deltas", async () => {
    const transport = new MockKalshiWsTransport();
    const scheduled: Array<() => void> = [];

    const controller = new OrderbookFeedController({
      transport,
      wsUrl: "wss://example.test/ws",
      fetchSnapshot: async () => ({
        yesLevels: [["0.4800", "100.00"]],
        noLevels: [["0.5200", "80.00"]],
      }),
      now: () => 1_000,
      scheduleReconnect: (_delay, callback) => {
        scheduled.push(callback);
        return scheduled.length;
      },
      clearScheduled: () => undefined,
    });

    const snapshots: Array<ReturnType<OrderbookFeedController["getSnapshot"]>> = [];
    controller.subscribe((snapshot) => {
      snapshots.push(snapshot);
    });

    await controller.start("KXBTC15M-26JUN261930-30");

    expect(snapshots.at(-1)?.pricing?.yes.bidCents).toBe(48);
    expect(snapshots.at(-1)?.pricing?.no.bidCents).toBe(52);

    transport.emitMessage(
      JSON.stringify({
        type: "orderbook_delta",
        sid: 2,
        seq: 1,
        msg: {
          market_ticker: "KXBTC15M-26JUN261930-30",
          market_id: "market-id",
          price_dollars: "0.4900",
          delta_fp: "25.00",
          side: "yes",
        },
      }),
    );

    expect(controller.getSnapshot().pricing?.yes.bidCents).toBe(49);
    controller.dispose();
  });

  it("requests REST resync on sequence gaps", async () => {
    const transport = new MockKalshiWsTransport();
    let resyncCount = 0;

    const controller = new OrderbookFeedController({
      transport,
      wsUrl: "wss://example.test/ws",
      fetchSnapshot: async () => {
        resyncCount += 1;
        return {
          yesLevels: [["0.4800", "100.00"]],
          noLevels: [["0.5200", "80.00"]],
        };
      },
      now: () => 1_000,
      scheduleReconnect: () => 1,
      clearScheduled: () => undefined,
    });

    await controller.start("KXBTC15M-26JUN261930-30");
    const initialResyncs = resyncCount;

    transport.emitMessage(
      JSON.stringify({
        type: "orderbook_snapshot",
        sid: 2,
        seq: 1,
        msg: {
          market_ticker: "KXBTC15M-26JUN261930-30",
          market_id: "market-id",
          yes_dollars_fp: [["0.4800", "100.00"]],
          no_dollars_fp: [["0.5200", "80.00"]],
        },
      }),
    );

    transport.emitMessage(
      JSON.stringify({
        type: "orderbook_delta",
        sid: 2,
        seq: 5,
        msg: {
          market_ticker: "KXBTC15M-26JUN261930-30",
          market_id: "market-id",
          price_dollars: "0.4900",
          delta_fp: "25.00",
          side: "yes",
        },
      }),
    );

    await Promise.resolve();
    expect(resyncCount).toBeGreaterThan(initialResyncs);
    controller.dispose();
  });

  it("rehydrates from REST when reconnecting after a disconnect", async () => {
    const transport = new MockKalshiWsTransport();
    const scheduled: Array<() => void> = [];
    let resyncCount = 0;

    const controller = new OrderbookFeedController({
      transport,
      wsUrl: "wss://example.test/ws",
      fetchSnapshot: async () => {
        resyncCount += 1;
        return {
          yesLevels: [["0.4800", "100.00"]],
          noLevels: [["0.5200", "80.00"]],
        };
      },
      now: () => 1_000,
      scheduleReconnect: (_delay, callback) => {
        scheduled.push(callback);
        return scheduled.length;
      },
      clearScheduled: () => undefined,
    });

    await controller.start("KXBTC15M-26JUN261930-30");
    const resyncsAfterStart = resyncCount;

    transport.emitClose();
    scheduled.at(-1)?.();
    await Promise.resolve();

    expect(resyncCount).toBeGreaterThan(resyncsAfterStart);
    expect(controller.getSnapshot().status).toBe("live");
    controller.dispose();
  });

  it("marks the feed stale and resyncs when updates stop", async () => {
    const transport = new MockKalshiWsTransport();
    const scheduled: Array<() => void> = [];
    let resyncCount = 0;
    let nowMs = 1_000;

    const controller = new OrderbookFeedController({
      transport,
      wsUrl: "wss://example.test/ws",
      fetchSnapshot: async () => {
        resyncCount += 1;
        return {
          yesLevels: [["0.4800", "100.00"]],
          noLevels: [["0.5200", "80.00"]],
        };
      },
      now: () => nowMs,
      staleThresholdMs: 100,
      scheduleReconnect: (_delay, callback) => {
        scheduled.push(callback);
        return scheduled.length;
      },
      clearScheduled: () => undefined,
    });

    await controller.start("KXBTC15M-26JUN261930-30");
    const resyncsAfterStart = resyncCount;
    nowMs = 1_200;
    scheduled.at(-1)?.();
    await Promise.resolve();

    expect(controller.getSnapshot().status).toBe("live");
    expect(resyncCount).toBeGreaterThan(resyncsAfterStart);
    controller.dispose();
  });

  it("ignores malformed websocket payloads without changing pricing", async () => {
    const transport = new MockKalshiWsTransport();

    const controller = new OrderbookFeedController({
      transport,
      wsUrl: "wss://example.test/ws",
      fetchSnapshot: async () => ({
        yesLevels: [["0.4800", "100.00"]],
        noLevels: [["0.5200", "80.00"]],
      }),
      now: () => 1_000,
      scheduleReconnect: () => 1,
      clearScheduled: () => undefined,
    });

    await controller.start("KXBTC15M-26JUN261930-30");
    const pricingBefore = controller.getSnapshot().pricing?.yes.bidCents;

    transport.emitMessage("{not-json");
    transport.emitMessage(JSON.stringify({ type: "unknown", msg: {} }));

    expect(controller.getSnapshot().pricing?.yes.bidCents).toBe(pricingBefore);
    controller.dispose();
  });

  it("accepts the first delta after REST resync then enforces strict sequencing", async () => {
    const transport = new MockKalshiWsTransport();
    let resyncCount = 0;

    const controller = new OrderbookFeedController({
      transport,
      wsUrl: "wss://example.test/ws",
      fetchSnapshot: async () => {
        resyncCount += 1;
        return {
          yesLevels: [["0.4800", "100.00"]],
          noLevels: [["0.5200", "80.00"]],
        };
      },
      now: () => 1_000,
      scheduleReconnect: () => 1,
      clearScheduled: () => undefined,
    });

    await controller.start("KXBTC15M-26JUN261930-30");

    transport.emitMessage(
      JSON.stringify({
        type: "orderbook_delta",
        sid: 2,
        seq: 10,
        msg: {
          market_ticker: "KXBTC15M-26JUN261930-30",
          market_id: "market-id",
          price_dollars: "0.4900",
          delta_fp: "25.00",
          side: "yes",
        },
      }),
    );

    expect(controller.getSnapshot().lastSeq).toBe(10);

    transport.emitMessage(
      JSON.stringify({
        type: "orderbook_snapshot",
        sid: 2,
        seq: 20,
        msg: {
          market_ticker: "KXBTC15M-26JUN261930-30",
          market_id: "market-id",
          yes_dollars_fp: [["0.4800", "100.00"]],
          no_dollars_fp: [["0.5200", "80.00"]],
        },
      }),
    );

    const resyncsAfterSnapshot = resyncCount;

    transport.emitMessage(
      JSON.stringify({
        type: "orderbook_delta",
        sid: 2,
        seq: 25,
        msg: {
          market_ticker: "KXBTC15M-26JUN261930-30",
          market_id: "market-id",
          price_dollars: "0.5000",
          delta_fp: "10.00",
          side: "yes",
        },
      }),
    );

    await Promise.resolve();
    expect(resyncCount).toBeGreaterThan(resyncsAfterSnapshot);
    controller.dispose();
  });
});
