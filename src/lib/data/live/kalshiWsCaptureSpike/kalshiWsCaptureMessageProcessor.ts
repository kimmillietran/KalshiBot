import {
  kalshiOrderbookDeltaMessageSchema,
  kalshiOrderbookSnapshotMessageSchema,
} from "@/features/market-data/orderbook/schemas";

import { OrderbookCaptureBook } from "./orderbookCaptureBook";
import type {
  BtcSpotCaptureRecord,
  KalshiTopOfBookCaptureRecord,
  KalshiWsCaptureOrderbookDiagnostics,
  KalshiWsCaptureSpikeConfig,
  RawKalshiWsCaptureMessage,
} from "./kalshiWsCaptureSpikeTypes";

export type CaptureWriter = {
  appendRawMessage: (record: RawKalshiWsCaptureMessage) => void;
  appendTopOfBook: (record: KalshiTopOfBookCaptureRecord) => void;
  appendBtcSpot: (record: BtcSpotCaptureRecord) => void;
};

function createEmptyDiagnostics(): KalshiWsCaptureOrderbookDiagnostics {
  return {
    messagesReceived: 0,
    snapshotsReceived: 0,
    deltasReceived: 0,
    unknownMessagesReceived: 0,
    sequenceMin: null,
    sequenceMax: null,
    sequenceGapCount: 0,
    outOfOrderCount: 0,
    reconnectCount: 0,
    marketsAwaitingSnapshot: 0,
    validBookStateDurationMs: 0,
    invalidBookStateDurationMs: 0,
    validTopOfBookRecords: 0,
    marketsWithValidBook: 0,
  };
}

function trackSequence(
  diagnostics: KalshiWsCaptureOrderbookDiagnostics,
  sequence: number | null,
): void {
  if (sequence === null) {
    return;
  }

  diagnostics.sequenceMin =
    diagnostics.sequenceMin === null
      ? sequence
      : Math.min(diagnostics.sequenceMin, sequence);
  diagnostics.sequenceMax =
    diagnostics.sequenceMax === null
      ? sequence
      : Math.max(diagnostics.sequenceMax, sequence);
}

/** Processes raw WS payloads into orderbook state and capture records. */
export class KalshiWsCaptureMessageProcessor {
  readonly diagnostics: KalshiWsCaptureOrderbookDiagnostics = createEmptyDiagnostics();
  readonly books = new Map<string, OrderbookCaptureBook>();
  private captureCounter = 0;

  constructor(
    private readonly input: {
      runId: string;
      seriesTicker: string;
      config: KalshiWsCaptureSpikeConfig;
      writer: CaptureWriter;
      eventTickers?: Record<string, string | null>;
      now: () => Date;
      monotonicNowMs: () => number;
    },
  ) {}

  private nextCaptureId(): string {
    this.captureCounter += 1;
    return `${this.input.runId}-${this.captureCounter}`;
  }

  private getOrCreateBook(marketTicker: string): OrderbookCaptureBook {
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

  processRawPayload(rawPayload: unknown): void {
    this.diagnostics.messagesReceived += 1;
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

    const rawRecord: RawKalshiWsCaptureMessage = {
      captureId: this.nextCaptureId(),
      runId: this.input.runId,
      receivedAtLocal,
      receivedAtMonotonicMs,
      source: "kalshi-ws",
      channel: messageType?.includes("orderbook") ? "orderbook_delta" : null,
      marketTicker,
      sequence,
      messageType,
      exchangeTimestampMs,
      rawPayload: payload,
    };
    this.input.writer.appendRawMessage(rawRecord);
    trackSequence(this.diagnostics, sequence);

    if (messageType === "orderbook_snapshot") {
      const parsed = kalshiOrderbookSnapshotMessageSchema.safeParse(payload);
      if (!parsed.success) {
        this.diagnostics.unknownMessagesReceived += 1;
        return;
      }

      this.diagnostics.snapshotsReceived += 1;
      const book = this.getOrCreateBook(parsed.data.msg.market_ticker);
      book.applySnapshot(parsed.data);
      this.emitTopOfBook(book, receivedAtLocal, exchangeTimestampMs, messageType);
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
      } else if (result === "duplicate") {
        this.diagnostics.outOfOrderCount += 1;
      }

      this.emitTopOfBook(book, receivedAtLocal, exchangeTimestampMs, messageType);
      return;
    }

    this.diagnostics.unknownMessagesReceived += 1;
  }

  private emitTopOfBook(
    book: OrderbookCaptureBook,
    receivedAtLocal: string,
    exchangeTimestampMs: number | null,
    rawMessageType: string,
  ): void {
    const record = book.toTopOfBookRecord({
      runId: this.input.runId,
      receivedAtLocal,
      exchangeTimestampMs,
      rawMessageType,
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
