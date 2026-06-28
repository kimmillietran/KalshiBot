import {
  ORDERBOOK_RECONNECT_BASE_MS,
  ORDERBOOK_RECONNECT_MAX_MS,
  ORDERBOOK_STALE_THRESHOLD_MS,
} from "./constants";
import { OrderbookFeedError, OrderbookFeedErrorCode } from "./errors";
import { mapTopOfBookToContractPricing } from "./mapTopOfBookToPricing";
import { OrderbookSubscriptionManager } from "./OrderbookSubscriptionManager";
import {
  applyOrderbookDelta,
  applyOrderbookSnapshot,
  applyRestOrderbookSnapshot,
  createEmptyOrderbookState,
} from "./orderbookReducer";
import {
  kalshiOrderbookDeltaMessageSchema,
  kalshiOrderbookSnapshotMessageSchema,
} from "./schemas";
import { SequenceTracker } from "./sequenceTracker";
import { extractTopOfBook } from "./topOfBook";
import type {
  FetchOrderbookSnapshot,
  KalshiWsTransport,
  OrderbookFeedSnapshot,
  OrderbookFeedStatus,
} from "./types";

export type OrderbookFeedControllerOptions = {
  transport: KalshiWsTransport;
  wsUrl: string;
  fetchSnapshot: FetchOrderbookSnapshot;
  now?: () => number;
  staleThresholdMs?: number;
  reconnectBaseMs?: number;
  reconnectMaxMs?: number;
  scheduleReconnect?: (delayMs: number, callback: () => void) => number;
  clearScheduled?: (handle: number) => void;
};

type Listener = (snapshot: OrderbookFeedSnapshot) => void;

function idleSnapshot(): OrderbookFeedSnapshot {
  return {
    ticker: null,
    status: "idle",
    pricing: null,
    topOfBook: null,
    lastSeq: null,
    lastUpdateAt: null,
    errorMessage: null,
  };
}

/** Maintains deterministic in-memory top-of-book state from WS deltas with REST resync. */
export class OrderbookFeedController {
  private readonly transport: KalshiWsTransport;
  private readonly wsUrl: string;
  private readonly fetchSnapshot: FetchOrderbookSnapshot;
  private readonly now: () => number;
  private readonly staleThresholdMs: number;
  private readonly reconnectBaseMs: number;
  private readonly reconnectMaxMs: number;
  private readonly scheduleReconnect: (delayMs: number, callback: () => void) => number;
  private readonly clearScheduled: (handle: number) => void;

  private readonly subscriptions = new OrderbookSubscriptionManager();
  private readonly sequence = new SequenceTracker();
  private readonly listeners = new Set<Listener>();

  private snapshot: OrderbookFeedSnapshot = idleSnapshot();
  private orderbook = createEmptyOrderbookState("");
  private activeTicker: string | null = null;
  private reconnectAttempts = 0;
  private reconnectHandle: number | null = null;
  private staleHandle: number | null = null;
  private isDisposed = false;

  constructor(options: OrderbookFeedControllerOptions) {
    this.transport = options.transport;
    this.wsUrl = options.wsUrl;
    this.fetchSnapshot = options.fetchSnapshot;
    this.now = options.now ?? (() => Date.now());
    this.staleThresholdMs =
      options.staleThresholdMs ?? ORDERBOOK_STALE_THRESHOLD_MS;
    this.reconnectBaseMs =
      options.reconnectBaseMs ?? ORDERBOOK_RECONNECT_BASE_MS;
    this.reconnectMaxMs = options.reconnectMaxMs ?? ORDERBOOK_RECONNECT_MAX_MS;
    this.scheduleReconnect =
      options.scheduleReconnect ??
      ((delayMs, callback) =>
        globalThis.setTimeout(callback, delayMs) as unknown as number);
    this.clearScheduled =
      options.clearScheduled ??
      ((handle) => globalThis.clearTimeout(handle));

    this.transport.onMessage((payload) => {
      this.handleWireMessage(payload);
    });
    this.transport.onClose(() => {
      this.handleDisconnect("disconnected");
    });
    this.transport.onError((error) => {
      this.publish({
        ...this.snapshot,
        status: "error",
        errorMessage: error.message,
      });
      this.handleDisconnect("error");
    });
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): OrderbookFeedSnapshot {
    return this.snapshot;
  }

  async start(ticker: string): Promise<void> {
    if (this.isDisposed) {
      return;
    }

    if (this.activeTicker === ticker && this.snapshot.status !== "disconnected") {
      return;
    }

    this.clearReconnectTimer();
    this.activeTicker = ticker;
    this.orderbook = createEmptyOrderbookState(ticker);
    this.sequence.clear();
    this.publish({
      ticker,
      status: "connecting",
      pricing: null,
      topOfBook: null,
      lastSeq: null,
      lastUpdateAt: null,
      errorMessage: null,
    });

    await this.resyncFromRest(ticker);
    await this.openTransportAndSubscribe(ticker);
    this.resetStaleTimer();
  }

  async switchTicker(ticker: string): Promise<void> {
    if (this.activeTicker && this.activeTicker !== ticker) {
      this.subscriptions.unsubscribe(this.transport, [this.activeTicker]);
    }
    await this.start(ticker);
  }

  dispose(): void {
    this.isDisposed = true;
    this.clearReconnectTimer();
    this.clearStaleTimer();
    this.subscriptions.unsubscribe(
      this.transport,
      this.subscriptions.getActiveTickers() as string[],
    );
    this.transport.close();
    this.activeTicker = null;
    this.snapshot = idleSnapshot();
    this.listeners.clear();
  }

  private async openTransportAndSubscribe(ticker: string): Promise<void> {
    try {
      await this.transport.connect(this.wsUrl);
      this.reconnectAttempts = 0;
      this.subscriptions.subscribe(this.transport, ticker);
      this.publish({
        ...this.snapshot,
        status: "live",
        errorMessage: null,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "WebSocket connect failed";
      this.publish({
        ...this.snapshot,
        status: "error",
        errorMessage: message,
      });
      this.scheduleReconnectAttempt();
    }
  }

  private async resyncFromRest(ticker: string): Promise<void> {
    this.publish({
      ...this.snapshot,
      ticker,
      status: "resyncing",
      errorMessage: null,
    });

    try {
      const { yesLevels, noLevels } = await this.fetchSnapshot(ticker);
      const nowMs = this.now();
      this.orderbook = applyRestOrderbookSnapshot(
        this.orderbook,
        ticker,
        yesLevels,
        noLevels,
        nowMs,
      );
      this.sequence.clear();
      this.publishFromOrderbook("live");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Orderbook resync failed";
      throw new OrderbookFeedError(message, OrderbookFeedErrorCode.RESYNC_FAILED);
    }
  }

  private handleWireMessage(payload: string): void {
    if (!this.activeTicker) {
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      return;
    }

    const snapshotResult = kalshiOrderbookSnapshotMessageSchema.safeParse(parsed);
    if (snapshotResult.success) {
      const message = snapshotResult.data;
      if (message.msg.market_ticker !== this.activeTicker) {
        return;
      }
      this.orderbook = applyOrderbookSnapshot(
        this.orderbook,
        message,
        this.now(),
      );
      this.sequence.reset(message.seq);
      this.publishFromOrderbook("live");
      this.resetStaleTimer();
      return;
    }

    const deltaResult = kalshiOrderbookDeltaMessageSchema.safeParse(parsed);
    if (!deltaResult.success) {
      return;
    }

    const message = deltaResult.data;
    if (message.msg.market_ticker !== this.activeTicker) {
      return;
    }

    const seqResult = this.sequence.apply(message.seq);
    if (seqResult === "duplicate") {
      return;
    }

    if (seqResult === "gap") {
      void this.handleSequenceGap();
      return;
    }

    this.orderbook = applyOrderbookDelta(this.orderbook, message, this.now());
    this.publishFromOrderbook("live");
    this.resetStaleTimer();
  }

  private async handleSequenceGap(): Promise<void> {
    if (!this.activeTicker) {
      return;
    }

    this.publish({
      ...this.snapshot,
      status: "resyncing",
      errorMessage: "Orderbook sequence gap detected",
    });

    try {
      await this.resyncFromRest(this.activeTicker);
      this.subscriptions.requestSnapshot(this.transport, this.activeTicker);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Orderbook resync failed";
      this.publish({
        ...this.snapshot,
        status: "error",
        errorMessage: message,
      });
      this.scheduleReconnectAttempt();
    }
  }

  private handleDisconnect(status: OrderbookFeedStatus): void {
    if (this.isDisposed) {
      return;
    }

    this.publish({
      ...this.snapshot,
      status,
    });
    this.scheduleReconnectAttempt();
  }

  private scheduleReconnectAttempt(): void {
    if (this.isDisposed || !this.activeTicker) {
      return;
    }

    this.clearReconnectTimer();
    const delay = Math.min(
      this.reconnectBaseMs * 2 ** this.reconnectAttempts,
      this.reconnectMaxMs,
    );
    this.reconnectAttempts += 1;

    this.reconnectHandle = this.scheduleReconnect(delay, () => {
      if (!this.activeTicker) {
        return;
      }
      void this.openTransportAndSubscribe(this.activeTicker);
    });
  }

  private resetStaleTimer(): void {
    this.clearStaleTimer();
    this.staleHandle = this.scheduleReconnect(this.staleThresholdMs, () => {
      if (!this.activeTicker) {
        return;
      }

      const lastUpdateMs = this.orderbook.updatedAtMs;
      const nowMs = this.now();
      if (
        lastUpdateMs == null ||
        nowMs - lastUpdateMs >= this.staleThresholdMs
      ) {
        this.publish({
          ...this.snapshot,
          status: "stale",
        });
        void this.handleSequenceGap();
      } else {
        this.resetStaleTimer();
      }
    });
  }

  private publishFromOrderbook(status: OrderbookFeedStatus): void {
    const topOfBook = extractTopOfBook(this.orderbook);
    const updatedAt = new Date(this.orderbook.updatedAtMs ?? this.now()).toISOString();
    const pricing =
      topOfBook.yesBidCents == null &&
      topOfBook.yesAskCents == null &&
      topOfBook.noBidCents == null &&
      topOfBook.noAskCents == null
        ? null
        : mapTopOfBookToContractPricing(topOfBook, updatedAt);

    this.publish({
      ticker: this.orderbook.marketTicker,
      status,
      pricing,
      topOfBook,
      lastSeq: this.orderbook.lastSeq,
      lastUpdateAt: updatedAt,
      errorMessage: null,
    });
  }

  private publish(next: OrderbookFeedSnapshot): void {
    this.snapshot = next;
    for (const listener of this.listeners) {
      listener(next);
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectHandle != null) {
      this.clearScheduled(this.reconnectHandle);
      this.reconnectHandle = null;
    }
  }

  private clearStaleTimer(): void {
    if (this.staleHandle != null) {
      this.clearScheduled(this.staleHandle);
      this.staleHandle = null;
    }
  }
}
