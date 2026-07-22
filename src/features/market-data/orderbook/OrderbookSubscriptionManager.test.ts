import { describe, expect, it } from "vitest";

import { MockKalshiWsTransport } from "./KalshiOrderbookWsClient";
import { OrderbookSubscriptionManager } from "./OrderbookSubscriptionManager";

const TICKER = "KXBTC15M-26JUL262000-30";

function subscribeAndAcknowledge(
  manager: OrderbookSubscriptionManager,
  transport: MockKalshiWsTransport,
  ticker: string,
  sid: number,
): number {
  const commandId = manager.subscribe(transport, ticker);
  manager.handleControlMessage({
    id: commandId,
    type: "subscribed",
    msg: { channel: "orderbook_delta", sid },
  });
  return commandId;
}

describe("OrderbookSubscriptionManager command lifecycle", () => {
  it("sends subscribe with explicit use_yes_price price representation", () => {
    const manager = new OrderbookSubscriptionManager();
    const transport = new MockKalshiWsTransport();

    manager.subscribe(transport, TICKER);

    expect(JSON.parse(transport.sent[0]!)).toEqual({
      id: 1,
      cmd: "subscribe",
      params: {
        channels: ["orderbook_delta"],
        market_tickers: [TICKER],
        use_yes_price: false,
      },
    });
  });

  it("maps the server sid from a subscribed response to the intended market and channel", () => {
    const manager = new OrderbookSubscriptionManager();
    const transport = new MockKalshiWsTransport();

    const commandId = manager.subscribe(transport, TICKER);
    expect(manager.getSidForTicker(TICKER)).toBeNull();
    expect(manager.getPendingCommands()).toHaveLength(1);

    const control = manager.handleControlMessage({
      id: commandId,
      type: "subscribed",
      msg: { channel: "orderbook_delta", sid: 456 },
    });

    expect(control).toEqual({
      kind: "subscriptionAcknowledged",
      commandId,
      sid: 456,
      channel: "orderbook_delta",
      marketTickers: [TICKER],
    });
    expect(manager.getSidForTicker(TICKER)).toBe(456);
    expect(manager.getPendingCommands()).toHaveLength(0);
    expect(manager.getSubscriptions()).toEqual([
      { sid: 456, channel: "orderbook_delta", marketTickers: [TICKER] },
    ]);
  });

  it("does not assume the local command id is the server sid", () => {
    const manager = new OrderbookSubscriptionManager();
    const transport = new MockKalshiWsTransport();

    const commandId = subscribeAndAcknowledge(manager, transport, TICKER, 999);

    expect(commandId).toBe(1);
    expect(manager.getSidForTicker(TICKER)).toBe(999);
  });

  it("sends get_snapshot with the acknowledged server sid", () => {
    const manager = new OrderbookSubscriptionManager();
    const transport = new MockKalshiWsTransport();
    subscribeAndAcknowledge(manager, transport, TICKER, 456);

    const result = manager.requestSnapshot(transport, TICKER);

    expect(result.status).toBe("requested");
    expect(JSON.parse(transport.sent.at(-1)!)).toEqual({
      id: 2,
      cmd: "update_subscription",
      params: {
        sids: [456],
        market_tickers: [TICKER],
        action: "get_snapshot",
      },
    });
  });

  it("refuses get_snapshot when no server sid has been acknowledged", () => {
    const manager = new OrderbookSubscriptionManager();
    const transport = new MockKalshiWsTransport();
    manager.subscribe(transport, TICKER);

    const result = manager.requestSnapshot(transport, TICKER);

    expect(result).toEqual({ status: "unavailable", reason: "no-server-sid" });
    expect(transport.sent).toHaveLength(1);
  });

  it("sends a real unsubscribe command with the server sid on market removal", () => {
    const manager = new OrderbookSubscriptionManager();
    const transport = new MockKalshiWsTransport();
    subscribeAndAcknowledge(manager, transport, TICKER, 77);

    const result = manager.unsubscribe(transport, [TICKER]);

    expect(result.requestedTickers).toEqual([TICKER]);
    expect(result.unmappedTickers).toEqual([]);
    expect(JSON.parse(transport.sent.at(-1)!)).toEqual({
      id: 2,
      cmd: "unsubscribe",
      params: { sids: [77] },
    });
  });

  it("uses update_subscription delete_markets for partial removal from a multi-market sid", () => {
    const manager = new OrderbookSubscriptionManager();
    const transport = new MockKalshiWsTransport();
    const commandId = manager.subscribe(transport, "M1");
    manager.handleControlMessage({
      id: commandId,
      type: "subscribed",
      msg: { channel: "orderbook_delta", sid: 5, market_tickers: ["M1", "M2"] },
    });

    manager.unsubscribe(transport, ["M2"]);

    expect(JSON.parse(transport.sent.at(-1)!)).toEqual({
      id: 2,
      cmd: "update_subscription",
      params: {
        sids: [5],
        market_tickers: ["M2"],
        action: "delete_markets",
      },
    });
  });

  it("removes sid mappings when an unsubscribed response is acknowledged", () => {
    const manager = new OrderbookSubscriptionManager();
    const transport = new MockKalshiWsTransport();
    subscribeAndAcknowledge(manager, transport, TICKER, 77);
    const unsubscribe = manager.unsubscribe(transport, [TICKER]);

    const control = manager.handleControlMessage({
      id: unsubscribe.commandIds[0],
      sid: 77,
      seq: 9,
      type: "unsubscribed",
    });

    expect(control?.kind).toBe("unsubscribeAcknowledged");
    expect(manager.getSidForTicker(TICKER)).toBeNull();
    expect(manager.getSubscriptions()).toHaveLength(0);
  });

  it("correlates error responses to the failed pending command", () => {
    const manager = new OrderbookSubscriptionManager();
    const transport = new MockKalshiWsTransport();
    subscribeAndAcknowledge(manager, transport, TICKER, 456);
    const request = manager.requestSnapshot(transport, TICKER);
    if (request.status !== "requested") {
      throw new Error("expected snapshot request");
    }

    const control = manager.handleControlMessage({
      id: request.commandId,
      type: "error",
      msg: { code: 12, msg: "Exactly one subscription ID is required" },
    });

    expect(control).toEqual({
      kind: "commandFailed",
      commandId: request.commandId,
      commandKind: "get_snapshot",
      marketTickers: [TICKER],
      errorCode: 12,
      errorMessage: "Exactly one subscription ID is required",
    });
    expect(manager.getPendingCommands()).toHaveLength(0);
  });

  it("classifies ok responses for get_snapshot commands as acknowledgements", () => {
    const manager = new OrderbookSubscriptionManager();
    const transport = new MockKalshiWsTransport();
    subscribeAndAcknowledge(manager, transport, TICKER, 456);
    const request = manager.requestSnapshot(transport, TICKER);
    if (request.status !== "requested") {
      throw new Error("expected snapshot request");
    }

    const control = manager.handleControlMessage({
      id: request.commandId,
      sid: 456,
      seq: 22,
      type: "ok",
      msg: { market_tickers: [TICKER] },
    });

    expect(control).toEqual({
      kind: "commandAcknowledged",
      commandId: request.commandId,
      commandKind: "get_snapshot",
      sid: 456,
      marketTickers: [TICKER],
    });
  });

  it("ignores market data payloads", () => {
    const manager = new OrderbookSubscriptionManager();

    expect(
      manager.handleControlMessage({
        type: "orderbook_delta",
        sid: 1,
        seq: 2,
        msg: { market_ticker: TICKER },
      }),
    ).toBeNull();
    expect(manager.handleControlMessage("not-an-object")).toBeNull();
  });

  it("classifies unknown subscribed command ids without creating sid mappings", () => {
    const manager = new OrderbookSubscriptionManager();
    const transport = new MockKalshiWsTransport();
    subscribeAndAcknowledge(manager, transport, TICKER, 456);

    const control = manager.handleControlMessage({
      id: 9_999,
      type: "subscribed",
      msg: { channel: "orderbook_delta", sid: 777, market_tickers: [TICKER] },
    });

    expect(control).toEqual({
      kind: "unknownControlResponse",
      responseType: "subscribed",
      commandId: 9_999,
      sid: 777,
    });
    expect(manager.getSidForTicker(TICKER)).toBe(456);
    expect(manager.getSubscriptions()).toHaveLength(1);
  });

  it("classifies unknown ok and unsubscribed command ids without mutating state", () => {
    const manager = new OrderbookSubscriptionManager();
    const transport = new MockKalshiWsTransport();
    subscribeAndAcknowledge(manager, transport, TICKER, 456);

    const okControl = manager.handleControlMessage({
      id: 9_998,
      sid: 456,
      seq: 3,
      type: "ok",
      msg: { market_tickers: [TICKER] },
    });
    const unsubscribedControl = manager.handleControlMessage({
      id: 9_997,
      sid: 456,
      seq: 4,
      type: "unsubscribed",
    });

    expect(okControl?.kind).toBe("unknownControlResponse");
    expect(unsubscribedControl?.kind).toBe("unknownControlResponse");
    expect(manager.getSidForTicker(TICKER)).toBe(456);
    expect(manager.getSubscriptions()).toHaveLength(1);
  });

  it("invalidates pending commands on reconnect so old-generation responses cannot mutate new state", () => {
    const manager = new OrderbookSubscriptionManager();
    const transport = new MockKalshiWsTransport();
    const generationBefore = manager.currentSocketGeneration;
    const oldCommandId = manager.subscribe(transport, TICKER);

    const invalidated = manager.resetForReconnect();
    expect(invalidated).toHaveLength(1);
    expect(invalidated[0]?.id).toBe(oldCommandId);
    expect(manager.currentSocketGeneration).toBe(generationBefore + 1);

    subscribeAndAcknowledge(manager, transport, TICKER, 901);

    const staleControl = manager.handleControlMessage({
      id: oldCommandId,
      type: "subscribed",
      msg: { channel: "orderbook_delta", sid: 456, market_tickers: [TICKER] },
    });

    expect(staleControl?.kind).toBe("unknownControlResponse");
    expect(manager.getSidForTicker(TICKER)).toBe(901);
  });

  it("rolls back pending state when the transport send throws", () => {
    const manager = new OrderbookSubscriptionManager();
    const transport = new MockKalshiWsTransport();
    const throwingTransport = {
      ...transport,
      send: () => {
        throw new Error("send failed");
      },
    };

    expect(() => manager.subscribe(throwingTransport, TICKER)).toThrow("send failed");
    expect(manager.getPendingCommands()).toHaveLength(0);
  });

  it("expires pending commands past the acknowledgement deadline", () => {
    let nowMs = 0;
    const manager = new OrderbookSubscriptionManager(() => nowMs);
    const transport = new MockKalshiWsTransport();
    manager.subscribe(transport, TICKER);
    expect(manager.getPendingCommands()).toHaveLength(1);

    nowMs = 9_999;
    expect(manager.expirePendingCommands(nowMs, 10_000)).toHaveLength(0);

    nowMs = 10_000;
    const expired = manager.expirePendingCommands(nowMs, 10_000);
    expect(expired).toHaveLength(1);
    expect(expired[0]?.kind).toBe("subscribe");
    expect(manager.getPendingCommands()).toHaveLength(0);
  });

  it("rebuilds sid mappings safely across reconnects", () => {
    const manager = new OrderbookSubscriptionManager();
    const transport = new MockKalshiWsTransport();
    subscribeAndAcknowledge(manager, transport, TICKER, 456);

    manager.resetForReconnect();
    expect(manager.getSidForTicker(TICKER)).toBeNull();
    expect(manager.getActiveTickers()).toEqual([]);
    expect(manager.getPendingCommands()).toEqual([]);

    subscribeAndAcknowledge(manager, transport, TICKER, 901);
    expect(manager.getSidForTicker(TICKER)).toBe(901);

    const request = manager.requestSnapshot(transport, TICKER);
    if (request.status !== "requested") {
      throw new Error("expected snapshot request");
    }
    expect(JSON.parse(transport.sent.at(-1)!).params.sids).toEqual([901]);
  });
});

describe("OrderbookSubscriptionManager.correlateSnapshotResponse", () => {
  function pendingGetSnapshot(
    manager: OrderbookSubscriptionManager,
    transport: MockKalshiWsTransport,
    sid: number,
    ticker = TICKER,
  ): number {
    subscribeAndAcknowledge(manager, transport, ticker, sid);
    const result = manager.requestSnapshot(transport, ticker);
    if (result.status !== "requested") {
      throw new Error("expected get_snapshot");
    }
    return result.commandId;
  }

  it("consumes a matching get_snapshot pending command exactly once", () => {
    const manager = new OrderbookSubscriptionManager();
    const transport = new MockKalshiWsTransport();
    const commandId = pendingGetSnapshot(manager, transport, 1);
    const otherPendingBefore = manager.getPendingCommands().length;

    const result = manager.correlateSnapshotResponse({
      commandId,
      sid: 1,
      marketTicker: TICKER,
    });

    expect(result).toEqual({
      status: "acknowledged",
      commandId,
      commandKind: "get_snapshot",
      sid: 1,
      marketTickers: [TICKER],
    });
    expect(manager.getPendingCommands()).toHaveLength(otherPendingBefore - 1);
    expect(manager.getPendingCommands().some((command) => command.id === commandId)).toBe(
      false,
    );
  });

  it("rejects unknown command ids without mutating pending state", () => {
    const manager = new OrderbookSubscriptionManager();
    const transport = new MockKalshiWsTransport();
    const commandId = pendingGetSnapshot(manager, transport, 1);
    const before = manager.getPendingCommands();

    const result = manager.correlateSnapshotResponse({
      commandId: commandId + 99,
      sid: 1,
      marketTicker: TICKER,
    });

    expect(result.status).toBe("rejected");
    if (result.status === "rejected") {
      expect(result.reason).toBe("unknown-command-id");
    }
    expect(manager.getPendingCommands()).toEqual(before);
  });

  it("rejects wrong command kinds without consuming the pending command", () => {
    const manager = new OrderbookSubscriptionManager();
    const transport = new MockKalshiWsTransport();
    const subscribeId = manager.subscribe(transport, TICKER);

    const result = manager.correlateSnapshotResponse({
      commandId: subscribeId,
      sid: 1,
      marketTicker: TICKER,
    });

    expect(result).toMatchObject({
      status: "rejected",
      reason: "wrong-command-kind",
      pendingKind: "subscribe",
    });
    expect(manager.getPendingCommands()).toHaveLength(1);
    expect(manager.getPendingCommands()[0]?.id).toBe(subscribeId);
  });

  it("rejects sid mismatches without consuming the pending command", () => {
    const manager = new OrderbookSubscriptionManager();
    const transport = new MockKalshiWsTransport();
    const commandId = pendingGetSnapshot(manager, transport, 1);

    const result = manager.correlateSnapshotResponse({
      commandId,
      sid: 99,
      marketTicker: TICKER,
    });

    expect(result).toMatchObject({
      status: "rejected",
      reason: "sid-mismatch",
    });
    expect(manager.getPendingCommands().some((command) => command.id === commandId)).toBe(
      true,
    );
  });

  it("rejects ticker mismatches without consuming the pending command", () => {
    const manager = new OrderbookSubscriptionManager();
    const transport = new MockKalshiWsTransport();
    const commandId = pendingGetSnapshot(manager, transport, 1);

    const result = manager.correlateSnapshotResponse({
      commandId,
      sid: 1,
      marketTicker: "KXBTC15M-OTHER",
    });

    expect(result).toMatchObject({
      status: "rejected",
      reason: "ticker-mismatch",
    });
    expect(manager.getPendingCommands().some((command) => command.id === commandId)).toBe(
      true,
    );
  });

  it("treats duplicate correlations as fail-closed and idempotent", () => {
    const manager = new OrderbookSubscriptionManager();
    const transport = new MockKalshiWsTransport();
    const commandId = pendingGetSnapshot(manager, transport, 1);

    expect(
      manager.correlateSnapshotResponse({
        commandId,
        sid: 1,
        marketTicker: TICKER,
      }).status,
    ).toBe("acknowledged");

    const duplicate = manager.correlateSnapshotResponse({
      commandId,
      sid: 1,
      marketTicker: TICKER,
    });
    expect(duplicate).toMatchObject({
      status: "rejected",
      reason: "duplicate-or-stale",
    });
    expect(manager.getPendingCommands()).toHaveLength(0);
  });

  it("leaves other pending commands untouched on a successful correlation", () => {
    const manager = new OrderbookSubscriptionManager();
    const transport = new MockKalshiWsTransport();
    const otherTicker = "KXBTC15M-OTHER";
    subscribeAndAcknowledge(manager, transport, TICKER, 1);
    subscribeAndAcknowledge(manager, transport, otherTicker, 2);
    const snapshot = manager.requestSnapshot(transport, TICKER);
    if (snapshot.status !== "requested") {
      throw new Error("expected get_snapshot");
    }
    const unsubscribe = manager.unsubscribe(transport, [otherTicker]);
    expect(unsubscribe.commandIds).toHaveLength(1);

    manager.correlateSnapshotResponse({
      commandId: snapshot.commandId,
      sid: 1,
      marketTicker: TICKER,
    });

    const pending = manager.getPendingCommands();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.kind).toBe("unsubscribe");
    expect(pending[0]?.id).toBe(unsubscribe.commandIds[0]);
  });

  it("clears consumed snapshot ids on reconnect so generations stay isolated", () => {
    const manager = new OrderbookSubscriptionManager();
    const transport = new MockKalshiWsTransport();
    const commandId = pendingGetSnapshot(manager, transport, 1);
    manager.correlateSnapshotResponse({
      commandId,
      sid: 1,
      marketTicker: TICKER,
    });

    manager.resetForReconnect();
    subscribeAndAcknowledge(manager, transport, TICKER, 7);
    const next = manager.requestSnapshot(transport, TICKER);
    if (next.status !== "requested") {
      throw new Error("expected get_snapshot");
    }

    // Reused numeric ids after reconnect are not treated as duplicates of the
    // previous generation once resetForReconnect clears consumed ids.
    expect(
      manager.correlateSnapshotResponse({
        commandId: next.commandId,
        sid: 7,
        marketTicker: TICKER,
      }).status,
    ).toBe("acknowledged");
  });
});
