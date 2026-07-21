import { describe, expect, it } from "vitest";

import { MockKalshiWsTransport } from "@/features/market-data/orderbook/KalshiOrderbookWsClient";
import { OrderbookSubscriptionManager } from "@/features/market-data/orderbook/OrderbookSubscriptionManager";

import {
  COMMAND_ACK_TIMEOUT_MS,
  ForwardCaptureMessageProcessor,
  RECOVERY_ACK_TIMEOUT_MS,
  RECOVERY_MAX_ATTEMPTS,
  RECOVERY_SNAPSHOT_TIMEOUT_MS,
} from "./forwardCaptureMessageProcessor";
import { OrderbookCaptureBook } from "./orderbookCaptureBook";
import {
  createJsonlForwardCaptureWriter,
  createRunOutputPaths,
} from "./jsonlForwardCaptureWriter";
import type {
  ForwardCaptureSubscriptionLifecycleEvent,
  ForwardQuoteCaptureConfig,
} from "./forwardQuoteCaptureTypes";

const TICKER = "KXBTC15M-26JUL262000-30";

const CONFIG: ForwardQuoteCaptureConfig = {
  series: "KXBTC15M",
  durationMinutes: 1,
  maxMarkets: 1,
  outputDir: "data/live-capture/forward-quotes",
  dryRun: false,
  captureBtcSpot: false,
  rolloverCheckSeconds: 30,
  healthFlushSeconds: 60,
  topOfBookThrottleMs: 0,
  wsWatchdogEnabled: false,
  wsSoftSilenceThresholdMs: 30_000,
  wsHardStallThresholdMs: 60_000,
  wsProbeGraceMs: 10_000,
  wsRecoveryMaxAttempts: 5,
  priceRepresentation: "legacy-no-leg",
};

function snapshotMessage(sid: number, seq: number, ticker = TICKER) {
  return {
    type: "orderbook_snapshot",
    sid,
    seq,
    msg: {
      market_ticker: ticker,
      market_id: "market-id",
      yes_dollars_fp: [["0.4500", "100.00"]],
      no_dollars_fp: [["0.5000", "80.00"]],
    },
  };
}

function deltaMessage(sid: number, seq: number, ticker = TICKER) {
  return {
    type: "orderbook_delta",
    sid,
    seq,
    msg: {
      market_ticker: ticker,
      market_id: "market-id",
      price_dollars: "0.4600",
      delta_fp: "5.00",
      side: "yes" as const,
    },
  };
}

function createHarness() {
  const transport = new MockKalshiWsTransport();
  let monotonicMs = 0;
  const manager = new OrderbookSubscriptionManager(() => monotonicMs);
  const lifecycleEvents: ForwardCaptureSubscriptionLifecycleEvent[] = [];
  const errors: string[] = [];
  const recoveryExhaustedMarkets: string[] = [];
  const livenessSignals = { count: 0 };
  const appended: Record<string, string[]> = {};

  const io = {
    writeFile: () => {},
    appendFile: (path: string, data: string) => {
      appended[path] = [...(appended[path] ?? []), data];
    },
    mkdirSync: () => {},
    now: () => new Date("2026-07-20T19:00:00.000Z"),
    monotonicNowMs: () => monotonicMs,
  };
  const paths = createRunOutputPaths(CONFIG.outputDir, "run-resync");
  const writer = createJsonlForwardCaptureWriter(io, paths);

  const processor = new ForwardCaptureMessageProcessor({
    runId: "run-resync",
    seriesTicker: "KXBTC15M",
    config: CONFIG,
    writer,
    now: io.now,
    monotonicNowMs: io.monotonicNowMs,
    onControlMessage: (payload) => manager.handleControlMessage(payload),
    requestSnapshotRecovery: (marketTicker) => {
      try {
        const result = manager.requestSnapshot(transport, marketTicker);
        if (result.status === "requested") {
          return result;
        }
        return { status: "unavailable", reason: "no acknowledged sid" };
      } catch (error) {
        return {
          status: "send-failed",
          reason: error instanceof Error ? error.message : "send failed",
        };
      }
    },
    onLifecycleEvent: (event) => lifecycleEvents.push(event),
    onCommandError: (message) => errors.push(message),
    onRecoveryExhausted: (marketTicker) => {
      recoveryExhaustedMarkets.push(marketTicker);
    },
    expirePendingCommands: (nowMs) =>
      manager.expirePendingCommands(nowMs, COMMAND_ACK_TIMEOUT_MS),
    getPendingCommandCount: () => manager.getPendingCommands().length,
    onTopOfBookEmitted: () => {
      livenessSignals.count += 1;
    },
  });

  const subscribeAndAck = (sid: number, ticker = TICKER) => {
    const commandId = manager.subscribe(transport, ticker);
    processor.processRawPayload({
      id: commandId,
      type: "subscribed",
      msg: { channel: "orderbook_delta", sid },
    });
  };

  return {
    transport,
    manager,
    processor,
    lifecycleEvents,
    errors,
    recoveryExhaustedMarkets,
    livenessSignals,
    appended,
    paths,
    subscribeAndAck,
    advanceMonotonic: (ms: number) => {
      monotonicMs += ms;
    },
  };
}

function sentCommands(transport: MockKalshiWsTransport) {
  return transport.sent.map((payload) => JSON.parse(payload));
}

describe("sequence gap episode handling (July 20 regression shape)", () => {
  it("one discontinuity followed by 10,000 deltas yields one episode and one outstanding recovery request", () => {
    const harness = createHarness();
    harness.subscribeAndAck(456);
    harness.processor.processRawPayload(snapshotMessage(456, 1));
    harness.processor.processRawPayload(deltaMessage(456, 2));

    // Discontinuity: seq jumps from 2 to 10.
    harness.processor.processRawPayload(deltaMessage(456, 10));
    for (let seq = 11; seq < 10_011; seq += 1) {
      harness.processor.processRawPayload(deltaMessage(456, seq));
    }

    const diagnostics = harness.processor.diagnostics;
    expect(diagnostics.sequenceGapEpisodeCount).toBe(1);
    expect(diagnostics.sequenceGapCount).toBe(1);
    expect(diagnostics.deltasQuarantinedDuringResync).toBe(10_000);
    expect(diagnostics.snapshotRecoveryRequestCount).toBe(1);
    expect(harness.processor.hasOutstandingRecovery(TICKER)).toBe(true);

    const recoveryCommands = sentCommands(harness.transport).filter(
      (command) => command.params?.action === "get_snapshot",
    );
    expect(recoveryCommands).toHaveLength(1);
    expect(recoveryCommands[0].params.sids).toEqual([456]);

    expect(
      harness.lifecycleEvents.filter((event) => event.type === "snapshotRecoveryRequested"),
    ).toHaveLength(1);
  });

  it("a valid fresh snapshot restores the book to valid and completes recovery", () => {
    const harness = createHarness();
    harness.subscribeAndAck(456);
    harness.processor.processRawPayload(snapshotMessage(456, 1));
    harness.processor.processRawPayload(deltaMessage(456, 10));
    harness.processor.processRawPayload(deltaMessage(456, 11));

    harness.processor.processRawPayload(snapshotMessage(456, 20));

    const book = harness.processor.books.get(TICKER);
    expect(book?.bookState).toBe("valid");
    expect(harness.processor.diagnostics.snapshotRecoverySuccessCount).toBe(1);
    expect(harness.processor.diagnostics.resyncSuccessCount).toBe(1);
    expect(harness.processor.hasOutstandingRecovery(TICKER)).toBe(false);
    expect(
      harness.lifecycleEvents.some((event) => event.type === "snapshotRecoverySucceeded"),
    ).toBe(true);

    // Stream continues cleanly from the snapshot sequence.
    harness.processor.processRawPayload(deltaMessage(456, 21));
    expect(book?.bookState).toBe("valid");
    expect(harness.processor.diagnostics.sequenceGapEpisodeCount).toBe(1);
  });

  it("an invalid or stale snapshot does not restore the book", () => {
    const harness = createHarness();
    harness.subscribeAndAck(456);
    harness.processor.processRawPayload(snapshotMessage(456, 1));
    harness.processor.processRawPayload(deltaMessage(456, 50));

    // Snapshot older than the already-observed seq 50 on the same sid.
    harness.processor.processRawPayload(snapshotMessage(456, 5));

    const book = harness.processor.books.get(TICKER);
    expect(book?.bookState).not.toBe("valid");
    expect(harness.processor.diagnostics.staleSnapshotsRejected).toBe(1);
    expect(harness.processor.diagnostics.snapshotRecoverySuccessCount).toBe(0);
  });

  it("a WebSocket error response fails recovery visibly and allows a later retry", () => {
    const harness = createHarness();
    harness.subscribeAndAck(456);
    harness.processor.processRawPayload(snapshotMessage(456, 1));
    harness.processor.processRawPayload(deltaMessage(456, 10));

    const recoveryCommand = sentCommands(harness.transport).find(
      (command) => command.params?.action === "get_snapshot",
    );
    expect(recoveryCommand).toBeDefined();

    harness.processor.processRawPayload({
      id: recoveryCommand.id,
      type: "error",
      msg: { code: 12, msg: "Exactly one subscription ID is required" },
    });

    expect(harness.processor.diagnostics.commandErrorsReceived).toBe(1);
    expect(harness.processor.diagnostics.snapshotRecoveryFailureCount).toBe(1);
    expect(harness.processor.hasOutstandingRecovery(TICKER)).toBe(false);
    expect(
      harness.lifecycleEvents.some((event) => event.type === "snapshotRecoveryFailed"),
    ).toBe(true);
    expect(
      harness.errors.some((message) => message.includes("snapshot recovery command failed")),
    ).toBe(true);

    // Within the cooldown no new request is sent per delta.
    harness.processor.processRawPayload(deltaMessage(456, 11));
    expect(harness.processor.diagnostics.snapshotRecoveryRequestCount).toBe(1);

    // After the cooldown, exactly one new outstanding request is issued.
    harness.advanceMonotonic(6_000);
    harness.processor.processRawPayload(deltaMessage(456, 12));
    harness.processor.processRawPayload(deltaMessage(456, 13));
    expect(harness.processor.diagnostics.snapshotRecoveryRequestCount).toBe(2);
    expect(harness.processor.hasOutstandingRecovery(TICKER)).toBe(true);
  });

  it("acknowledges get_snapshot ok responses without marking recovery successful", () => {
    const harness = createHarness();
    harness.subscribeAndAck(456);
    harness.processor.processRawPayload(snapshotMessage(456, 1));
    harness.processor.processRawPayload(deltaMessage(456, 10));

    const recoveryCommand = sentCommands(harness.transport).find(
      (command) => command.params?.action === "get_snapshot",
    );
    harness.processor.processRawPayload({
      id: recoveryCommand.id,
      sid: 456,
      seq: 30,
      type: "ok",
      msg: { market_tickers: [TICKER] },
    });

    expect(
      harness.lifecycleEvents.some(
        (event) => event.type === "snapshotRecoveryAcknowledged",
      ),
    ).toBe(true);
    expect(harness.processor.diagnostics.snapshotRecoverySuccessCount).toBe(0);
    expect(harness.processor.books.get(TICKER)?.bookState).not.toBe("valid");
  });

  it("quarantined deltas are not applied to book levels", () => {
    const harness = createHarness();
    harness.subscribeAndAck(456);
    harness.processor.processRawPayload(snapshotMessage(456, 1));
    const book = harness.processor.books.get(TICKER);
    const yesLevelsBefore = new Map(book!.yesBids);

    harness.processor.processRawPayload(deltaMessage(456, 10));
    harness.processor.processRawPayload(deltaMessage(456, 11));

    expect(book!.yesBids).toEqual(yesLevelsBefore);
  });
});

describe("closed market handling", () => {
  it("closed-market snapshots and deltas cannot silently reactivate the book", () => {
    const harness = createHarness();
    harness.subscribeAndAck(456);
    harness.processor.processRawPayload(snapshotMessage(456, 1));
    harness.processor.markMarketClosed(TICKER);

    harness.processor.processRawPayload(snapshotMessage(456, 2));
    harness.processor.processRawPayload(deltaMessage(456, 3));

    const book = harness.processor.books.get(TICKER);
    expect(book?.bookState).toBe("closed");
    expect(harness.processor.diagnostics.snapshotsReceived).toBe(1);
    expect(harness.processor.diagnostics.sequenceGapEpisodeCount).toBe(0);
  });
});

describe("new-sid message handling", () => {
  it("treats deltas from a different sid as a discontinuity and recovers via a fresh snapshot", () => {
    const harness = createHarness();
    harness.subscribeAndAck(456);
    harness.processor.processRawPayload(snapshotMessage(456, 1));
    harness.processor.processRawPayload(deltaMessage(456, 2));

    // Stream switches to a different server subscription id.
    harness.processor.processRawPayload(deltaMessage(900, 1));
    expect(harness.processor.diagnostics.sequenceGapEpisodeCount).toBe(1);
    expect(harness.processor.books.get(TICKER)?.bookState).not.toBe("valid");

    // A fresh snapshot on the new sid restores the book; the old sid's high
    // sequence (2) does not poison stale detection on the new sid.
    harness.processor.processRawPayload(snapshotMessage(900, 1));
    expect(harness.processor.books.get(TICKER)?.bookState).toBe("valid");
  });
});

describe("explicit price representation", () => {
  it("records legacy-no-leg provenance and reconstructs YES/NO bid and derived ask correctly", () => {
    const harness = createHarness();
    harness.subscribeAndAck(456);

    const subscribeCommand = sentCommands(harness.transport)[0];
    expect(subscribeCommand.params.use_yes_price).toBe(false);

    harness.processor.processRawPayload(snapshotMessage(456, 1));
    const record = harness.processor.books.get(TICKER)!.toTopOfBookRecord({
      runId: "run-resync",
      receivedAtLocal: "2026-07-20T19:00:01.000Z",
      exchangeTimestampMs: null,
    });

    expect(record.priceRepresentation).toBe("legacy-no-leg");
    // Snapshot: yes bid 45c (yes-leg), no bid 50c (no-leg).
    expect(record.yesBestBidCents).toBe(45);
    expect(record.noBestBidCents).toBe(50);
    // Derived asks: yesAsk = 100 - noBid, noAsk = 100 - yesBid.
    expect(record.yesBestAskCents).toBe(50);
    expect(record.noBestAskCents).toBe(55);
  });
});

describe("bounded snapshot recovery lifecycle (July 20 acknowledged-but-no-snapshot shape)", () => {
  it("times out visibly when the get_snapshot command is never acknowledged", () => {
    const harness = createHarness();
    harness.subscribeAndAck(456);
    harness.processor.processRawPayload(snapshotMessage(456, 1));
    harness.processor.processRawPayload(deltaMessage(456, 10));
    expect(harness.processor.hasOutstandingRecovery(TICKER)).toBe(true);

    harness.advanceMonotonic(RECOVERY_ACK_TIMEOUT_MS);
    harness.processor.checkTimeouts();

    expect(harness.processor.hasOutstandingRecovery(TICKER)).toBe(false);
    expect(harness.processor.diagnostics.snapshotRecoveryTimeoutCount).toBe(1);
    expect(harness.processor.diagnostics.snapshotRecoveryFailureCount).toBe(1);
    expect(
      harness.lifecycleEvents.some((event) => event.type === "snapshotRecoveryFailed"),
    ).toBe(true);
    expect(
      harness.errors.some((message) => message.includes("never acknowledged")),
    ).toBe(true);
  });

  it("gap, ok acknowledgement, no snapshot, continuing deltas: times out, retries bounded, never stays outstanding forever", () => {
    const harness = createHarness();
    harness.subscribeAndAck(456);
    harness.processor.processRawPayload(snapshotMessage(456, 1));

    // Gap initiates recovery.
    harness.processor.processRawPayload(deltaMessage(456, 10));
    const recoveryCommand = sentCommands(harness.transport).find(
      (command) => command.params?.action === "get_snapshot",
    );
    expect(recoveryCommand).toBeDefined();

    // ok acknowledgement arrives, but no fresh orderbook_snapshot ever does.
    harness.processor.processRawPayload({
      id: recoveryCommand.id,
      sid: 456,
      seq: 30,
      type: "ok",
      msg: { market_tickers: [TICKER] },
    });
    expect(harness.processor.hasOutstandingRecovery(TICKER)).toBe(true);

    // Continuing deltas keep arriving; recovery still outstanding within deadline.
    harness.processor.processRawPayload(deltaMessage(456, 11));
    expect(harness.processor.diagnostics.snapshotRecoveryRequestCount).toBe(1);

    // Post-acknowledgement snapshot deadline elapses: visible failure.
    harness.advanceMonotonic(RECOVERY_SNAPSHOT_TIMEOUT_MS);
    harness.processor.processRawPayload(deltaMessage(456, 12));

    expect(harness.processor.diagnostics.snapshotRecoveryTimeoutCount).toBe(1);
    expect(
      harness.lifecycleEvents.some(
        (event) =>
          event.type === "snapshotRecoveryFailed"
          && event.errorMessage?.includes("no fresh snapshot"),
      ),
    ).toBe(true);
    expect(
      harness.errors.some((message) => message.includes("no fresh snapshot")),
    ).toBe(true);

    // Bounded retry: after the cooldown a second request is issued.
    harness.advanceMonotonic(6_000);
    harness.processor.processRawPayload(deltaMessage(456, 13));
    expect(harness.processor.diagnostics.snapshotRecoveryRequestCount).toBe(2);
    expect(harness.processor.hasOutstandingRecovery(TICKER)).toBe(true);
  });

  it("stale snapshots do not complete a recovery whose deadline then expires", () => {
    const harness = createHarness();
    harness.subscribeAndAck(456);
    harness.processor.processRawPayload(snapshotMessage(456, 1));
    harness.processor.processRawPayload(deltaMessage(456, 50));

    // Stale snapshot (older than observed seq 50) cannot complete recovery.
    harness.processor.processRawPayload(snapshotMessage(456, 5));
    expect(harness.processor.diagnostics.staleSnapshotsRejected).toBe(1);
    expect(harness.processor.hasOutstandingRecovery(TICKER)).toBe(true);

    // The recovery deadline still expires visibly.
    harness.advanceMonotonic(RECOVERY_ACK_TIMEOUT_MS);
    harness.processor.checkTimeouts();
    expect(harness.processor.hasOutstandingRecovery(TICKER)).toBe(false);
    expect(harness.processor.diagnostics.snapshotRecoveryTimeoutCount).toBe(1);
  });

  it("exhausts bounded retries and escalates to socket-level recovery exactly once", () => {
    const harness = createHarness();
    harness.subscribeAndAck(456);
    harness.processor.processRawPayload(snapshotMessage(456, 1));
    harness.processor.processRawPayload(deltaMessage(456, 10));

    // Burn through the bounded attempts with ack timeouts + cooldowns.
    for (let attempt = 1; attempt <= RECOVERY_MAX_ATTEMPTS; attempt += 1) {
      expect(harness.processor.diagnostics.snapshotRecoveryRequestCount).toBe(attempt);
      harness.advanceMonotonic(RECOVERY_ACK_TIMEOUT_MS);
      harness.processor.checkTimeouts();
      harness.advanceMonotonic(6_000);
      harness.processor.processRawPayload(deltaMessage(456, 10 + attempt));
    }

    expect(harness.processor.diagnostics.snapshotRecoveryExhaustedCount).toBe(1);
    expect(harness.recoveryExhaustedMarkets).toEqual([TICKER]);
    expect(
      harness.lifecycleEvents.some(
        (event) => event.type === "snapshotRecoveryExhausted",
      ),
    ).toBe(true);

    // No further requests and no repeated escalation from continuing deltas.
    harness.advanceMonotonic(60_000);
    harness.processor.processRawPayload(deltaMessage(456, 999));
    expect(harness.processor.diagnostics.snapshotRecoveryRequestCount).toBe(
      RECOVERY_MAX_ATTEMPTS,
    );
    expect(harness.processor.diagnostics.snapshotRecoveryExhaustedCount).toBe(1);

    // Socket-level recovery resets the episode and allows recovery again.
    harness.processor.invalidateAllBooksForRecovery();
    harness.processor.processRawPayload(snapshotMessage(456, 2_000));
    expect(harness.processor.books.get(TICKER)?.bookState).toBe("valid");
  });

  it("quarantined/resyncing emissions do not count as synchronized liveness", () => {
    const harness = createHarness();
    harness.subscribeAndAck(456);
    harness.processor.processRawPayload(snapshotMessage(456, 1));
    harness.processor.processRawPayload(deltaMessage(456, 2));
    const signalsWhileValid = harness.livenessSignals.count;
    expect(signalsWhileValid).toBeGreaterThan(0);

    harness.processor.processRawPayload(deltaMessage(456, 10));
    harness.processor.processRawPayload(deltaMessage(456, 11));
    harness.processor.processRawPayload(deltaMessage(456, 12));

    expect(harness.livenessSignals.count).toBe(signalsWhileValid);
  });

  it("finalize reports unresolved recovery and pending-command state", () => {
    const harness = createHarness();
    harness.subscribeAndAck(456);
    harness.processor.processRawPayload(snapshotMessage(456, 1));
    harness.processor.processRawPayload(deltaMessage(456, 10));
    expect(harness.processor.hasOutstandingRecovery(TICKER)).toBe(true);

    harness.processor.finalize();

    expect(harness.processor.diagnostics.marketsWithOutstandingRecoveryAtEnd).toBe(1);
    expect(harness.processor.diagnostics.pendingCommandCountAtCaptureEnd).toBe(1);
    expect(
      harness.errors.some((message) =>
        message.includes("still awaiting snapshot recovery"),
      ),
    ).toBe(true);
  });
});

describe("pending command acknowledgement timeouts", () => {
  it("subscribe commands that are never acknowledged time out visibly", () => {
    const harness = createHarness();
    harness.manager.subscribe(harness.transport, TICKER);
    expect(harness.manager.getPendingCommands()).toHaveLength(1);

    harness.advanceMonotonic(COMMAND_ACK_TIMEOUT_MS);
    harness.processor.checkTimeouts();

    expect(harness.manager.getPendingCommands()).toHaveLength(0);
    expect(harness.processor.diagnostics.pendingCommandTimeoutCount).toBe(1);
    expect(harness.processor.diagnostics.subscribeAckTimeoutCount).toBe(1);
    expect(
      harness.lifecycleEvents.some(
        (event) => event.type === "commandAcknowledgementTimeout",
      ),
    ).toBe(true);
    expect(
      harness.lifecycleEvents.some((event) => event.type === "subscriptionFailed"),
    ).toBe(true);
    expect(harness.errors.length).toBeGreaterThan(0);
  });

  it("unsubscribe commands that are never acknowledged time out visibly", () => {
    const harness = createHarness();
    harness.subscribeAndAck(456);
    harness.manager.unsubscribe(harness.transport, [TICKER]);
    expect(harness.manager.getPendingCommands()).toHaveLength(1);

    harness.advanceMonotonic(COMMAND_ACK_TIMEOUT_MS);
    harness.processor.checkTimeouts();

    expect(harness.processor.diagnostics.unsubscribeAckTimeoutCount).toBe(1);
    expect(
      harness.lifecycleEvents.some(
        (event) => event.type === "marketUnsubscribeFailed",
      ),
    ).toBe(true);
  });
});

describe("uncorrelated control responses", () => {
  it("unknown subscribed/ok/unsubscribed command ids are classified and mutate nothing", () => {
    const harness = createHarness();
    harness.subscribeAndAck(456);
    expect(harness.manager.getSidForTicker(TICKER)).toBe(456);

    harness.processor.processRawPayload({
      id: 9_999,
      type: "subscribed",
      msg: { channel: "orderbook_delta", sid: 777, market_tickers: [TICKER] },
    });
    harness.processor.processRawPayload({
      id: 9_998,
      sid: 456,
      seq: 40,
      type: "ok",
      msg: { market_tickers: [TICKER] },
    });
    harness.processor.processRawPayload({
      id: 9_997,
      sid: 456,
      seq: 41,
      type: "unsubscribed",
    });

    // Active subscription state is untouched; no empty sid mapping appears.
    expect(harness.manager.getSidForTicker(TICKER)).toBe(456);
    expect(harness.manager.getSubscriptions()).toHaveLength(1);
    expect(harness.processor.diagnostics.unknownControlResponseCount).toBe(3);
    expect(
      harness.lifecycleEvents.filter(
        (event) => event.type === "unknownControlResponseReceived",
      ),
    ).toHaveLength(3);
  });

  it("stale responses from a previous socket generation cannot mutate rebuilt state", () => {
    const harness = createHarness();
    const oldCommandId = harness.manager.subscribe(harness.transport, TICKER);

    // Reconnect invalidates the old pending command and advances generation.
    const invalidated = harness.manager.resetForReconnect();
    expect(invalidated).toHaveLength(1);
    harness.processor.recordPendingCommandsInvalidated(invalidated);
    expect(harness.processor.diagnostics.pendingCommandsInvalidatedOnReconnect).toBe(1);

    // Fresh subscription on the new socket.
    harness.subscribeAndAck(901);
    expect(harness.manager.getSidForTicker(TICKER)).toBe(901);

    // The old socket's subscribed response arrives late: no mutation.
    harness.processor.processRawPayload({
      id: oldCommandId,
      type: "subscribed",
      msg: { channel: "orderbook_delta", sid: 456, market_tickers: [TICKER] },
    });

    expect(harness.manager.getSidForTicker(TICKER)).toBe(901);
    expect(harness.processor.diagnostics.unknownControlResponseCount).toBe(1);
  });
});

describe("send failures", () => {
  class FailingSendTransport extends MockKalshiWsTransport {
    failNextSend = false;

    override send(payload: string): void {
      if (this.failNextSend) {
        throw new Error("transport send failed");
      }
      super.send(payload);
    }
  }

  it("subscribe send failure rolls back pending state", () => {
    const transport = new FailingSendTransport();
    const manager = new OrderbookSubscriptionManager();
    transport.failNextSend = true;

    expect(() => manager.subscribe(transport, TICKER)).toThrow("transport send failed");
    expect(manager.getPendingCommands()).toHaveLength(0);
  });

  it("get_snapshot send failure rolls back pending state and recovery stays retryable", () => {
    const transport = new FailingSendTransport();
    const manager = new OrderbookSubscriptionManager();
    const commandId = manager.subscribe(transport, TICKER);
    manager.handleControlMessage({
      id: commandId,
      type: "subscribed",
      msg: { channel: "orderbook_delta", sid: 456 },
    });

    transport.failNextSend = true;
    expect(() => manager.requestSnapshot(transport, TICKER)).toThrow(
      "transport send failed",
    );
    expect(manager.getPendingCommands()).toHaveLength(0);

    transport.failNextSend = false;
    const retry = manager.requestSnapshot(transport, TICKER);
    expect(retry.status).toBe("requested");
    expect(manager.getPendingCommands()).toHaveLength(1);
  });

  it("unsubscribe send failure rolls back pending state", () => {
    const transport = new FailingSendTransport();
    const manager = new OrderbookSubscriptionManager();
    const commandId = manager.subscribe(transport, TICKER);
    manager.handleControlMessage({
      id: commandId,
      type: "subscribed",
      msg: { channel: "orderbook_delta", sid: 456 },
    });

    transport.failNextSend = true;
    expect(() => manager.unsubscribe(transport, [TICKER])).toThrow(
      "transport send failed",
    );
    expect(manager.getPendingCommands()).toHaveLength(0);
  });

  it("snapshot recovery send failure surfaces through the processor and allows retry after cooldown", () => {
    const harness = createHarness();
    harness.subscribeAndAck(456);
    harness.processor.processRawPayload(snapshotMessage(456, 1));

    const originalSend = harness.transport.send.bind(harness.transport);
    harness.transport.send = () => {
      throw new Error("socket write failed");
    };
    harness.processor.processRawPayload(deltaMessage(456, 10));

    expect(harness.processor.hasOutstandingRecovery(TICKER)).toBe(false);
    expect(harness.processor.diagnostics.snapshotRecoveryFailureCount).toBe(1);
    expect(harness.manager.getPendingCommands()).toHaveLength(0);
    expect(
      harness.errors.some((message) => message.includes("socket write failed")),
    ).toBe(true);

    harness.transport.send = originalSend;
    harness.advanceMonotonic(6_000);
    harness.processor.processRawPayload(deltaMessage(456, 11));
    expect(harness.processor.hasOutstandingRecovery(TICKER)).toBe(true);
  });
});

describe("malformed raw payloads", () => {
  it("counts malformed JSON safely without crashing or writing misleading parsed state", () => {
    const harness = createHarness();
    harness.subscribeAndAck(456);
    harness.processor.processRawPayload(snapshotMessage(456, 1));

    expect(() =>
      harness.processor.processRawPayload("{\"type\": \"orderbook_delta\", truncated"),
    ).not.toThrow();

    expect(harness.processor.diagnostics.malformedPayloadCount).toBe(1);
    expect(harness.processor.diagnostics.unknownMessagesReceived).toBe(1);
    expect(harness.processor.books.get(TICKER)?.bookState).toBe("valid");
    expect(
      harness.errors.some((message) => message.includes("Malformed Kalshi WS payload")),
    ).toBe(true);

    const rawLines = harness.appended[harness.paths.rawKalshiWsPath] ?? [];
    const malformedRecord = rawLines
      .map((line) => JSON.parse(line))
      .find((record) => record.messageType === "malformed-json");
    expect(malformedRecord).toBeDefined();
    expect(malformedRecord.rawPayload.malformed).toBe(true);
    expect(malformedRecord.rawPayload.textPreview.length).toBeLessThanOrEqual(512);
  });
});

describe("OrderbookCaptureBook sid-aware sequencing", () => {
  it("rejects a stale snapshot but accepts a snapshot at the highest observed sequence", () => {
    const book = new OrderbookCaptureBook({
      marketTicker: TICKER,
      seriesTicker: "KXBTC15M",
    });

    expect(book.applySnapshot(snapshotMessage(456, 10) as never)).toBe("applied");
    expect(book.applyDelta(deltaMessage(456, 30) as never)).toBe("gap-initiated");
    expect(book.applySnapshot(snapshotMessage(456, 29) as never)).toBe("stale-rejected");
    expect(book.bookState).toBe("gap-detected");
    expect(book.applySnapshot(snapshotMessage(456, 30) as never)).toBe("applied");
    expect(book.bookState).toBe("valid");
  });
});
