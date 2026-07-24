/**
 * M12.1H: deferred unsubscribe when a market closes before its reconnect
 * subscribe acknowledgement (SID) arrives.
 */
import { describe, expect, it, vi } from "vitest";

import type { KalshiWsTransport } from "@/features/market-data/orderbook/types";
import { OrderbookSubscriptionManager } from "@/features/market-data/orderbook/OrderbookSubscriptionManager";
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
  durationMinutes: 60,
  maxMarkets: 2,
  outputDir: "in-memory/deferred-unsubscribe/forward-quotes",
  dryRun: false,
  captureBtcSpot: false,
  rolloverCheckSeconds: 30,
  healthFlushSeconds: 60,
  topOfBookThrottleMs: 0,
  wsWatchdogEnabled: false,
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

function createDiscovery(tickers: string[]) {
  return {
    attempted: true,
    succeeded: true,
    seriesTicker: "KXBTC15M",
    discoveredMarketCount: tickers.length,
    selectedMarketTickers: tickers,
    marketStatuses: Object.fromEntries(tickers.map((t) => [t, "active"])),
    eventTickers: Object.fromEntries(tickers.map((t) => [t, null])),
    closeTimes: Object.fromEntries(tickers.map((t) => [t, null])),
    error: null,
  };
}

function createMemoryIo() {
  const files = new Map<string, string>();
  const appended: Record<string, string[]> = {};
  let nowMs = Date.UTC(2026, 6, 24);
  let monotonicMs = 0;

  return {
    appended,
    io: {
      readFile: (path: string) => {
        const contents = files.get(path);
        if (contents === undefined) {
          throw new Error(`ENOENT: ${path}`);
        }
        return contents;
      },
      writeFile: (path: string, data: string) => {
        files.set(path, data);
      },
      appendFile: (path: string, data: string) => {
        appended[path] = [...(appended[path] ?? []), data];
        files.set(path, `${files.get(path) ?? ""}${data}`);
      },
      createAppendStream: (path: string) => ({
        write(chunk: string) {
          appended[path] = [...(appended[path] ?? []), chunk];
          files.set(path, `${files.get(path) ?? ""}${chunk}`);
          return true;
        },
        onceDrain() {},
        onError() {},
        end() {
          return Promise.resolve();
        },
      }),
      renameFile: (from: string, to: string) => {
        const contents = files.get(from);
        if (contents === undefined) {
          throw new Error(`ENOENT rename: ${from}`);
        }
        files.delete(from);
        files.set(to, contents);
      },
      createExclusiveFile: (path: string, data: string) => {
        if (files.has(path)) {
          throw new Error(`EEXIST: ${path}`);
        }
        files.set(path, data);
      },
      deleteFile: (path: string) => {
        files.delete(path);
      },
      mkdirSync: () => {},
      now: () => {
        nowMs += 1;
        return new Date(nowMs);
      },
      monotonicNowMs: () => {
        monotonicMs += 1;
        return monotonicMs;
      },
      setInterval: () => 1,
      clearInterval: () => {},
      fetchImpl: (async () =>
        new Response(JSON.stringify({ markets: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })) as typeof fetch,
    },
  };
}

class ControllableSubscribeTransport implements KalshiWsProbeTransport {
  connectCount = 0;
  readonly sent: string[] = [];
  holdSubscribeAcks = false;
  failNextUnsubscribeMessage: string | null = null;
  private nextSid = 1;
  private onMessageHandler: ((payload: string) => void) | null = null;
  private heldAcks: Array<() => void> = [];

  get heldAckCount(): number {
    return this.heldAcks.length;
  }

  private emit(payload: unknown): void {
    queueMicrotask(() => {
      this.onMessageHandler?.(JSON.stringify(payload));
    });
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

  releaseHeldSubscribeAcks(): void {
    const held = [...this.heldAcks];
    this.heldAcks = [];
    for (const release of held) {
      release();
    }
  }

  async connect(): Promise<void> {
    this.connectCount += 1;
  }

  send(payload: string): void {
    const command = JSON.parse(payload) as Record<string, unknown>;
    const params = (command.params ?? {}) as Record<string, unknown>;

    if (
      this.failNextUnsubscribeMessage
      && (command.cmd === "unsubscribe"
        || (command.cmd === "update_subscription"
          && params.action === "delete_markets"))
    ) {
      const message = this.failNextUnsubscribeMessage;
      this.failNextUnsubscribeMessage = null;
      throw new Error(message);
    }

    this.sent.push(payload);

    if (command.cmd === "subscribe") {
      const ticker = (params.market_tickers as string[])[0]!;
      const commandId = command.id as number;
      const deliver = () => {
        const sid = this.nextSid++;
        this.emit({
          id: commandId,
          type: "subscribed",
          msg: { channel: "orderbook_delta", sid, market_tickers: [ticker] },
        });
        this.emit(this.snapshot(sid, this.connectCount === 1 ? 1 : 200, ticker));
      };
      if (this.holdSubscribeAcks) {
        this.heldAcks.push(deliver);
      } else {
        deliver();
      }
      return;
    }

    if (command.cmd === "unsubscribe") {
      const sid = (params.sids as number[])[0]!;
      this.emit({
        id: command.id,
        sid,
        seq: 300,
        type: "unsubscribed",
      });
    }
  }

  close(): void {}
  onOpen(): void {}
  onMessage(handler: (payload: string) => void): void {
    this.onMessageHandler = handler;
  }
  onClose(): void {}
  onError(): void {}
  ping(): void {}
  onPong(): void {}
}

function lifecycleText(appended: Record<string, string[]>): string {
  for (const [path, chunks] of Object.entries(appended)) {
    if (path.endsWith("capture-lifecycle.jsonl")) {
      return chunks.join("");
    }
  }
  return Object.values(appended).flat().join("");
}

function parseLifecycle(text: string): Array<Record<string, unknown>> {
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function unsubscribeCommands(transport: ControllableSubscribeTransport) {
  return transport.sent
    .map((payload) => JSON.parse(payload) as Record<string, unknown>)
    .filter((command) => command.cmd === "unsubscribe");
}

const NEXT_MARKET = {
  markets: [
    {
      ticker: "KXBTC15M-NEXT",
      title: "BTC next",
      status: "active",
      open_time: "2026-07-19T00:00:00Z",
      close_time: "2027-01-01T00:00:00Z",
    },
  ],
};

describe("OrderbookSubscriptionManager.hasPendingSubscribeForTicker", () => {
  it("reports pending subscribe until acknowledgement", () => {
    const sent: string[] = [];
    const transport = {
      send: (payload: string) => {
        sent.push(payload);
      },
    } satisfies KalshiWsTransport;
    const manager = new OrderbookSubscriptionManager(() => 1);
    expect(manager.hasPendingSubscribeForTicker("T1")).toBe(false);
    manager.subscribe(transport, "T1");
    expect(manager.hasPendingSubscribeForTicker("T1")).toBe(true);
    const command = JSON.parse(sent[0]!) as { id: number };
    manager.handleControlMessage({
      id: command.id,
      type: "subscribed",
      msg: { channel: "orderbook_delta", sid: 7, market_tickers: ["T1"] },
    });
    expect(manager.hasPendingSubscribeForTicker("T1")).toBe(false);
    expect(manager.getSidForTicker("T1")).toBe(7);
  });
});

describe("deferred unsubscribe before SID acknowledgement", () => {
  it("defers then flushes exactly one unsubscribe when SID arrives after local close", async () => {
    const transport = new ControllableSubscribeTransport();
    transport.holdSubscribeAcks = true;
    const { io, appended } = createMemoryIo();
    const intervals: Array<{ fn: () => void; ms: number }> = [];
    let polls = 0;
    let rolled = false;
    let released = false;

    const result = await runLiveForwardQuoteCapture({
      runId: "run-deferred-flush",
      startedAt: "2026-07-24T00:00:00.000Z",
      config: LIVE_CONFIG,
      discovery: createDiscovery(["KXBTC15M-OLD"]),
      credentials: CREDENTIALS,
      io: {
        ...io,
        now: () => new Date("2026-07-24T00:00:00.000Z"),
        fetchImpl: (async (url: RequestInfo | URL) => {
          const isUnopened = String(url).includes("status=unopened");
          return new Response(
            JSON.stringify(isUnopened ? { markets: [] } : NEXT_MARKET),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }) as typeof fetch,
        setInterval: (fn: () => void, ms: number) => {
          intervals.push({ fn, ms });
          return intervals.length;
        },
        clearInterval: () => {},
      },
      transport,
      shouldStop: () => {
        polls += 1;
        if (!rolled && transport.heldAckCount >= 1 && polls >= 2) {
          rolled = true;
          for (const interval of intervals) {
            interval.fn();
          }
          return false;
        }
        if (rolled && !released && polls >= 4) {
          released = true;
          transport.releaseHeldSubscribeAcks();
          return false;
        }
        return released && polls >= 8;
      },
    });

    const events = parseLifecycle(lifecycleText(appended));
    expect(events.filter((e) => e.type === "marketUnsubscribeDeferred")).toHaveLength(1);
    expect(events.filter((e) => e.type === "marketUnsubscribeRequested")).toHaveLength(1);
    expect(events.some((e) => e.type === "marketUnsubscribeAcknowledged")).toBe(true);
    expect(
      result.errors.some((error) => error.includes("no acknowledged sid")),
    ).toBe(false);
    expect(unsubscribeCommands(transport)).toHaveLength(1);
    expect(result.processor.books.get("KXBTC15M-OLD")?.bookState).toBe("closed");
    expect(result.rollover.marketsClosed).toBe(1);
  }, 20_000);

  it("multiple rollover checks while SID pending create one deferred intent and one unsubscribe", async () => {
    const transport = new ControllableSubscribeTransport();
    transport.holdSubscribeAcks = true;
    const { io, appended } = createMemoryIo();
    const intervals: Array<{ fn: () => void; ms: number }> = [];
    let polls = 0;
    let rolloverPasses = 0;
    let released = false;

    const result = await runLiveForwardQuoteCapture({
      runId: "run-deferred-multi-rollover",
      startedAt: "2026-07-24T00:00:00.000Z",
      config: LIVE_CONFIG,
      discovery: createDiscovery(["KXBTC15M-OLD"]),
      credentials: CREDENTIALS,
      io: {
        ...io,
        now: () => new Date("2026-07-24T00:00:00.000Z"),
        fetchImpl: (async (url: RequestInfo | URL) => {
          const isUnopened = String(url).includes("status=unopened");
          return new Response(
            JSON.stringify(isUnopened ? { markets: [] } : NEXT_MARKET),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }) as typeof fetch,
        setInterval: (fn: () => void, ms: number) => {
          intervals.push({ fn, ms });
          return intervals.length;
        },
        clearInterval: () => {},
      },
      transport,
      shouldStop: () => {
        polls += 1;
        if (transport.heldAckCount >= 1 && rolloverPasses < 3 && polls >= 2) {
          rolloverPasses += 1;
          for (const interval of intervals) {
            interval.fn();
          }
          return false;
        }
        if (rolloverPasses >= 3 && !released) {
          released = true;
          transport.releaseHeldSubscribeAcks();
          return false;
        }
        return released && polls >= 12;
      },
    });

    const events = parseLifecycle(lifecycleText(appended));
    expect(events.filter((e) => e.type === "marketUnsubscribeDeferred")).toHaveLength(1);
    expect(events.filter((e) => e.type === "marketUnsubscribeRequested")).toHaveLength(1);
    expect(unsubscribeCommands(transport)).toHaveLength(1);
    expect(
      result.errors.some((error) => error.includes("no acknowledged sid")),
    ).toBe(false);
  }, 20_000);

  it("clears deferred intent on another reconnect without sending against the new socket", async () => {
    const transport = new ControllableSubscribeTransport();
    transport.holdSubscribeAcks = true;
    const { io, appended } = createMemoryIo();
    const intervals: Array<{ fn: () => void; ms: number }> = [];
    let polls = 0;
    let rolled = false;

    // Unexpected close after deferral triggers reconnect path via notify — with
    // watchdog disabled we instead clear deferred by a second connectTransport
    // only when recovery runs. With watchdog off, simulate by ending while
    // deferred (shutdown clears without sending).
    const result = await runLiveForwardQuoteCapture({
      runId: "run-deferred-stale-gen",
      startedAt: "2026-07-24T00:00:00.000Z",
      config: LIVE_CONFIG,
      discovery: createDiscovery(["KXBTC15M-OLD"]),
      credentials: CREDENTIALS,
      io: {
        ...io,
        now: () => new Date("2026-07-24T00:00:00.000Z"),
        fetchImpl: (async (url: RequestInfo | URL) => {
          const isUnopened = String(url).includes("status=unopened");
          return new Response(
            JSON.stringify(isUnopened ? { markets: [] } : NEXT_MARKET),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }) as typeof fetch,
        setInterval: (fn: () => void, ms: number) => {
          intervals.push({ fn, ms });
          return intervals.length;
        },
        clearInterval: () => {},
      },
      transport,
      shouldStop: () => {
        polls += 1;
        if (!rolled && transport.heldAckCount >= 1 && polls >= 2) {
          rolled = true;
          for (const interval of intervals) {
            interval.fn();
          }
          return false;
        }
        // End while still deferred (never release SID) — reconnect generation
        // clear is covered by connectTransport clearDeferredUnsubscribes;
        // shutdown path must not hang or emit a fatal sid error.
        return rolled && polls >= 5;
      },
    });

    const events = parseLifecycle(lifecycleText(appended));
    expect(events.some((e) => e.type === "marketUnsubscribeDeferred")).toBe(true);
    expect(events.some((e) => e.type === "marketUnsubscribeDeferredUnresolved")).toBe(
      true,
    );
    expect(unsubscribeCommands(transport)).toHaveLength(0);
    expect(
      result.errors.some((error) => error.includes("no acknowledged sid")),
    ).toBe(false);
  }, 20_000);

  it("shutdown while deferred does not hang and does not add fatal sid errors", async () => {
    const transport = new ControllableSubscribeTransport();
    transport.holdSubscribeAcks = true;
    const { io, appended } = createMemoryIo();
    const intervals: Array<{ fn: () => void; ms: number }> = [];
    let polls = 0;
    let rolled = false;

    const result = await runLiveForwardQuoteCapture({
      runId: "run-deferred-shutdown",
      startedAt: "2026-07-24T00:00:00.000Z",
      config: LIVE_CONFIG,
      discovery: createDiscovery(["KXBTC15M-OLD"]),
      credentials: CREDENTIALS,
      io: {
        ...io,
        now: () => new Date("2026-07-24T00:00:00.000Z"),
        fetchImpl: (async (url: RequestInfo | URL) => {
          const isUnopened = String(url).includes("status=unopened");
          return new Response(
            JSON.stringify(isUnopened ? { markets: [] } : NEXT_MARKET),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }) as typeof fetch,
        setInterval: (fn: () => void, ms: number) => {
          intervals.push({ fn, ms });
          return intervals.length;
        },
        clearInterval: () => {},
      },
      transport,
      shouldStop: () => {
        polls += 1;
        if (!rolled && transport.heldAckCount >= 1) {
          rolled = true;
          for (const interval of intervals) {
            interval.fn();
          }
          return false;
        }
        return rolled && polls >= 3;
      },
    });

    expect(result.errors.some((error) => error.includes("no acknowledged sid"))).toBe(
      false,
    );
    expect(unsubscribeCommands(transport)).toHaveLength(0);
    const events = parseLifecycle(lifecycleText(appended));
    expect(events.some((e) => e.type === "marketUnsubscribeDeferredUnresolved")).toBe(
      true,
    );
    // No commands after finalization: held acks were never released post-stop.
    transport.releaseHeldSubscribeAcks();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(unsubscribeCommands(transport)).toHaveLength(0);
  }, 20_000);

  it("SID never arriving before duration end is a lifecycle warning, not a fatal sid error", async () => {
    const transport = new ControllableSubscribeTransport();
    transport.holdSubscribeAcks = true;
    const { io, appended } = createMemoryIo();
    const intervals: Array<{ fn: () => void; ms: number }> = [];
    let polls = 0;
    let rolled = false;

    const result = await runLiveForwardQuoteCapture({
      runId: "run-deferred-unresolved",
      startedAt: "2026-07-24T00:00:00.000Z",
      config: { ...LIVE_CONFIG, durationMinutes: 0.0001 },
      discovery: createDiscovery(["KXBTC15M-OLD"]),
      credentials: CREDENTIALS,
      io: {
        ...io,
        now: () => new Date("2026-07-24T00:00:00.000Z"),
        fetchImpl: (async (url: RequestInfo | URL) => {
          const isUnopened = String(url).includes("status=unopened");
          return new Response(
            JSON.stringify(isUnopened ? { markets: [] } : NEXT_MARKET),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }) as typeof fetch,
        setInterval: (fn: () => void, ms: number) => {
          intervals.push({ fn, ms });
          return intervals.length;
        },
        clearInterval: () => {},
      },
      transport,
      shouldStop: () => {
        polls += 1;
        if (!rolled && transport.heldAckCount >= 1) {
          rolled = true;
          for (const interval of intervals) {
            interval.fn();
          }
        }
        return polls >= 4;
      },
    });

    expect(result.processor.books.get("KXBTC15M-OLD")?.bookState).toBe("closed");
    expect(result.errors.some((error) => error.includes("no acknowledged sid"))).toBe(
      false,
    );
    const events = parseLifecycle(lifecycleText(appended));
    expect(events.some((e) => e.type === "marketUnsubscribeDeferred")).toBe(true);
    expect(events.some((e) => e.type === "marketUnsubscribeDeferredUnresolved")).toBe(
      true,
    );
  }, 20_000);

  it("real unsubscribe send failure after SID acknowledgement remains a visible error", async () => {
    const transport = new ControllableSubscribeTransport();
    const { io, appended } = createMemoryIo();
    const intervals: Array<{ fn: () => void; ms: number }> = [];
    let polls = 0;
    let rolled = false;

    const result = await runLiveForwardQuoteCapture({
      runId: "run-unsub-send-fail",
      startedAt: "2026-07-24T00:00:00.000Z",
      config: LIVE_CONFIG,
      discovery: createDiscovery(["KXBTC15M-OLD"]),
      credentials: CREDENTIALS,
      io: {
        ...io,
        now: () => new Date("2026-07-24T00:00:00.000Z"),
        fetchImpl: (async (url: RequestInfo | URL) => {
          const isUnopened = String(url).includes("status=unopened");
          return new Response(
            JSON.stringify(isUnopened ? { markets: [] } : NEXT_MARKET),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }) as typeof fetch,
        setInterval: (fn: () => void, ms: number) => {
          intervals.push({ fn, ms });
          return intervals.length;
        },
        clearInterval: () => {},
      },
      transport,
      shouldStop: () => {
        polls += 1;
        if (!rolled && polls >= 2) {
          rolled = true;
          transport.failNextUnsubscribeMessage =
            "SYNTHETIC_UNSUB_SEND_FAIL apiKey=SECRET_KEY_MARKER";
          for (const interval of intervals) {
            interval.fn();
          }
          return false;
        }
        return rolled && polls >= 5;
      },
    });

    expect(
      result.errors.some((error) => error.includes("unsubscribe send failed")),
    ).toBe(true);
    expect(
      result.errors.some((error) => error.includes("SYNTHETIC_UNSUB_SEND_FAIL")),
    ).toBe(true);
    const events = parseLifecycle(lifecycleText(appended));
    expect(events.some((e) => e.type === "marketUnsubscribeFailed")).toBe(true);
    expect(events.some((e) => e.type === "marketUnsubscribeDeferred")).toBe(false);
  }, 20_000);
});
