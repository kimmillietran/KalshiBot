import { describe, expect, it, vi } from "vitest";

import type { KalshiWsProbeTransport } from "@/features/market-data/orderbook/types";
import type { KalshiCaptureCredentials } from "@/lib/data/live/kalshiWsCaptureSpike";

import { runLiveForwardQuoteCapture } from "./runLiveForwardQuoteCapture";
import type { ForwardQuoteCaptureConfig } from "./forwardQuoteCaptureTypes";

vi.mock("@/lib/data/live/kalshiWsCaptureSpike", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/data/live/kalshiWsCaptureSpike")>();

  return {
    ...actual,
    createKalshiWebSocketAuthHeaders: vi.fn(() => ({
      "KALSHI-ACCESS-KEY": "key-id",
      "KALSHI-ACCESS-TIMESTAMP": "0",
      "KALSHI-ACCESS-SIGNATURE": "mock-signature",
    })),
  };
});

const LIVE_CONFIG: ForwardQuoteCaptureConfig = {
  series: "KXBTC15M",
  durationMinutes: 0.0001,
  maxMarkets: 1,
  outputDir: "data/live-capture/forward-quotes",
  dryRun: false,
  captureBtcSpot: false,
  rolloverCheckSeconds: 30,
  healthFlushSeconds: 60,
  topOfBookThrottleMs: 0,
  wsWatchdogEnabled: true,
  wsSoftSilenceThresholdMs: 30_000,
  wsHardStallThresholdMs: 60_000,
  wsProbeGraceMs: 10_000,
  wsRecoveryMaxAttempts: 1,
};

const CREDENTIALS: KalshiCaptureCredentials = {
  status: "available",
  apiKeyId: "key-id",
  apiBaseUrl: null,
  wsUrl: "wss://example.test/ws",
  privateKeyMaterial: {
    status: "loaded",
    source: "raw-env",
    privateKeyPem: "mock-private-key",
    privateKeyLoaded: true,
    privateKeyFingerprint: "abc",
    warnings: [],
    error: null,
  },
  privateKeySource: "raw-env",
  privateKeyLoaded: true,
  privateKeyFingerprint: "abc",
  keyIdPresent: true,
  warnings: [],
  error: null,
};

class AckOnlyRecoveryTransport implements KalshiWsProbeTransport {
  connectCount = 0;
  sentAckAfterReconnect = false;
  private closedInitialConnection = false;
  private onMessageHandler: ((payload: string) => void) | null = null;
  private onCloseHandler: ((code?: number, reason?: string) => void) | null = null;

  async connect(): Promise<void> {
    this.connectCount += 1;
  }

  send(): void {
    if (this.connectCount === 1 && !this.closedInitialConnection) {
      this.closedInitialConnection = true;
      this.onCloseHandler?.(1006, "stalled socket");
      return;
    }

    if (this.connectCount === 2 && !this.sentAckAfterReconnect) {
      this.sentAckAfterReconnect = true;
      this.onMessageHandler?.(
        JSON.stringify({
          type: "subscribed",
          sid: 1,
          msg: { channel: "orderbook_delta" },
        }),
      );
    }
  }

  close(): void {}

  onOpen(): void {}

  onMessage(handler: (payload: string) => void): void {
    this.onMessageHandler = handler;
  }

  onClose(handler: (code?: number, reason?: string) => void): void {
    this.onCloseHandler = handler;
  }

  onError(): void {}

  ping(): void {}

  onPong(): void {}
}

type ScriptedBehavior = {
  /** Close the socket unexpectedly right after the first snapshot delivers. */
  closeAfterFirstSnapshot?: boolean;
  /** Emit a gap delta (seq jump) after the snapshot on this connection number. */
  gapDeltaOnConnection?: number;
};

/**
 * Deterministic transport speaking the official Kalshi control protocol:
 * subscribe -> subscribed ack (server-assigned sid) + orderbook_snapshot;
 * update_subscription get_snapshot -> ok ack + fresh snapshot;
 * unsubscribe -> unsubscribed ack.
 */
class ScriptedKalshiTransport implements KalshiWsProbeTransport {
  connectCount = 0;
  readonly sent: string[] = [];
  private nextSid = 1;
  private closedFirstConnection = false;
  private onMessageHandler: ((payload: string) => void) | null = null;
  private onCloseHandler: ((code?: number, reason?: string) => void) | null = null;

  constructor(private readonly behavior: ScriptedBehavior = {}) {}

  private emit(payload: unknown): void {
    this.onMessageHandler?.(JSON.stringify(payload));
  }

  private snapshot(sid: number, seq: number, ticker: string) {
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

  async connect(): Promise<void> {
    this.connectCount += 1;
  }

  send(payload: string): void {
    this.sent.push(payload);
    const command = JSON.parse(payload);

    if (command.cmd === "subscribe") {
      const sid = this.nextSid++;
      const ticker: string = command.params.market_tickers[0];
      this.emit({
        id: command.id,
        type: "subscribed",
        msg: { channel: "orderbook_delta", sid },
      });
      this.emit(this.snapshot(sid, 1, ticker));

      if (this.behavior.gapDeltaOnConnection === this.connectCount) {
        this.emit({
          type: "orderbook_delta",
          sid,
          seq: 10,
          msg: {
            market_ticker: ticker,
            market_id: "market-id",
            price_dollars: "0.4600",
            delta_fp: "5.00",
            side: "yes",
          },
        });
      }

      if (
        this.behavior.closeAfterFirstSnapshot
        && this.connectCount === 1
        && !this.closedFirstConnection
      ) {
        this.closedFirstConnection = true;
        this.onCloseHandler?.(1006, "unexpected close");
      }
      return;
    }

    if (command.cmd === "update_subscription" && command.params.action === "get_snapshot") {
      const sid: number = command.params.sids[0];
      const ticker: string = command.params.market_tickers[0];
      this.emit({
        id: command.id,
        sid,
        seq: 99,
        type: "ok",
        msg: { market_tickers: [ticker] },
      });
      this.emit(this.snapshot(sid, 100, ticker));
      return;
    }

    if (command.cmd === "unsubscribe") {
      this.emit({
        id: command.id,
        sid: command.params.sids[0],
        seq: 100,
        type: "unsubscribed",
      });
    }
  }

  close(): void {}

  onOpen(): void {}

  onMessage(handler: (payload: string) => void): void {
    this.onMessageHandler = handler;
  }

  onClose(handler: (code?: number, reason?: string) => void): void {
    this.onCloseHandler = handler;
  }

  onError(): void {}

  ping(): void {}

  onPong(): void {}
}

function createDiscovery(tickers: string[]) {
  return {
    attempted: true,
    succeeded: true,
    seriesTicker: "KXBTC15M",
    discoveredMarketCount: tickers.length,
    selectedMarketTickers: tickers,
    marketStatuses: Object.fromEntries(tickers.map((ticker) => [ticker, "open"])),
    eventTickers: Object.fromEntries(tickers.map((ticker) => [ticker, null])),
    closeTimes: Object.fromEntries(tickers.map((ticker) => [ticker, null])),
    error: null,
  };
}

function createMemoryIo() {
  const appended: Record<string, string[]> = {};
  const written: Record<string, string> = {};
  let monotonicMs = 0;
  let nowMs = Date.UTC(2026, 6, 20);

  return {
    appended,
    written,
    io: {
      writeFile: (path: string, data: string) => {
        written[path] = data;
      },
      appendFile: (path: string, data: string) => {
        appended[path] = [...(appended[path] ?? []), data];
      },
      mkdirSync: () => {},
      // Advances on every call so short duration-bounded runs terminate
      // deterministically without a watchdog.
      now: () => {
        nowMs += 500;
        return new Date(nowMs);
      },
      monotonicNowMs: () => {
        monotonicMs += 1_000;
        return monotonicMs;
      },
    },
  };
}

describe("runLiveForwardQuoteCapture subscription and resync correctness", () => {
  it("recovers a mid-capture sequence gap with one sid-correct get_snapshot command", async () => {
    const transport = new ScriptedKalshiTransport({ gapDeltaOnConnection: 1 });
    const { io, appended } = createMemoryIo();

    const result = await runLiveForwardQuoteCapture({
      runId: "run-gap-recovery",
      startedAt: "2026-07-20T00:00:00.000Z",
      config: { ...LIVE_CONFIG, wsWatchdogEnabled: false },
      discovery: createDiscovery(["KXBTC15M-TEST"]),
      credentials: CREDENTIALS,
      io,
      transport,
    });

    const commands = transport.sent.map((payload) => JSON.parse(payload));
    const recoveryCommands = commands.filter(
      (command) => command.params?.action === "get_snapshot",
    );
    expect(recoveryCommands).toHaveLength(1);
    expect(recoveryCommands[0].params.sids).toEqual([1]);

    expect(result.processor.diagnostics.sequenceGapEpisodeCount).toBe(1);
    expect(result.processor.diagnostics.sequenceGapCount).toBe(1);
    expect(result.processor.diagnostics.snapshotRecoverySuccessCount).toBe(1);
    expect(result.processor.books.get("KXBTC15M-TEST")?.bookState).toBe("valid");

    const lifecycleLines = (appended[result.paths.captureLifecyclePath] ?? []).join("");
    expect(lifecycleLines).toContain("subscriptionRequested");
    expect(lifecycleLines).toContain("subscriptionAcknowledged");
    expect(lifecycleLines).toContain("snapshotRecoveryRequested");
    expect(lifecycleLines).toContain("snapshotRecoverySucceeded");
  });

  it("rebuilds subscriptions and server sid mappings safely after reconnect", async () => {
    const transport = new ScriptedKalshiTransport({
      closeAfterFirstSnapshot: true,
      gapDeltaOnConnection: 2,
    });
    const { io } = createMemoryIo();

    const result = await runLiveForwardQuoteCapture({
      runId: "run-reconnect",
      startedAt: "2026-07-20T00:00:00.000Z",
      config: LIVE_CONFIG,
      discovery: createDiscovery(["KXBTC15M-TEST"]),
      credentials: CREDENTIALS,
      io,
      transport,
    });

    expect(transport.connectCount).toBe(2);
    expect(result.watchdog?.wsRecoverySuccessCount).toBe(1);

    const commands = transport.sent.map((payload) => JSON.parse(payload));
    const subscribeCommands = commands.filter((command) => command.cmd === "subscribe");
    expect(subscribeCommands).toHaveLength(2);

    // The gap on connection 2 must be recovered with the NEW sid (2), not the
    // stale sid from the first connection.
    const recoveryCommands = commands.filter(
      (command) => command.params?.action === "get_snapshot",
    );
    expect(recoveryCommands).toHaveLength(1);
    expect(recoveryCommands[0].params.sids).toEqual([2]);
    expect(result.processor.books.get("KXBTC15M-TEST")?.bookState).toBe("valid");
  }, 15_000);

  it("writes no credential material into any capture artifact", async () => {
    const transport = new ScriptedKalshiTransport({ gapDeltaOnConnection: 1 });
    const { io, appended, written } = createMemoryIo();

    await runLiveForwardQuoteCapture({
      runId: "run-credential-hygiene",
      startedAt: "2026-07-20T00:00:00.000Z",
      config: { ...LIVE_CONFIG, wsWatchdogEnabled: false },
      discovery: createDiscovery(["KXBTC15M-TEST"]),
      credentials: CREDENTIALS,
      io,
      transport,
    });

    const allArtifacts = [
      ...Object.values(appended).flat(),
      ...Object.values(written),
    ].join("");
    expect(allArtifacts.length).toBeGreaterThan(0);
    expect(allArtifacts).not.toContain("mock-private-key");
    expect(allArtifacts).not.toContain("mock-signature");
    expect(allArtifacts).not.toContain("KALSHI-ACCESS");
    expect(allArtifacts).not.toContain("PRIVATE KEY");
  });

  it("sends a real sid-correct unsubscribe command during rollover and records the lifecycle", async () => {
    const transport = new ScriptedKalshiTransport();
    const { io, appended } = createMemoryIo();
    const intervals: Array<{ fn: () => void; ms: number }> = [];
    let stopCalls = 0;

    const rolloverMarkets = {
      markets: [
        {
          ticker: "KXBTC15M-NEXT",
          title: "BTC next window",
          status: "active",
          open_time: "2026-07-19T00:00:00Z",
          close_time: "2027-01-01T00:00:00Z",
        },
      ],
    };
    const fetchImpl = (async (url: RequestInfo | URL) => {
      const isUnopened = String(url).includes("status=unopened");
      return new Response(
        JSON.stringify(isUnopened ? { markets: [] } : rolloverMarkets),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const result = await runLiveForwardQuoteCapture({
      runId: "run-rollover",
      startedAt: "2026-07-20T00:00:00.000Z",
      config: {
        ...LIVE_CONFIG,
        durationMinutes: 60,
        wsWatchdogEnabled: false,
      },
      discovery: createDiscovery(["KXBTC15M-OLD"]),
      credentials: CREDENTIALS,
      io: {
        ...io,
        now: () => new Date("2026-07-20T00:00:00.000Z"),
        fetchImpl,
        setInterval: (fn: () => void, ms: number) => {
          intervals.push({ fn, ms });
          return intervals.length;
        },
        clearInterval: () => {},
      },
      transport,
      shouldStop: () => {
        stopCalls += 1;
        if (stopCalls === 1) {
          for (const interval of intervals) {
            interval.fn();
          }
          return false;
        }
        return stopCalls > 2;
      },
    });

    const commands = transport.sent.map((payload) => JSON.parse(payload));
    const unsubscribeCommands = commands.filter((command) => command.cmd === "unsubscribe");
    expect(unsubscribeCommands).toHaveLength(1);
    expect(unsubscribeCommands[0].params.sids).toEqual([1]);

    expect(result.rollover.marketsClosed).toBe(1);
    expect(result.processor.books.get("KXBTC15M-OLD")?.bookState).toBe("closed");

    const lifecycleLines = (appended[result.paths.captureLifecyclePath] ?? []).join("");
    expect(lifecycleLines).toContain("marketUnsubscribeRequested");
    expect(lifecycleLines).toContain("marketUnsubscribeAcknowledged");
  }, 15_000);
});

describe("runLiveForwardQuoteCapture recovery confirmation", () => {
  it("does not mark recovery successful from a subscribe/control message only", async () => {
    const transport = new AckOnlyRecoveryTransport();
    let monotonicMs = 0;

    const result = await runLiveForwardQuoteCapture({
      runId: "run-ack-only",
      startedAt: "2026-07-11T00:00:00.000Z",
      config: LIVE_CONFIG,
      discovery: {
        attempted: true,
        succeeded: true,
        seriesTicker: "KXBTC15M",
        discoveredMarketCount: 1,
        selectedMarketTickers: ["KXBTC15M-TEST"],
        marketStatuses: { "KXBTC15M-TEST": "open" },
        eventTickers: { "KXBTC15M-TEST": null },
        closeTimes: { "KXBTC15M-TEST": null },
        error: null,
      },
      credentials: CREDENTIALS,
      io: {
        writeFile: () => {},
        appendFile: () => {},
        mkdirSync: () => {},
        now: () => new Date(Date.UTC(2026, 6, 11) + monotonicMs),
        monotonicNowMs: () => {
          monotonicMs += 1_000;
          return monotonicMs;
        },
      },
      transport,
    });

    expect(transport.connectCount).toBe(2);
    expect(transport.sentAckAfterReconnect).toBe(true);
    expect(result.processor.diagnostics.rawMessageCount).toBe(1);
    expect(result.processor.diagnostics.snapshotsReceived).toBe(0);
    expect(result.watchdog?.wsRecoverySuccessCount).toBe(0);
    expect(result.watchdog?.wsRecoveryFailureCount).toBe(1);
    expect(result.watchdog?.terminalWebSocketFailure).toBe(true);
    expect(
      result.watchdog?.lifecycleEvents.some((event) => event.type === "wsRecoverySucceeded"),
    ).toBe(false);
  }, 10_000);
});
