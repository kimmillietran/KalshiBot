import {
  kalshiOrderbookDeltaMessageSchema,
  kalshiOrderbookSnapshotMessageSchema,
} from "@/features/market-data/orderbook/schemas";

import { OrderbookCaptureBook } from "./orderbookCaptureBook";
import type { ForwardCaptureWriter } from "./jsonlForwardCaptureWriter";
import type {
  ForwardCaptureOrderbookDiagnostics,
  ForwardQuoteCaptureConfig,
  ForwardRawKalshiWsRecord,
  ForwardTopOfBookRecord,
} from "./forwardQuoteCaptureTypes";

export type LatestBtcSpot = {
  priceUsd: number;
  receivedAtLocal: string;
  source: string;
} | null;

function createEmptyDiagnostics(): ForwardCaptureOrderbookDiagnostics {
  return {
    rawMessageCount: 0,
    snapshotsReceived: 0,
    deltasReceived: 0,
    unknownMessagesReceived: 0,
    sequenceGapCount: 0,
    outOfOrderCount: 0,
    resyncAttemptCount: 0,
    resyncSuccessCount: 0,
    validTopOfBookRecords: 0,
    marketsWithValidBook: 0,
    marketsAwaitingSnapshot: 0,
    validBookStateDurationMs: 0,
    invalidBookStateDurationMs: 0,
  };
}

export class ForwardCaptureMessageProcessor {
  readonly diagnostics: ForwardCaptureOrderbookDiagnostics = createEmptyDiagnostics();
  readonly books = new Map<string, OrderbookCaptureBook>();
  private captureCounter = 0;
  private lastTopOfBookEmitMs = new Map<string, number>();

  constructor(
    private readonly input: {
      runId: string;
      seriesTicker: string;
      config: ForwardQuoteCaptureConfig;
      writer: ForwardCaptureWriter;
      eventTickers?: Record<string, string | null>;
      now: () => Date;
      monotonicNowMs: () => number;
      onSequenceGap?: (marketTicker: string) => void;
      getLatestBtcSpot?: () => LatestBtcSpot;
    },
  ) {}

  private nextCaptureId(): string {
    this.captureCounter += 1;
    return `${this.input.runId}-${this.captureCounter}`;
  }

  getOrCreateBook(marketTicker: string): OrderbookCaptureBook {
    const existing = this.books.get(marketTicker);
    if (existing) {
      return existing;
    }

    const book = new OrderbookCaptureBook({
      marketTicker,
      seriesTicker: this.input.seriesTicker,
      eventTicker: this.input.eventTickers?.[marketTicker] ?? null,
    });
    this.books.set(marketTicker, book);
    return book;
  }

  markMarketClosed(marketTicker: string): void {
    const book = this.books.get(marketTicker);
    if (book) {
      book.markClosed();
    }
  }

  markResyncing(marketTicker: string): void {
    const book = this.getOrCreateBook(marketTicker);
    book.markResyncing();
    this.diagnostics.resyncAttemptCount += 1;
  }

  recordResyncSuccess(marketTicker: string): void {
    if (this.books.get(marketTicker)?.bookState === "valid") {
      this.diagnostics.resyncSuccessCount += 1;
    }
  }

  processRawPayload(rawPayload: unknown): void {
    this.diagnostics.rawMessageCount += 1;
    const receivedAtLocal = this.input.now().toISOString();
    const receivedAtMonotonicMs = this.input.monotonicNowMs();

    const payload =
      typeof rawPayload === "string" ? JSON.parse(rawPayload) : rawPayload;
    const messageType =
      typeof payload === "object"
      && payload !== null
      && "type" in payload
      && typeof payload.type === "string"
        ? payload.type
        : null;
    const sequence =
      typeof payload === "object"
      && payload !== null
      && "seq" in payload
      && typeof payload.seq === "number"
        ? payload.seq
        : null;
    const marketTicker =
      typeof payload === "object"
      && payload !== null
      && "msg" in payload
      && typeof payload.msg === "object"
      && payload.msg !== null
      && "market_ticker" in payload.msg
      && typeof payload.msg.market_ticker === "string"
        ? payload.msg.market_ticker
        : null;
    const eventTicker = marketTicker
      ? this.input.eventTickers?.[marketTicker] ?? null
      : null;
    const exchangeTimestampMs =
      typeof payload === "object"
      && payload !== null
      && "msg" in payload
      && typeof payload.msg === "object"
      && payload.msg !== null
      && "ts_ms" in payload.msg
      && typeof payload.msg.ts_ms === "number"
        ? payload.msg.ts_ms
        : null;

    const rawRecord: ForwardRawKalshiWsRecord = {
      runId: this.input.runId,
      captureId: this.nextCaptureId(),
      receivedAtLocal,
      receivedAtMonotonicMs,
      source: "kalshi-ws",
      channel: messageType?.includes("orderbook") ? "orderbook_delta" : null,
      messageType,
      marketTicker,
      eventTicker,
      seriesTicker: this.input.seriesTicker,
      sequence,
      exchangeTimestampMs,
      rawPayload: payload,
    };
    this.input.writer.appendRawKalshiWs(rawRecord);

    if (messageType === "orderbook_snapshot") {
      const parsed = kalshiOrderbookSnapshotMessageSchema.safeParse(payload);
      if (!parsed.success) {
        this.diagnostics.unknownMessagesReceived += 1;
        return;
      }

      this.diagnostics.snapshotsReceived += 1;
      const book = this.getOrCreateBook(parsed.data.msg.market_ticker);
      const wasResyncing = book.bookState === "resyncing" || book.bookState === "gap-detected";
      book.applySnapshot(parsed.data);
      if (wasResyncing) {
        this.recordResyncSuccess(parsed.data.msg.market_ticker);
      }
      this.emitTopOfBook(book, receivedAtLocal, exchangeTimestampMs);
      return;
    }

    if (messageType === "orderbook_delta") {
      const parsed = kalshiOrderbookDeltaMessageSchema.safeParse(payload);
      if (!parsed.success) {
        this.diagnostics.unknownMessagesReceived += 1;
        return;
      }

      this.diagnostics.deltasReceived += 1;
      const book = this.getOrCreateBook(parsed.data.msg.market_ticker);
      const result = book.applyDelta(parsed.data);
      if (result === "gap") {
        this.diagnostics.sequenceGapCount += 1;
        this.input.onSequenceGap?.(parsed.data.msg.market_ticker);
      } else if (result === "duplicate") {
        this.diagnostics.outOfOrderCount += 1;
      }

      this.emitTopOfBook(book, receivedAtLocal, exchangeTimestampMs);
      return;
    }

    this.diagnostics.unknownMessagesReceived += 1;
  }

  private emitTopOfBook(
    book: OrderbookCaptureBook,
    receivedAtLocal: string,
    exchangeTimestampMs: number | null,
  ): void {
    const throttleMs = this.input.config.topOfBookThrottleMs;
    if (throttleMs > 0) {
      const lastEmit = this.lastTopOfBookEmitMs.get(book.marketTicker) ?? 0;
      const nowMs = this.input.monotonicNowMs();
      if (nowMs - lastEmit < throttleMs) {
        return;
      }
      this.lastTopOfBookEmitMs.set(book.marketTicker, nowMs);
    }

    const btcSpot = this.input.getLatestBtcSpot?.() ?? null;
    const record: ForwardTopOfBookRecord = book.toTopOfBookRecord({
      runId: this.input.runId,
      receivedAtLocal,
      exchangeTimestampMs,
      btcSpotPriceUsd: btcSpot?.priceUsd ?? null,
      btcSpotReceivedAtLocal: btcSpot?.receivedAtLocal ?? null,
      btcSpotSource: btcSpot?.source ?? null,
    });
    this.input.writer.appendTopOfBook(record);
    this.diagnostics.validTopOfBookRecords += 1;

    if (record.bookState === "valid") {
      this.diagnostics.validBookStateDurationMs += 1;
    } else {
      this.diagnostics.invalidBookStateDurationMs += 1;
    }
  }

  finalize(): void {
    this.diagnostics.marketsAwaitingSnapshot = [...this.books.values()].filter(
      (book) => book.bookState === "awaiting-snapshot",
    ).length;
    this.diagnostics.marketsWithValidBook = [...this.books.values()].filter(
      (book) => book.bookState === "valid",
    ).length;
  }
}
